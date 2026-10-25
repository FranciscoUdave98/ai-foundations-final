"""Turn the Plan Builder's week outlines into a dated, paced plan, and make plans safe. No LLM.

Code computes, AI explains: the Plan Builder decides the shape (phase, weekly km, long run,
key sessions). This module puts every workout on a date with a pace from the athlete's own
pace table, and make_safe() repairs anything the plan checker rejects ("the safest version wins").
"""

from __future__ import annotations

import math
from datetime import date, timedelta

from engine import plan_checker as pc
from models import HARD_TYPES, PaceTable, Plan, PlanWeek, StrengthPlan, WeekSpec, Workout

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MAX_PLAN_WEEKS = 30
MIN_EASY_KM = 4.0
EASY_WEIGHTS = {2: 0.42, 4: 0.25, 5: 0.33}              # Wed, Fri, Sat


def r05(x: float) -> float:
    return max(0.0, round(x * 2) / 2)


def plan_window(today: date, race_date: date, start: date | None = None) -> tuple[date, int]:
    """Plan start (this Monday by default: today if it is a Monday) and weeks until race week, inclusive.

    Plans run up to 30 weeks, so a race 28 weeks out starts now instead of after an unexplained gap.
    """
    if start is None:
        start = today if today.weekday() == 0 else today + timedelta(days=7 - today.weekday())
    start = start - timedelta(days=start.weekday())
    race_monday = race_date - timedelta(days=race_date.weekday())
    weeks = (race_monday - start).days // 7 + 1
    if weeks > MAX_PLAN_WEEKS:
        start = race_monday - timedelta(weeks=MAX_PLAN_WEEKS - 1)
        weeks = MAX_PLAN_WEEKS
    return start, max(1, weeks)


def _zone(paces: PaceTable, name: str) -> str:
    for z in paces.zones:
        if z.name == name or (name == "race" and z.name.endswith("race pace")):
            return z.label
    return ""


def _quality_workout(day: date, s, paces: PaceTable) -> Workout:
    kind = {"tempo": "tempo", "threshold": "threshold", "interval": "interval", "hills": "interval",
            "race_pace": "race_pace", "strides": "easy"}[s.kind]
    zone = {"tempo": "Threshold", "threshold": "Threshold", "interval": "Interval", "hills": "Interval",
            "race_pace": "race", "strides": "Easy"}[s.kind]
    pace = _zone(paces, zone) if s.kind != "hills" else "hard uphill effort"
    return Workout(day=day, type=kind, distance_km=r05(s.km), target_pace=pace, purpose=s.description[:90])


def _normalize_specs(specs: list[WeekSpec], n: int) -> list[WeekSpec]:
    specs = sorted(specs, key=lambda w: w.week)[:n]
    while len(specs) < n:                                   # builder came back short: hold the last week
        last = specs[-1] if specs else WeekSpec(week=0, phase="base", target_km=30, long_run_km=10)
        specs.append(last.model_copy(update={"week": len(specs) + 1}))
    for i, s in enumerate(specs):
        s.week = i + 1
    specs[-1] = specs[-1].model_copy(update={"phase": "race", "long_run_km": 0})
    return specs


def zone_seconds(paces: PaceTable, name: str) -> float:
    """Middle of a pace zone, in seconds per km (used to estimate run minutes)."""
    for z in paces.zones:
        if z.name == name:
            return (z.fast_s_per_km + z.slow_s_per_km) / 2
    return 330.0


def expand(specs: list[WeekSpec], start: date, race_date: date, race_km: float, race_name: str,
           paces: PaceTable, runs_per_week: float = 5, goal_time: str | None = None, prefs=None) -> Plan:
    n = (race_date - timedelta(days=race_date.weekday()) - start).days // 7 + 1
    specs = _normalize_specs(specs, n)
    weeks = []
    for i, spec in enumerate(specs):
        monday = start + timedelta(weeks=i)
        if spec.phase == "race":
            weeks.append(_race_week(spec, monday, race_date, race_km, race_name, paces, prefs))
        elif prefs is not None:
            weeks.append(_pref_week(spec, monday, paces, prefs))
        else:
            weeks.append(_normal_week(spec, monday, paces, runs_per_week))
    return Plan(race_name=race_name, race_date=race_date, race_distance_km=race_km, goal_time=goal_time, weeks=weeks)


def _normal_week(spec: WeekSpec, monday: date, paces: PaceTable, runs_per_week: float) -> PlanWeek:
    day = lambda n: monday + timedelta(days=n)  # noqa: E731
    q = spec.quality[:2]
    wos: list[Workout] = [Workout(day=day(0), type="rest", purpose="Rest or gym")]
    if q:
        wos.append(_quality_workout(day(1), q[0], paces))
    if len(q) > 1:
        wos.append(_quality_workout(day(3), q[1], paces))
    # Code enforces the long-run cap itself (35% of the week, 50% under 40 km, max 35 km); the trimmed
    # kilometers move to the easy runs, so the week's total stays what the Plan Builder asked for.
    share = pc.LONG_RUN_SHARE if spec.target_km >= 40 else pc.LONG_RUN_SHARE_LOW
    # (1 km of margin: easy runs are rounded to 0.5 km, so the real week can land a little under target)
    long_km = min(r05(spec.long_run_km), pc.LONG_RUN_MAX_KM, math.floor(share * (spec.target_km - 1) * 2) / 2)
    if long_km:
        wos.append(Workout(day=day(6), type="long", distance_km=long_km, target_pace=_zone(paces, "Long run"),
                           purpose=f"Long run. {spec.focus}"[:90]))
    # easy slots: Wed always, then Sat, Fri; Tue/Thu too when they have no quality session
    slots = [2]
    if runs_per_week >= 4.5:
        slots.append(5)
    if runs_per_week >= 5.5:
        slots.append(4)
    if not q and runs_per_week >= 3.5:
        slots.append(1)
    if len(q) < 2 and runs_per_week >= 4.5:
        slots.append(3)
    used = sum(w.distance_km for w in wos)
    easy_total = max(0.0, spec.target_km - used)
    while slots and easy_total / len(slots) < MIN_EASY_KM:
        slots.pop()
    weights = {d: EASY_WEIGHTS.get(d, 0.3) for d in slots}
    total_w = sum(weights.values()) or 1
    for d in sorted(slots):
        km = r05(easy_total * weights[d] / total_w)
        if km:
            wos.append(Workout(day=day(d), type="easy", distance_km=km, target_pace=_zone(paces, "Easy"),
                               purpose="Easy aerobic run; conversational pace"))
    for d in range(7):
        if not any(w.day == day(d) for w in wos):
            wos.append(Workout(day=day(d), type="rest", purpose="Rest"))
    return PlanWeek(index=spec.week, phase=spec.phase, workouts=sorted(wos, key=lambda w: w.day))


def _pref_week(spec: WeekSpec, monday: date, paces: PaceTable, prefs) -> PlanWeek:
    """A week laid out on the athlete's chosen days, with every run inside their time limits."""
    from engine.prefs import DAYS as NAMES, template
    roles = template(prefs)
    easy_s, long_s = zone_seconds(paces, "Easy"), zone_seconds(paces, "Long run")
    wk_cap = math.floor(prefs.max_weekday_min * 60 / easy_s * 2) / 2
    lg_cap = math.floor(prefs.max_long_min * 60 / long_s * 2) / 2
    share = pc.LONG_RUN_SHARE if spec.target_km >= 40 else pc.LONG_RUN_SHARE_LOW
    long_km = min(r05(spec.long_run_km), pc.LONG_RUN_MAX_KM, math.floor(share * (spec.target_km - 1) * 2) / 2, lg_cap)
    q = list(spec.quality[:2])
    wos: list[Workout] = []
    easy_days: list[date] = []
    for i, name in enumerate(NAMES):
        day = monday + timedelta(days=i)
        role = roles[name]
        if role == "rest":
            wos.append(Workout(day=day, type="rest", purpose="Rest"))
        elif role == "long" and long_km:
            wos.append(Workout(day=day, type="long", distance_km=long_km, target_pace=_zone(paces, "Long run"),
                               purpose=f"Long run. {spec.focus}"[:90]))
        elif role == "quality" and q:
            wo = _quality_workout(day, q.pop(0), paces)
            wo.distance_km = min(wo.distance_km, wk_cap)
            wos.append(wo)
        else:
            easy_days.append(day)
    remaining = max(0.0, spec.target_km - sum(w.distance_km for w in wos))
    wos += _varied_easy(easy_days, remaining, spec.week, wk_cap, paces,
                        long_day=next((w.day for w in wos if w.type == "long"), None))
    return PlanWeek(index=spec.week, phase=spec.phase, workouts=sorted(wos, key=lambda w: w.day))


# Easy days aren't all the same: a short recovery jog after the long run, one medium run, strides on some weeks.
# The pattern rotates week to week; every run stays under the weekday cap and the week's total is kept.
_EASY_FLAVORS = [
    ("medium", 1.3, "Steady medium run; still conversational"),
    ("easy", 1.0, "Easy aerobic run; conversational pace"),
    ("strides", 0.9, "Easy run + 6 x 20 s strides at the end"),
    ("easy", 1.0, "Easy run on a different route or surface"),
]


def _varied_easy(days: list[date], total: float, week: int, cap: float, paces: PaceTable,
                 long_day: date | None) -> list[Workout]:
    if not days:
        return []
    plan: list[tuple[date, str, float, str]] = []
    for j, d in enumerate(days):
        if long_day and d == long_day + timedelta(days=1):
            plan.append((d, "recovery", 0.65, "Recovery jog: very easy, legs loose after the long run"))
            continue
        kind, w, why = _EASY_FLAVORS[(j + week) % len(_EASY_FLAVORS)]
        plan.append((d, kind, w, why))
    weight_sum = sum(p[2] for p in plan) or 1
    out, left = [], total
    for j, (d, kind, w, why) in enumerate(plan):
        rest_n = len(plan) - j
        km = r05(total * w / weight_sum) if rest_n > 1 else r05(left)
        km = min(cap, max(3.0, km))
        left -= km
        wtype = "recovery" if kind == "recovery" else "easy"
        zone = "Recovery" if kind == "recovery" else "Easy"
        out.append(Workout(day=d, type=wtype, distance_km=km, target_pace=_zone(paces, zone), purpose=why))
    return out


def _race_week(spec: WeekSpec, monday: date, race_date: date, race_km: float, race_name: str,
               paces: PaceTable, prefs=None) -> PlanWeek:
    wos = [Workout(day=race_date, type="race", distance_km=race_km, target_pace=_zone(paces, "race"),
                   purpose=f"Race day: {race_name}"[:90])]
    before = [(race_date - monday).days - k for k in (2, 4, 5, 3)]          # day-2, day-4, day-5, day-3
    before = [d for d in before if d >= 0]
    if prefs is not None:                                                    # never run on a chosen rest day
        names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        before = [d for d in before if names[d] not in prefs.rest_days][: max(0, prefs.runs_per_week - 1)]
    budget = max(0.0, spec.target_km)
    plan_days: list[tuple[int, str, float]] = []
    if budget and before:
        if len(before) >= 2 and spec.quality:
            plan_days.append((before[1], "race_pace", r05(min(spec.quality[0].km, budget * 0.4))))
        rest_km = budget - sum(k for _, _, k in plan_days)
        # With preferences, race week keeps the chosen number of runs (the race counts as one), as short shakeouts.
        easy_days = [d for d in before if d not in {p[0] for p in plan_days}][: None if prefs is not None else 2]
        for d in easy_days:
            plan_days.append((d, "easy", r05(rest_km / len(easy_days))))
    for d, kind, km in plan_days:
        if km <= 0:
            continue
        if kind == "race_pace":
            wos.append(Workout(day=monday + timedelta(days=d), type="race_pace", distance_km=km,
                               target_pace=_zone(paces, "race"), purpose="Short race-pace sharpener"))
        else:
            purpose = "Easy shakeout with 4 x 20 s strides" if d == (race_date - monday).days - 2 else "Easy run"
            wos.append(Workout(day=monday + timedelta(days=d), type="easy", distance_km=km,
                               target_pace=_zone(paces, "Easy"), purpose=purpose))
    for d in range(7):
        dd = monday + timedelta(days=d)
        if not any(w.day == dd for w in wos):
            wos.append(Workout(day=dd, type="rest", purpose="Recovery" if dd > race_date else "Rest"))
    return PlanWeek(index=spec.week, phase="race", workouts=sorted(wos, key=lambda w: w.day))


def baseline_specs(n: int, avg_week_km: float | None, longest_km: float | None, race_km: float) -> list[WeekSpec]:
    """A conservative plan built in code from the athlete's own numbers. Used when the Plan Builder's
    draft is unusable or the budget stopped the council before it produced one."""
    from models import Session
    start = max(10.0, 0.85 * (avg_week_km or 20))
    peak = min(start * 1.3, start + 25)
    taper = 1 if race_km <= 10 else 2 if race_km <= 21.1 else 3
    build = max(1, n - taper - 1)
    out, km = [], start
    for i in range(n):
        if i == n - 1:
            out.append(WeekSpec(week=i + 1, phase="race", target_km=r05(0.4 * peak), long_run_km=0,
                                quality=[Session(kind="race_pace", km=r05(min(8, 0.15 * peak)), description="Short race-pace sharpener")],
                                focus="Race week"))
            continue
        if i >= n - 1 - taper:
            j = i - (n - 1 - taper)
            out.append(WeekSpec(week=i + 1, phase="taper", target_km=r05(peak * (0.75 - 0.15 * j)),
                                long_run_km=r05(min(0.3 * peak, (longest_km or 12))), focus="Taper: less volume, keep some speed",
                                quality=[Session(kind="race_pace", km=r05(0.15 * peak), description="Race-pace segments")]))
            continue
        down = (i + 1) % 4 == 0
        week_km = r05(km * 0.8 if down else km)
        q = [] if i == 0 or down else [Session(kind="tempo" if i % 2 else "interval", km=r05(0.15 * week_km),
                                               description="Steady tempo" if i % 2 else "5 x 1 km at interval pace")]
        out.append(WeekSpec(week=i + 1, phase="base" if i < build / 3 else "build", target_km=week_km,
                            long_run_km=r05(min(0.32 * week_km, (longest_km or 12) + i * 0.5)), quality=q,
                            focus="Down week" if down else "Steady aerobic build"))
        if not down:
            km = min(peak, km * 1.06)
    return out


# ---------------------------------------------------------------- ramp_build: a build that actually builds

# How far above the runner's usual week the peak should reach, by race distance (km limit, factor).
PEAK_FACTOR = [(5.5, 1.15), (10.5, 1.20), (21.5, 1.25), (999.0, 1.30)]
APPROACH_FACTOR = {"gentle": 0.95, "balanced": 1.0, "ambitious": 1.05}
DOWN_SHARE = 0.85            # a lighter week is 85% of the week before it (the checker wants <= 90%)
PEAK_HOLD = 2                # the last up-weeks before the taper hold the peak


def target_peak(start_km: float, usual_km: float | None, race_km: float, approach: str = "balanced",
                baseline_peak_km: float | None = None) -> float:
    """The peak week a coach would aim for: above the usual week by race distance, inside the safety ceilings."""
    factor = next(f for limit, f in PEAK_FACTOR if race_km <= limit) * APPROACH_FACTOR.get(approach, 1.0)
    peak = max(start_km, usual_km or start_km) * factor
    if baseline_peak_km:
        peak = min(peak, pc.peak_cap(baseline_peak_km))
    return min(peak, pc.MAX_WEEK_KM)


def ramp_build(specs: list[WeekSpec], usual_km: float | None, baseline_peak_km: float | None, race_km: float,
               approach: str = "balanced") -> tuple[list[WeekSpec], str | None]:
    """Reshape the build weeks into a steady climb: from the draft's week 1 up to a peak held for the last
    PEAK_HOLD up-weeks before the taper, with a lighter week every 4th week and each step inside the ramp limit.
    The draft keeps its week 1, its sessions, its phases and its taper shape; only the weekly totals (and the
    long run, in proportion) change. Returns the new specs and a one-line note when it changed anything."""
    from engine.prefs import RAMP_PCT
    if not specs:
        return specs, None
    specs = [s.model_copy(deep=True) for s in sorted(specs, key=lambda s: s.week)]
    t = len(specs)
    while t > 0 and specs[t - 1].phase in ("taper", "race"):
        t -= 1
    build = specs[:t]
    if len(build) < 4 or build[0].target_km <= 0:
        return specs, None
    down = [i > 0 and (i + 1) % 4 == 0 and i < len(build) - PEAK_HOLD for i in range(len(build))]
    ups = [i for i in range(len(build)) if not down[i]]
    climb = max(1, len(ups) - PEAK_HOLD)                      # up-weeks that climb before the hold
    start = build[0].target_km
    step = min(RAMP_PCT.get(approach, 0.08), pc.WEEKLY_JUMP_PCT) * 0.95
    goal = max(max(s.target_km for s in build), target_peak(start, usual_km, race_km, approach, baseline_peak_km))
    peak = min(goal, start * (1 + step) ** climb)
    g = (peak / start) ** (1 / climb) if peak > start else 1.0
    before = [s.target_km for s in build]
    km, n_up = start, 0
    for i, s in enumerate(build):
        if down[i]:
            new = r05(km * DOWN_SHARE)
        else:
            km = start * g ** min(n_up, climb)
            n_up += 1
            new = r05(km)
        if s.target_km > 0 and new != s.target_km:
            s.long_run_km = r05(min(pc.LONG_RUN_MAX_KM, s.long_run_km * new / s.target_km))
        s.target_km = new
        s.phase = "base" if i < len(build) / 3 else "peak" if not down[i] and n_up > climb else "build"
        if down[i]:
            s.focus = s.focus or "Lighter week to absorb the work"
    top = max(s.target_km for s in build)
    for j, s in enumerate(specs[t:]):                          # taper hangs off the new peak
        if s.phase == "taper":
            s.target_km = r05(min(s.target_km, top * (pc.TAPER_MAX_SHARE - 0.05 - 0.15 * j)))
        elif s.phase == "race":
            s.target_km = r05(min(s.target_km, top * pc.RACE_WEEK_MAX_SHARE * 0.8))
    flat_before = max(before) - before[0] < 0.08 * before[0] or before.index(max(before)) < len(before) / 2
    if all(abs(a - b.target_km) < 1 for a, b in zip(before, build)):
        return specs, None
    peak_week = next(i for i, s in enumerate(build) if s.target_km == top) + 1
    note = (f"Build reshaped into a steady climb: {start:g} km in week 1 to a {top:g} km peak in week {peak_week}, "
            f"with a lighter week every 4th week" + (" (the draft stayed flat)" if flat_before else ""))
    return specs, note


# ---------------------------------------------------------------- make_safe: the safest version wins

def _run_km(w: PlanWeek, include_race: bool = False) -> float:
    return pc._run_km(w, include_race)


def _scale_week(week: PlanWeek, target: float) -> None:
    current = _run_km(week)
    if current <= target or current <= 0:
        return
    f = target / current
    for wo in week.workouts:
        if wo.type in pc.RUN_TYPES and wo.type != "race":
            wo.distance_km = r05(wo.distance_km * f)
    excess = _run_km(week) - target                   # rounding can leave a little over
    for wo in sorted(week.workouts, key=lambda w: -w.distance_km):
        if excess <= 0:
            break
        if wo.type in pc.RUN_TYPES and wo.type != "race" and wo.distance_km >= 1:
            wo.distance_km = max(0.0, wo.distance_km - math.ceil(excess * 2) / 2)
            excess = _run_km(week) - target


def _to_easy(wo: Workout, plan_paces: dict[str, str]) -> None:
    wo.type = "easy"
    wo.target_pace = plan_paces.get("easy") or wo.target_pace
    wo.purpose = "Easy run (moved off a hard day by the plan checker)"


def make_safe(plan: Plan, baseline_week_km: float | None, baseline_peak_km: float | None,
              easy_pace: str = "", prefs=None, easy_pace_s: float | None = None,
              long_pace_s: float | None = None) -> tuple[Plan, list[str], object]:
    """Repair until check_plan passes (max 10 rounds). Returns (plan, changes, final CheckResult)."""
    plan = plan.model_copy(deep=True)
    changes: list[str] = []
    paces = {"easy": easy_pace}
    check = lambda: pc.check_plan(plan, baseline_week_km, baseline_peak_km, prefs, easy_pace_s, long_pace_s)  # noqa: E731
    result = check()
    ramp = pc.WEEKLY_JUMP_PCT
    if prefs is not None:
        from engine.prefs import RAMP_PCT
        ramp = min(ramp, RAMP_PCT[prefs.approach])
    for _ in range(10):
        if result.passed:
            break
        weeks = sorted(plan.weeks, key=lambda w: w.index)
        by_index = {w.index: w for w in weeks}
        kms = [_run_km(w) for w in weeks]
        for v in result.violations:
            if v.severity != "block":
                continue
            w = by_index.get(v.week) if v.week else None
            if v.rule == "start_jump" and w and baseline_week_km is not None:
                cap = max(baseline_week_km * (1 + pc.START_JUMP_PCT), baseline_week_km + pc.START_JUMP_FLOOR_KM)
                _scale_week(w, cap)
                changes.append(f"Week {w.index}: cut to {_run_km(w):g} km (start jump)")
            elif v.rule == "weekly_jump" and w:
                i = weeks.index(w)
                ref = max(kms[max(0, i - 2):i])
                cap = max(ref * (1 + ramp), ref + pc.WEEKLY_JUMP_FLOOR_KM)
                _scale_week(w, cap)
                changes.append(f"Week {w.index}: cut to {_run_km(w):g} km ({ramp:.0%} ramp limit)")
            elif v.rule == "hard_limit" and w:
                for wo in w.workouts:
                    if wo.type != "race" and wo.distance_km > pc.MAX_SINGLE_RUN_KM:
                        wo.distance_km = pc.LONG_RUN_MAX_KM
                cap = pc.peak_cap(baseline_peak_km) if baseline_peak_km else pc.MAX_WEEK_KM
                _scale_week(w, cap)
                changes.append(f"Week {w.index}: cut to {_run_km(w):g} km (hard limit)")
            elif v.rule == "long_run_cap" and w:
                km = _run_km(w)
                share = pc.LONG_RUN_SHARE if km >= 40 else pc.LONG_RUN_SHARE_LOW
                for wo in w.workouts:
                    if wo.type == "long":
                        wo.distance_km = r05(min(pc.LONG_RUN_MAX_KM, share * km - 0.25))
                changes.append(f"Week {w.index}: long run capped")
            elif v.rule == "back_to_back_hard" and w:
                hard = sorted((wo for wk in weeks for wo in wk.workouts if wo.type in HARD_TYPES), key=lambda x: x.day)
                for a, b in zip(hard, hard[1:]):
                    if (b.day - a.day).days == 1:
                        victim = a if b.type in {"long", "race"} else b
                        if victim.type in {"long", "race"}:
                            continue
                        _to_easy(victim, paces)
                        changes.append(f"{victim.day:%a %b %d}: hard session made easy (back-to-back)")
                        break
            elif v.rule == "no_rest_day" and w:
                easy = [wo for wo in w.workouts if wo.type in {"easy", "recovery"}]
                if easy:
                    shortest = min(easy, key=lambda x: x.distance_km)
                    shortest.type, shortest.distance_km, shortest.target_pace = "rest", 0.0, None
                    shortest.purpose = "Rest (added by the plan checker)"
                    changes.append(f"Week {w.index}: {shortest.day:%a} made a rest day")
            elif v.rule == "no_down_week" and w:
                i = weeks.index(w)
                if i > 0:
                    _scale_week(w, 0.8 * kms[i - 1])
                    changes.append(f"Week {w.index}: made a down week ({_run_km(w):g} km)")
            elif v.rule == "no_taper" and w:
                build = [k for wk, k in zip(weeks, kms) if wk.phase not in {"taper", "race"}] or kms
                peak = max(build) if build else 0
                limit = pc.RACE_WEEK_MAX_SHARE if w is weeks[-1] else pc.TAPER_MAX_SHARE
                _scale_week(w, limit * peak)
                changes.append(f"Week {w.index}: tapered to {_run_km(w):g} km")
            elif v.rule.startswith("pref_") and w and prefs is not None:
                changes += _fix_preference(w, v.rule, prefs, easy_pace, easy_pace_s, long_pace_s)
        result = check()
    return plan, changes, result


def _fix_preference(w: PlanWeek, rule: str, prefs, easy_pace: str, easy_s: float | None, long_s: float | None) -> list[str]:
    names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    out: list[str] = []
    monday = w.workouts[0].day - timedelta(days=w.workouts[0].day.weekday())
    if rule == "pref_weekday_minutes" and easy_s:
        cap = math.floor(prefs.max_weekday_min * 60 / easy_s * 2) / 2
        for wo in w.workouts:
            if wo.type in pc.RUN_TYPES and wo.type not in {"long", "race"} and wo.distance_km > cap:
                wo.distance_km = cap
        out.append(f"Week {w.index}: weekday runs capped at {cap:g} km ({prefs.max_weekday_min} min)")
    elif rule == "pref_long_minutes" and long_s:
        cap = math.floor(prefs.max_long_min * 60 / long_s * 2) / 2
        for wo in w.workouts:
            if wo.type == "long" and wo.distance_km > cap:
                wo.distance_km = cap
        out.append(f"Week {w.index}: long run capped at {cap:g} km ({prefs.max_long_min} min)")
    elif rule == "pref_rest_day":
        for wo in list(w.workouts):
            if names[wo.day.weekday()] in prefs.rest_days and wo.type != "race":
                if wo.type == "strength":
                    w.workouts.remove(wo)
                elif wo.type in pc.RUN_TYPES:
                    wo.type, wo.distance_km, wo.target_pace, wo.purpose = "rest", 0.0, None, "Rest (your rest day)"
        out.append(f"Week {w.index}: rest days kept free")
    elif rule == "pref_gym_day":
        w.workouts[:] = [wo for wo in w.workouts if wo.type != "strength" or names[wo.day.weekday()] in prefs.gym_days]
        out.append(f"Week {w.index}: gym kept to your gym days")
    elif rule == "pref_long_day":
        target = monday + timedelta(days=names.index(prefs.long_run_day))
        for wo in w.workouts:
            if wo.type == "long" and wo.day != target:
                for other in w.workouts:
                    if other.day == target and other.type != "strength":
                        other.day = wo.day
                wo.day = target
        w.workouts.sort(key=lambda x: (x.day, x.type == "strength"))
        out.append(f"Week {w.index}: long run moved to {prefs.long_run_day}")
    elif rule == "pref_runs_per_week" and w.phase != "race":
        run_days = sorted({wo.day for wo in w.workouts if wo.type in pc.RUN_TYPES and wo.distance_km > 0})
        if len(run_days) > prefs.runs_per_week:
            easy = sorted((wo for wo in w.workouts if wo.type in {"easy", "recovery"} and wo.distance_km > 0), key=lambda x: x.distance_km)
            for wo in easy[: len(run_days) - prefs.runs_per_week]:
                wo.type, wo.distance_km, wo.target_pace, wo.purpose = "rest", 0.0, None, "Rest"
        else:
            free = [monday + timedelta(days=i) for i in range(7) if names[i] not in prefs.rest_days
                    and monday + timedelta(days=i) not in run_days]
            for day in free[: prefs.runs_per_week - len(run_days)]:
                for wo in [x for x in w.workouts if x.day == day and x.type == "rest"]:
                    w.workouts.remove(wo)
                w.workouts.append(Workout(day=day, type="easy", distance_km=4.0, target_pace=easy_pace, purpose="Easy run"))
            w.workouts.sort(key=lambda x: (x.day, x.type == "strength"))
        out.append(f"Week {w.index}: {prefs.runs_per_week} runs, as you chose")
    return out


# ---------------------------------------------------------------- strength placement (Glute Guru rule)

def allowed_gym_days(week: PlanWeek) -> list[str]:
    """Not the day before a long run or key workout. Same day as a hard session is fine."""
    hard = {wo.day for wo in week.workouts if wo.type in HARD_TYPES}
    days = sorted({wo.day for wo in week.workouts})
    return [WEEKDAYS[d.weekday()] for d in days if d + timedelta(days=1) not in hard and d not in
            {wo.day for wo in week.workouts if wo.type in {"long", "race"}}]


def place_strength(plan: Plan, strength: StrengthPlan | None, default_days: list[str], prefs=None) -> tuple[Plan, list[str]]:
    plan = plan.model_copy(deep=True)
    notes: list[str] = []
    if prefs is not None:
        return _place_on_gym_days(plan, strength, prefs), notes
    wanted = (strength.days if strength and strength.days else default_days or ["Tue", "Fri"])[:3]
    by_phase = {s.phase: s for s in (strength.sessions if strength else [])}
    for week in plan.weeks:
        if week.phase == "race":
            continue
        allowed = allowed_gym_days(week)
        session = by_phase.get(week.phase if week.phase != "race" else "taper") or (strength.sessions[0] if strength and strength.sessions else None)
        n = 1 if week.phase == "taper" else len(wanted)
        chosen: list[str] = []
        for d in wanted:
            if d in allowed:
                chosen.append(d)
            else:
                alt = next((a for a in allowed if a not in chosen and a not in wanted), None)
                if alt:
                    chosen.append(alt)
                    notes.append(f"Week {week.index}: gym moved {d} to {alt} (not the day before a hard run)")
        for d in chosen[:n]:
            day = week.workouts[0].day + timedelta(days=WEEKDAYS.index(d) - week.workouts[0].day.weekday())
            purpose = f"{session.focus}: {'; '.join(session.exercises[:4])}" if session else "Strength: single-leg work, glutes, calves, core"
            week.workouts.append(Workout(day=day, type="strength", distance_km=0,
                                         target_pace=f"{session.minutes} min" if session else "40 min",
                                         purpose=purpose[:140]))
        week.workouts.sort(key=lambda w: (w.day, w.type == "strength"))
    return plan, notes


def _place_on_gym_days(plan: Plan, strength: StrengthPlan | None, prefs) -> Plan:
    """The athlete chose the gym days: sessions go exactly there (one light one in taper, none in race week)."""
    by_phase = {s.phase: s for s in (strength.sessions if strength else [])}
    for week in plan.weeks:
        if week.phase == "race" or not prefs.gym_days:
            continue
        session = by_phase.get(week.phase) or (strength.sessions[0] if strength and strength.sessions else None)
        days = prefs.gym_days[:1] if week.phase == "taper" else prefs.gym_days
        monday = week.workouts[0].day - timedelta(days=week.workouts[0].day.weekday())
        for d in days:
            day = monday + timedelta(days=WEEKDAYS.index(d))
            purpose = f"{session.focus}: {'; '.join(session.exercises[:4])}" if session else "Strength: single-leg work, glutes, calves, core"
            week.workouts.append(Workout(day=day, type="strength", distance_km=0,
                                         target_pace=f"{session.minutes} min" if session else "40 min", purpose=purpose[:140]))
        week.workouts.sort(key=lambda w: (w.day, w.type == "strength"))
    return plan
