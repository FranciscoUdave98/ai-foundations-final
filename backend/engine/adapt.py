"""Adapt the plan after a weekly check-in. Plain code, so every change has a stated reason.

The check-in describes week W (what happened). Changes go to week W+1 (and W+2 for illness),
never to the race itself, and the result always passes the plan checker. Missed sessions are not
made up: cramming them into the next week is how runners get hurt.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from engine import plan_checker as pc
from engine.plan_expander import make_safe, r05
from models import CheckIn, CheckResult, DiffRow, Plan, PlanWeek, WeekDiff, Workout

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
QUALITY = {"tempo", "threshold", "interval", "race_pace"}
LABEL = {"easy": "Easy", "recovery": "Recovery", "long": "Long run", "tempo": "Tempo", "threshold": "Threshold",
         "interval": "Intervals", "race_pace": "Race pace", "strides": "Strides", "strength": "Gym", "race": "RACE"}


@dataclass
class Adaptation:
    plan: Plan
    rules: list[str] = field(default_factory=list)
    diff: list[DiffRow] = field(default_factory=list)
    weeks: list[WeekDiff] = field(default_factory=list)
    checker_held: list[str] = field(default_factory=list)
    check: CheckResult | None = None

    @property
    def changed(self) -> bool:
        return any(r.before != r.after for r in self.diff)


def is_light(ci: CheckIn, plan: Plan, week: int) -> bool:
    """Nothing moved past a threshold: one call makes the tweak, the council stays home."""
    if ci.illness != "none" or ci.red_flag_symptoms or ci.long_run_day:
        return False
    if ci.pain_location or (ci.pain_score or 0) >= 3:
        return False
    if (ci.sleep_hours is not None and ci.sleep_hours < 6.5) or (ci.fatigue or 0) >= 4:
        return False
    w = next((x for x in plan.weeks if x.index == week), None)
    missed = [wo for wo in (w.workouts if w else []) if DAYS[wo.day.weekday()] in ci.missed_days and wo.type in pc.RUN_TYPES]
    return len(missed) <= 1 and not any(wo.type == "long" for wo in missed)


def _runs(w: PlanWeek) -> list[Workout]:
    return [wo for wo in w.workouts if wo.type in pc.RUN_TYPES and wo.type != "race"]


def _scale(w: PlanWeek, f: float) -> None:
    for wo in _runs(w):
        wo.distance_km = r05(wo.distance_km * f)


def _easy(wo: Workout, pace: str, why: str) -> None:
    wo.type, wo.target_pace, wo.purpose = "easy", pace, why


def _no_quality(w: PlanWeek, pace: str, why: str) -> None:
    for wo in w.workouts:
        if wo.type in QUALITY:
            _easy(wo, pace, why)


def _fmt(items: list[Workout]) -> str:
    out = []
    for wo in items:
        if wo.type == "rest":
            continue
        mark = " ✕ missed" if wo.status == "missed" else ""
        out.append(f"{LABEL.get(wo.type, wo.type)}{f' {wo.distance_km:g} km' if wo.distance_km else ''}{mark}")
    return " + ".join(out) or "Rest"


def adapt(plan: Plan, week: int, ci: CheckIn, baseline_week_km: float | None, baseline_peak_km: float | None,
          easy_pace: str, km_request: float | None = None, extra_caution: bool = False) -> Adaptation:
    new = plan.model_copy(deep=True)
    by = {w.index: w for w in new.weeks}
    reasons: dict[int, list[str]] = defaultdict(list)
    rules: list[str] = []
    this, nxt, nxt2 = by.get(week), by.get(week + 1), by.get(week + 2)
    if this is None:
        raise ValueError(f"Plan has no week {week}")
    if nxt is not None and nxt.phase == "race":
        nxt2 = None                                     # race week: only light touches, never the race

    # 1. What happened this week
    for wo in this.workouts:
        if wo.type in pc.RUN_TYPES or wo.type == "strength":
            if DAYS[wo.day.weekday()] in ci.missed_days:
                wo.status = "missed"
            elif ci.completed_all or ci.missed_days:
                wo.status = "done"
    if ci.missed_days:
        reasons[week].append("You told us")
    missed_runs = [wo for wo in this.workouts if wo.status == "missed" and wo.type in pc.RUN_TYPES]

    # 2. Next week, by what the check-in says (most protective rule first)
    if nxt is not None:
        if ci.illness == "still_sick":
            why = "Still sick: two rest days, then easy running only"
            for wo in sorted(_runs(nxt), key=lambda x: x.day)[:2]:
                wo.type, wo.distance_km, wo.target_pace, wo.purpose = "rest", 0.0, None, "Rest: let the illness clear"
            _no_quality(nxt, easy_pace, "Easy only while you recover")
            _scale(nxt, 0.8)
            reasons[nxt.index].append(why)
            rules.append(why)
        elif ci.illness == "recovering":
            why = "Getting over an illness: easy running only, about 25% less"
            _no_quality(nxt, easy_pace, "Easy only while you recover")
            _scale(nxt, 0.75)
            reasons[nxt.index].append(why)
            rules.append(why)
        if ci.illness != "none" and nxt2 is not None:
            _scale(nxt2, 0.9)
            reasons[nxt2.index].append("Ease back in after illness: 10% less")
        if ci.illness == "none" and (ci.pain_location or (ci.pain_score or 0) >= 3):
            where = ci.pain_location or "the sore spot"
            why = f"Sore {where}: no hard sessions, shorter long run, 20% less; stop if it gets worse"
            _no_quality(nxt, easy_pace, f"Easy: protect {where}")
            _scale(nxt, 0.8)
            for wo in nxt.workouts:
                if wo.type == "long":
                    wo.distance_km = r05(wo.distance_km * 0.8)
            reasons[nxt.index].append(why)
            rules.append(why)
        tired = (ci.sleep_hours is not None and ci.sleep_hours < 6) or (ci.fatigue or 0) >= 4
        if tired and ci.illness == "none":
            hard = [wo for wo in nxt.workouts if wo.type in QUALITY]
            if hard:
                pick = next((wo for wo in hard if wo.type == "interval"), hard[0])
                _easy(pick, easy_pace, "Easy instead of the hard session: sleep and fatigue first")
            _scale(nxt, 0.9)
            why = (f"Short on sleep ({ci.sleep_hours:g} h)" if ci.sleep_hours is not None and ci.sleep_hours < 6
                   else "High fatigue") + ": one hard session becomes easy, 10% less"
            reasons[nxt.index].append(why)
            rules.append(why)
        if len(missed_runs) >= 3 and ci.illness == "none":
            _scale(nxt, 0.85)
            why = f"{len(missed_runs)} sessions missed: a gentler re-entry week (15% less), nothing made up"
            reasons[nxt.index].append(why)
            rules.append(why)
        elif missed_runs and ci.illness == "none":
            rules.append("Missed sessions are not made up next week; the plan just carries on")
        if ci.long_run_day and nxt.phase != "race":
            target = nxt.workouts[0].day.toordinal() - nxt.workouts[0].day.weekday() + DAYS.index(ci.long_run_day)
            long_wo = next((wo for wo in nxt.workouts if wo.type == "long"), None)
            if long_wo:
                for wo in nxt.workouts:
                    if wo.day.toordinal() == target and wo is not long_wo:
                        wo.day = long_wo.day                 # the session on the new day takes the old long-run day
                long_wo.day = type(long_wo.day).fromordinal(target)
                nxt.workouts.sort(key=lambda w: (w.day, w.type == "strength"))
                why = f"Long run moved to {ci.long_run_day}, as you asked"
                reasons[nxt.index].append(why)
                rules.append(why)
        if extra_caution:
            _no_quality(nxt, easy_pace, "Easy: Dr. Taper's call")
            _scale(nxt, 0.9)
            why = "Dr. Taper vetoed: next week is easy only, 10% less"
            reasons[nxt.index].append(why)
            rules.append(why)
            if ci.illness != "none" and nxt2 is not None:
                _no_quality(nxt2, easy_pace, "Easy: still coming back from illness (Dr. Taper's call)")
                reasons[nxt2.index].append("Dr. Taper vetoed: no hard sessions until you're well")
                rules.append("Dr. Taper vetoed: the week after stays easy too")
    if not rules:
        rules.append("All sessions on track: no changes" if not missed_runs else "One session missed: no changes; it is not made up")

    # 3. The checker has the last word
    held: list[str] = []
    check = pc.check_plan(new, baseline_week_km, baseline_peak_km)
    if not check.passed:
        new, fixes, check = make_safe(new, baseline_week_km, baseline_peak_km, easy_pace=easy_pace)
        for f in fixes:
            held.append(f"Plan checker: {f}")
            try:
                reasons[int(f.split(":")[0].split()[1])].append(f"Plan checker: {f.split(': ', 1)[1]}")
            except (IndexError, ValueError):
                pass
    if km_request:
        cap = pc.peak_cap(baseline_peak_km) if baseline_peak_km else pc.MAX_WEEK_KM
        if km_request > cap:
            held.append(f"You asked for {km_request:g} km a week. The ceiling for you is {cap:.0f} km "
                        f"(1.5x your recent peak of {baseline_peak_km:g} km), and {pc.MAX_WEEK_KM:g} km is the hard limit "
                        "for anyone. The plan stays inside it.")

    # 4. Old vs new, day by day, for the weeks that can change
    old = {w.index: w for w in plan.weeks}
    diff: list[DiffRow] = []
    weeks: list[WeekDiff] = []
    for idx in sorted({week, week + 1, week + 2} & set(by)):
        ow, nw = old[idx], by[idx]
        days = sorted({wo.day for wo in ow.workouts} | {wo.day for wo in nw.workouts})
        for d in days:
            before = _fmt([wo for wo in ow.workouts if wo.day == d])
            after = _fmt([wo for wo in nw.workouts if wo.day == d])
            if before != after:
                diff.append(DiffRow(day=d, week=idx, before=before, after=after,
                                    reason="; ".join(dict.fromkeys(reasons[idx])) or "Plan checker"))
        weeks.append(WeekDiff(week=idx, km_before=pc._run_km(ow), km_after=pc._run_km(nw)))
    return Adaptation(plan=new, rules=rules, diff=diff, weeks=weeks, checker_held=list(dict.fromkeys(held)), check=check)
