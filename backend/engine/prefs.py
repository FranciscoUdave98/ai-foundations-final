"""Training preferences (step ③): defaults from the athlete's data, safety reconciliation, and the
weekly template code uses to place workouts. No LLM.

Safety always wins: a preference that conflicts with a safety rule is adjusted, and the reason is
shown in the verdict banner ("Runs per week 7 → 6: safety needs a rest day").
"""

from __future__ import annotations

from datetime import date, timedelta

from models import Preferences

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
RAMP_PCT = {"gentle": 0.05, "balanced": 0.08, "ambitious": 0.10}     # ambitious = the hard 10% rule, never more
LONG_MIN_BY_DISTANCE = [(10.5, 90), (21.5, 135), (999, 180)]


def suggest_rest(runs: int, long_day: str, current: list[str] | None = None) -> list[str]:
    need = max(0, 7 - runs)
    order = ["Mon", "Fri", "Wed", "Sat" if long_day == "Sun" else "Sun", "Thu", "Tue"]
    keep = [d for d in (current or []) if d != long_day][:need]
    for d in order:
        if len(keep) < need and d not in keep:
            keep.append(d)
    return [d for d in DAYS if d in keep]


def defaults(profile: dict, race_km: float, today: date) -> Preferences:
    runs = int(round(profile.get("frequency", {}).get("runs_per_week_last_4") or 4))
    runs = min(6, max(3, runs))
    rest = suggest_rest(runs, "Sun")
    usual = [d for d in (profile.get("strength", {}).get("usual_days") or []) if d not in rest]
    gym = (usual + [d for d in ("Tue", "Thu", "Wed") if d not in rest and d not in usual])[:2]
    long_min = next(m for km, m in LONG_MIN_BY_DISTANCE if race_km <= km)
    return Preferences(runs_per_week=runs, long_run_day="Sun", rest_days=rest, gym_days=sorted(gym, key=DAYS.index),
                       max_weekday_min=60, max_long_min=long_min, approach="balanced", plan_start=None, units="km")


def reconcile(p: Preferences, profile: dict) -> tuple[Preferences, list[str]]:
    """Make preferences consistent and safe. Returns (adjusted, what changed and why)."""
    notes: list[str] = []
    runs = p.runs_per_week
    if runs >= 7:
        runs = 6
        notes.append("Runs per week 7 → 6: safety needs at least one rest day")
    load = profile.get("load_ratio", {}).get("ratio") or 0
    current = profile.get("frequency", {}).get("runs_per_week_last_4") or runs
    if load > 1.3 and runs > round(current) + 1:
        new = int(round(current)) + 1
        notes.append(f"Runs per week {runs} → {new}: your load ratio is {load:.2f}, so add at most one run a week at once")
        runs = new
    rest = [d for d in p.rest_days if d in DAYS and d != p.long_run_day]
    if len(rest) != 7 - runs:
        rest = suggest_rest(runs, p.long_run_day, rest)
        if p.rest_days:
            notes.append(f"Rest days set to {', '.join(rest)} to match {runs} runs a week")
    gym = [d for d in p.gym_days if d in DAYS]
    on_rest = [d for d in gym if d in rest]
    if on_rest:
        notes.append(f"Gym moved off rest day{'s' if len(on_rest) > 1 else ''} {', '.join(on_rest)}: nothing is scheduled on a rest day")
        gym = [d for d in gym if d not in rest]
    if len(gym) > 3:
        gym = gym[:3]
    adjusted = p.model_copy(update={"runs_per_week": runs, "rest_days": rest, "gym_days": sorted(gym, key=DAYS.index)})
    return adjusted, notes


def plan_start(p: Preferences, today: date) -> date | None:
    """None = this Monday (the default)."""
    if p.plan_start is None:
        return None
    return max(p.plan_start, today) - timedelta(days=max(p.plan_start, today).weekday())


def template(p: Preferences) -> dict[str, str]:
    """Weekday -> role: long | quality | easy | rest. Key sessions never sit next to the long run or each other."""
    run_days = [d for d in DAYS if d not in p.rest_days]
    roles = {d: "rest" for d in DAYS}
    for d in run_days:
        roles[d] = "easy"
    long_i = DAYS.index(p.long_run_day)
    roles[p.long_run_day] = "long"
    near_long = {DAYS[(long_i - 1) % 7], DAYS[(long_i + 1) % 7]}
    chosen: list[str] = []
    for d in ["Tue", "Thu", "Wed", "Mon", "Fri", "Sat", "Sun"]:
        if len(chosen) == 2:
            break
        if roles[d] != "easy" or d in near_long:
            continue
        i = DAYS.index(d)
        if any(abs(i - DAYS.index(c)) in (1, 6) for c in chosen):
            continue
        chosen.append(d)
    for d in chosen:
        roles[d] = "quality"
    return roles


def summary(p: Preferences, start: date) -> str:
    rest = ", ".join(p.rest_days) or "none"
    return (f"{p.runs_per_week} runs a week, long run on {p.long_run_day}, rest on {rest}, {len(p.gym_days)} gym days, "
            f"weekday runs up to {p.max_weekday_min} min, {p.approach}. Plan starts Mon {start:%b %d}.")
