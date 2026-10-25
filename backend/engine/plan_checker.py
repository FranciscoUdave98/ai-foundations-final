"""Hard safety rules for training plans. Plain code, so no prompt can talk its way past them.

The Physio agent uses this as a tool, and the Head Coach must pass it before a plan ships.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from models import HARD_TYPES, CheckResult, Plan, PlanWeek, Violation

RUN_TYPES = {"easy", "recovery", "long", "tempo", "threshold", "interval", "race_pace", "strides", "race"}

WEEKLY_JUMP_PCT = 0.10          # 10% rule ...
WEEKLY_JUMP_FLOOR_KM = 3.0      # ... but low-mileage runners may add 3 km
START_JUMP_PCT = 0.15           # week 1 vs the athlete's recent 4-week average
START_JUMP_FLOOR_KM = 5.0
LONG_RUN_SHARE = 0.35           # long run <= 35% of the week (50% under 40 km/week)
LONG_RUN_SHARE_LOW = 0.50
LONG_RUN_MAX_KM = 35.0
MAX_WEEK_KM = 160.0             # absolute ceilings, whatever anyone asks for
MAX_SINGLE_RUN_KM = 45.0
MAX_VS_PEAK = 1.5               # never more than 1.5x the athlete's recent peak week ...
MAX_VS_PEAK_FLOOR_KM = 20.0     # ... or peak + 20 km for low-mileage runners
DOWN_WEEK_EVERY = 4             # at least one down week in any 4 build weeks
DOWN_WEEK_SHARE = 0.90          # a down week is <= 90% of the week before
TAPER_WEEKS = [(10.0, 1), (21.1, 2), (999.0, 3)]
TAPER_MAX_SHARE = 0.85
RACE_WEEK_MAX_SHARE = 0.65

RULES = [
    "start_jump: week 1 <= recent 4-week average +15% (or +5 km)",
    "weekly_jump: each build week <= the bigger of the last 2 weeks +10% (or +3 km)",
    "back_to_back_hard: no hard sessions (tempo, intervals, race pace, long run) on consecutive days",
    "no_rest_day: at least one day without running every week",
    "no_taper: volume drops before race day (1-3 weeks by distance)",
    "long_run_cap: long run <= 35% of the week (50% under 40 km) and <= 35 km",
    f"hard_limit: <= {MAX_WEEK_KM:g} km/week, <= {MAX_SINGLE_RUN_KM:g} km per run, <= {MAX_VS_PEAK:g}x recent peak week (or peak + {MAX_VS_PEAK_FLOOR_KM:g} km)",
    f"no_down_week: a lighter week (<= {DOWN_WEEK_SHARE:.0%} of the week before) in every {DOWN_WEEK_EVERY} build weeks",
]


def peak_cap(baseline_peak_km: float) -> float:
    return min(MAX_WEEK_KM, max(MAX_VS_PEAK * baseline_peak_km, baseline_peak_km + MAX_VS_PEAK_FLOOR_KM))


def _run_km(week: PlanWeek, include_race: bool = True) -> float:
    return round(sum(w.distance_km for w in week.workouts
                     if w.type in RUN_TYPES and (include_race or w.type != "race")), 1)


def _taper_weeks(race_km: float) -> int:
    return next(n for limit, n in TAPER_WEEKS if race_km <= limit)


def check_plan(plan: Plan, baseline_week_km: float | None = None,
               baseline_peak_km: float | None = None, prefs=None, easy_pace_s: float | None = None,
               long_pace_s: float | None = None) -> CheckResult:
    """baseline_week_km: athlete's recent 4-week average. baseline_peak_km: peak week of the last 12.

    prefs (models.Preferences): also enforce the athlete's preferences, and use their approach as the ramp limit.
    easy_pace_s / long_pace_s: seconds per km, to estimate run minutes.
    """
    v: list[Violation] = []
    ramp = WEEKLY_JUMP_PCT
    if prefs is not None:
        from engine.prefs import RAMP_PCT
        ramp = min(WEEKLY_JUMP_PCT, RAMP_PCT[prefs.approach])
    weeks = sorted(plan.weeks, key=lambda w: w.index)
    kms = [_run_km(w, include_race=False) for w in weeks]

    # start jump
    if weeks and baseline_week_km is not None:
        cap = max(baseline_week_km * (1 + START_JUMP_PCT), baseline_week_km + START_JUMP_FLOOR_KM)
        if kms[0] > cap:
            v.append(Violation(rule="start_jump", week=weeks[0].index,
                               detail=f"Week 1 is {kms[0]:g} km but recent average is {baseline_week_km:g} km (cap {cap:.1f})"))

    # weekly jump (taper and race weeks only go down, so they are skipped)
    for i in range(1, len(weeks)):
        if weeks[i].phase in {"taper", "race"}:
            continue
        ref = max(kms[max(0, i - 2):i])
        cap = max(ref * (1 + ramp), ref + WEEKLY_JUMP_FLOOR_KM)
        if kms[i] > cap + 0.05:
            v.append(Violation(rule="weekly_jump", week=weeks[i].index,
                               detail=f"{kms[i]:g} km after {ref:g} km is +{(kms[i] / ref - 1) * 100 if ref else 100:.0f}% (cap {cap:.1f})"))

    # back-to-back hard days, across week boundaries too
    hard_days: dict[date, list[str]] = defaultdict(list)
    for w in weeks:
        for wo in w.workouts:
            if wo.type in HARD_TYPES and wo.status != "missed":
                hard_days[wo.day].append(wo.type)
    days = sorted(hard_days)
    for a, b in zip(days, days[1:]):
        if (b - a).days == 1:
            week = next(w.index for w in weeks if any(wo.day == b for wo in w.workouts))
            v.append(Violation(rule="back_to_back_hard", week=week,
                               detail=f"{'/'.join(hard_days[a])} on {a:%a %b %d} then {'/'.join(hard_days[b])} on {b:%a %b %d}"))

    # rest day
    for w in weeks:
        run_days = {wo.day for wo in w.workouts if wo.type in RUN_TYPES and wo.distance_km > 0}
        if len(run_days) >= 7:
            v.append(Violation(rule="no_rest_day", week=w.index, detail="Runs on all 7 days"))

    # long run cap + single-run and weekly hard limits
    for w, km in zip(weeks, kms):
        for wo in w.workouts:
            if wo.type == "race":
                continue
            if wo.distance_km > MAX_SINGLE_RUN_KM:
                v.append(Violation(rule="hard_limit", week=w.index, detail=f"{wo.distance_km:g} km single run (max {MAX_SINGLE_RUN_KM:g})"))
            if wo.type == "long":
                share = LONG_RUN_SHARE if km >= 40 else LONG_RUN_SHARE_LOW
                if wo.distance_km > LONG_RUN_MAX_KM:
                    v.append(Violation(rule="long_run_cap", week=w.index, detail=f"Long run {wo.distance_km:g} km (max {LONG_RUN_MAX_KM:g})"))
                elif km and wo.distance_km > share * km + 0.05:
                    v.append(Violation(rule="long_run_cap", week=w.index,
                                       detail=f"Long run {wo.distance_km:g} km is {wo.distance_km / km * 100:.0f}% of a {km:g} km week (max {share * 100:.0f}%)"))
        if km > MAX_WEEK_KM:
            v.append(Violation(rule="hard_limit", week=w.index, detail=f"{km:g} km week (max {MAX_WEEK_KM:g})"))
        elif baseline_peak_km and km > peak_cap(baseline_peak_km) + 0.05:
            v.append(Violation(rule="hard_limit", week=w.index,
                               detail=f"{km:g} km is above the {peak_cap(baseline_peak_km):.0f} km ceiling set by your recent peak of {baseline_peak_km:g} km"))

    # down weeks: in any 4 consecutive build weeks, one must be lighter than the week before
    build = [(w, k) for w, k in zip(weeks, kms) if w.phase not in {"taper", "race"}]
    down = [i > 0 and k <= DOWN_WEEK_SHARE * build[i - 1][1] for i, (_, k) in enumerate(build)]
    run = 0
    for i, (w, _) in enumerate(build):
        run = 0 if down[i] else run + 1
        if run >= DOWN_WEEK_EVERY:
            v.append(Violation(rule="no_down_week", week=w.index,
                               detail=f"{DOWN_WEEK_EVERY} build weeks in a row without a lighter week (week {w.index})"))
            run = 0

    # taper
    n_taper = _taper_weeks(plan.race_distance_km)
    if len(weeks) < n_taper + 2:
        v.append(Violation(rule="no_taper", detail=f"Plan has {len(weeks)} weeks; too short to check a {n_taper}-week taper", severity="warn"))
    else:
        build = kms[:-n_taper]
        peak = max(build) if build else 0
        if peak <= 0:
            v.append(Violation(rule="no_taper", detail="Plan has no running volume to taper from"))
        for w, km in zip(weeks[-n_taper:], kms[-n_taper:]):
            limit = RACE_WEEK_MAX_SHARE if w is weeks[-1] else TAPER_MAX_SHARE
            if peak and km > limit * peak + 0.05:
                v.append(Violation(rule="no_taper", week=w.index,
                                   detail=f"{km:g} km is {km / peak * 100:.0f}% of peak {peak:g} km (should be <= {limit * 100:.0f}%)"))

    if prefs is not None:
        v += preference_violations(weeks, prefs, easy_pace_s, long_pace_s)
    rules = RULES + (PREF_RULES if prefs is not None else [])
    return CheckResult(passed=not any(x.severity == "block" for x in v), violations=v, rules_checked=rules)


PREF_RULES = [
    "pref_runs_per_week: exactly the runs per week you chose (race week: at most)",
    "pref_long_day: the long run on the day you chose",
    "pref_rest_day: nothing scheduled on your rest days",
    "pref_gym_day: gym only on your gym days",
    "pref_weekday_minutes: weekday runs within your max minutes (km x easy pace)",
    "pref_long_minutes: the long run within your max minutes (km x long-run pace)",
    "weekly ramp within your approach (gentle 5%, balanced 8%, ambitious 10%)",
]
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def run_minutes(km: float, pace_s: float | None) -> float:
    return km * (pace_s or 0) / 60


def preference_violations(weeks: list[PlanWeek], prefs, easy_pace_s: float | None, long_pace_s: float | None) -> list[Violation]:
    v: list[Violation] = []
    for w in weeks:
        race_week = w.phase == "race"
        run_days = {wo.day for wo in w.workouts if wo.type in RUN_TYPES and wo.distance_km > 0}
        n = len(run_days)
        if (n != prefs.runs_per_week and not race_week) or (race_week and n > prefs.runs_per_week):
            v.append(Violation(rule="pref_runs_per_week", week=w.index, detail=f"{n} runs; you chose {prefs.runs_per_week}"))
        for wo in w.workouts:
            name = DAY_NAMES[wo.day.weekday()]
            if wo.type == "race":
                continue
            if name in prefs.rest_days and (wo.type in RUN_TYPES and wo.distance_km > 0 or wo.type == "strength"):
                v.append(Violation(rule="pref_rest_day", week=w.index, detail=f"{wo.type} on {name}, a rest day"))
            if wo.type == "strength" and name not in prefs.gym_days:
                v.append(Violation(rule="pref_gym_day", week=w.index, detail=f"gym on {name}; your gym days are {', '.join(prefs.gym_days) or 'none'}"))
            if wo.type == "long" and not race_week and name != prefs.long_run_day:
                v.append(Violation(rule="pref_long_day", week=w.index, detail=f"long run on {name}; you chose {prefs.long_run_day}"))
            if wo.type == "long" and long_pace_s and run_minutes(wo.distance_km, long_pace_s) > prefs.max_long_min + 2:
                v.append(Violation(rule="pref_long_minutes", week=w.index,
                                   detail=f"long run {wo.distance_km:g} km is about {run_minutes(wo.distance_km, long_pace_s):.0f} min (max {prefs.max_long_min})"))
            if wo.type in RUN_TYPES and wo.type != "long" and easy_pace_s and run_minutes(wo.distance_km, easy_pace_s) > prefs.max_weekday_min + 2:
                v.append(Violation(rule="pref_weekday_minutes", week=w.index,
                                   detail=f"{name} {wo.distance_km:g} km is about {run_minutes(wo.distance_km, easy_pace_s):.0f} min (max {prefs.max_weekday_min})"))
    return v
