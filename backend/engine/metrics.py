"""Metrics engine: every number on the dashboard and in the athlete profile.

Code computes, AI explains: agents only ever see the compact profile built here,
never raw runs, and the LLM never does arithmetic.
"""

from __future__ import annotations

import re
import statistics
from collections import defaultdict
from datetime import date, timedelta

from engine.fun_stats import fun_cards
from engine.wellness import recovery_summary, strength_summary
from models import (
    BestEffort, Dashboard, DayVolume, EfficiencyWeek, Kpis, LoadRatio, PaceHrPoint,
    PaceTable, PaceZone, ParseReport, Prediction, Run, WeekVolume,
)

RIEGEL_EXPONENT = 1.06
RACE_DISTANCES = {
    "5K": 5.0,
    "10K": 10.0,
    "Half Marathon": 21.0975,
    "Marathon": 42.195,
}
DISTANCE_ALIASES = {
    "5k": "5K", "5 k": "5K",
    "10k": "10K", "10 k": "10K",
    "half": "Half Marathon", "half marathon": "Half Marathon", "hm": "Half Marathon", "21k": "Half Marathon",
    "marathon": "Marathon", "full": "Marathon", "full marathon": "Marathon", "m": "Marathon", "42k": "Marathon",
}
PREDICTION_WINDOW_DAYS = 90


# ---------------------------------------------------------------- formatting

def fmt_time(seconds: float) -> str:
    s = int(round(seconds))
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


def fmt_pace(s_per_km: float) -> str:
    s = int(round(s_per_km))
    return f"{s // 60}:{s % 60:02d}/km"


def parse_time(text: str) -> float:
    """'1:35:00' -> 5700, '42:30' -> 2550, '3h05' -> 11100."""
    t = text.strip().lower()
    m = re.fullmatch(r"(\d+)\s*h\s*(\d{1,2})?(?:\s*m(?:in)?)?", t)
    if m:
        return int(m.group(1)) * 3600 + int(m.group(2) or 0) * 60
    parts = t.split(":")
    if not all(p.strip().replace(".", "", 1).isdigit() for p in parts) or not 1 <= len(parts) <= 3:
        raise ValueError(f"Can't read time '{text}'. Use h:mm:ss or mm:ss.")
    seconds = 0.0
    for p in parts:
        seconds = seconds * 60 + float(p)
    if len(parts) == 1:                       # bare number = minutes
        seconds *= 60
    return seconds


def resolve_distance(distance: str | float) -> tuple[str, float]:
    """'half marathon' / 'HM' / 21.1 -> ('Half Marathon', 21.0975)."""
    if isinstance(distance, (int, float)):
        km = float(distance)
        for name, d in RACE_DISTANCES.items():
            if abs(d - km) / d < 0.03:
                return name, d
        return f"{km:g} km", km
    key = distance.strip().lower()
    if key in DISTANCE_ALIASES:
        name = DISTANCE_ALIASES[key]
        return name, RACE_DISTANCES[name]
    for name, d in RACE_DISTANCES.items():
        if key == name.lower():
            return name, d
    num = re.fullmatch(r"([\d.]+)\s*(km|k|mi|miles?)?", key)
    if num:
        km = float(num.group(1)) * (1.609344 if (num.group(2) or "").startswith("mi") else 1)
        return resolve_distance(km)
    raise ValueError(f"Unknown distance '{distance}'")


def riegel(time_s: float, d1_km: float, d2_km: float) -> float:
    """T2 = T1 x (D2 / D1)^1.06"""
    return time_s * (d2_km / d1_km) ** RIEGEL_EXPONENT


# ---------------------------------------------------------------- building blocks

def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _between(runs: list[Run], start: date, end: date) -> list[Run]:
    return [r for r in runs if start <= r.start.date() <= end]


def _km(runs: list[Run]) -> float:
    return round(sum(r.distance_km for r in runs), 1)


def weekly_volume(runs: list[Run], first: date, last: date) -> list[WeekVolume]:
    buckets: dict[date, list[Run]] = defaultdict(list)
    for r in runs:
        buckets[_monday(r.start.date())].append(r)
    weeks = []
    wk = _monday(first)
    while wk <= last:
        rs = buckets.get(wk, [])
        weeks.append(WeekVolume(
            week_start=wk, km=_km(rs), runs=len(rs),
            long_run_km=round(max((r.distance_km for r in rs), default=0.0), 1),
            minutes=round(sum(r.duration_s for r in rs) / 60, 0),
        ))
        wk += timedelta(days=7)
    return weeks


def daily_volume(runs: list[Run], first: date, last: date) -> list[DayVolume]:
    per_day: dict[date, float] = defaultdict(float)
    for r in runs:
        per_day[r.start.date()] += r.distance_km
    days, d = [], first
    while d <= last:
        days.append(DayVolume(day=d, km=round(per_day.get(d, 0.0), 1)))
        d += timedelta(days=1)
    return days


def load_ratio(runs: list[Run], as_of: date) -> LoadRatio:
    """Acute:chronic workload ratio on distance, uncoupled: the last 7 days vs the average week
    of the 4 weeks before them (so a spike is not hidden inside its own baseline)."""
    acute = _km(_between(runs, as_of - timedelta(days=6), as_of))
    chronic = _km(_between(runs, as_of - timedelta(days=34), as_of - timedelta(days=7))) / 4
    if chronic < 1:
        return LoadRatio(acute_km=acute, chronic_weekly_km=round(chronic, 1), ratio=None, zone="no data")
    ratio = round(acute / chronic, 2)
    zone = "low" if ratio < 0.8 else "sweet spot" if ratio <= 1.3 else "caution" if ratio <= 1.5 else "danger"
    return LoadRatio(acute_km=acute, chronic_weekly_km=round(chronic, 1), ratio=ratio, zone=zone)


def best_recent_effort(runs: list[Run], as_of: date) -> Run | None:
    """The recent run that implies the fastest race fitness (best Riegel 10K equivalent).

    A race tagged in the export wins when there is one. Workout sessions are left out: their
    moving time skips the rests between reps, so they look faster than a real race effort.
    """
    recent = _between(runs, as_of - timedelta(days=PREDICTION_WINDOW_DAYS), as_of)
    races = [r for r in recent if r.workout_type == "race" and r.distance_km >= 3]
    steady = [r for r in recent if r.workout_type != "workout"]
    pool = (races or [r for r in steady if r.distance_km >= 5] or [r for r in steady if r.distance_km >= 3]
            or [r for r in recent if r.distance_km >= 3])
    if not pool:
        return None
    return min(pool, key=lambda r: riegel(r.duration_s, r.distance_km, 10.0))


def predictions(runs: list[Run], as_of: date) -> tuple[list[Prediction], str]:
    base = best_recent_effort(runs, as_of)
    if base is None:
        return [], "Not enough runs in the last 90 days to predict race times"
    preds = []
    for name, d in RACE_DISTANCES.items():
        t = riegel(base.duration_s, base.distance_km, d)
        preds.append(Prediction(distance=name, distance_km=d, time_s=round(t), time=fmt_time(t), pace=fmt_pace(t / d)))
    what = "race" if base.workout_type == "race" else f"best effort of the last {PREDICTION_WINDOW_DAYS} days"
    basis = (f"Riegel formula from your {base.distance_km:.1f} km in {fmt_time(base.duration_s)} "
             f"on {base.start.date():%b %d, %Y} ({what})")
    return preds, basis


HARD_EFFORT_SLACK = 0.15                   # a "best" more than 15% slower than predicted pace was an easy run


def best_efforts(runs: list[Run], preds: list[Prediction] | None = None) -> list[BestEffort]:
    """Fastest whole run at each race distance (runs 0-15% longer are scaled down by pace).

    With predictions, a best that is more than 15% slower than the predicted pace is flagged
    hard_effort=False: the athlete has only run that distance easy, so there's no real best yet.
    """
    pred_pace = {p.distance: p.time_s / p.distance_km for p in preds or []}
    out = []
    for name, d in RACE_DISTANCES.items():
        pool = [r for r in runs if 0.97 * d <= r.distance_km <= 1.15 * d]
        if not pool:
            continue
        best = min(pool, key=lambda r: r.pace_s_per_km)
        t = best.pace_s_per_km * d
        hard = name not in pred_pace or best.pace_s_per_km <= pred_pace[name] * (1 + HARD_EFFORT_SLACK)
        out.append(BestEffort(distance=name, distance_km=d, time_s=round(t), time=fmt_time(t),
                              pace=fmt_pace(best.pace_s_per_km), day=best.start.date(),
                              from_run_km=round(best.distance_km, 2), hard_effort=hard))
    return out


def _max_hr(runs: list[Run]) -> float | None:
    vals = [r.max_hr for r in runs if r.max_hr] or [r.avg_hr for r in runs if r.avg_hr]
    return max(vals) if vals else None


def _is_easy(r: Run, max_hr: float | None) -> bool:
    return bool(r.avg_hr and max_hr and r.avg_hr <= 0.80 * max_hr)


def pace_hr_points(runs: list[Run]) -> list[PaceHrPoint]:
    pts = []
    for r in runs:
        if r.avg_hr and r.avg_hr > 60:
            mpb = (r.distance_km * 1000) / (r.avg_hr * r.duration_s / 60)
            pts.append(PaceHrPoint(day=r.start.date(), distance_km=round(r.distance_km, 2),
                                   pace_s_per_km=round(r.pace_s_per_km, 1), avg_hr=r.avg_hr,
                                   meters_per_beat=round(mpb, 3)))
    return pts


def efficiency_trend(runs: list[Run], weeks: list[WeekVolume]) -> list[EfficiencyWeek]:
    max_hr = _max_hr(runs)
    out = []
    for wk in weeks:
        rs = [r for r in runs if _monday(r.start.date()) == wk.week_start and r.avg_hr and r.avg_hr > 60]
        if not rs:
            continue
        mpb = statistics.mean((r.distance_km * 1000) / (r.avg_hr * r.duration_s / 60) for r in rs)
        easy = [r.pace_s_per_km for r in rs if _is_easy(r, max_hr)]
        out.append(EfficiencyWeek(week_start=wk.week_start, meters_per_beat=round(mpb, 3),
                                  easy_pace_s_per_km=round(statistics.median(easy), 1) if easy else None))
    return out


# ---------------------------------------------------------------- dashboard

def build_dashboard(runs: list[Run], start: date | None = None, end: date | None = None,
                    report: ParseReport | None = None) -> Dashboard:
    if not runs:
        raise ValueError("No runs found in the upload")
    runs = sorted(runs, key=lambda r: r.start)
    first = start or runs[0].start.date()
    as_of = end or runs[-1].start.date()
    window = _between(runs, first, as_of)
    if not window:
        raise ValueError("No runs in the selected date range")
    weeks = weekly_volume(window, first, as_of)
    preds, basis = predictions(window, as_of)
    kpis = Kpis(
        this_week_km=_km(_between(window, as_of - timedelta(days=6), as_of)),
        four_week_avg_km=round(_km(_between(window, as_of - timedelta(days=27), as_of)) / 4, 1),
        longest_run_km=round(max((r.distance_km for r in _between(window, as_of - timedelta(days=83), as_of)), default=0.0), 1),
        load=load_ratio(window, as_of),
        predictions=preds,
        prediction_basis=basis,
    )
    return Dashboard(
        as_of=as_of, first_day=first, total_runs=len(window), kpis=kpis, weekly=weeks,
        daily=daily_volume(window, first, as_of), pace_hr=pace_hr_points(window),
        efficiency=efficiency_trend(window, weeks), best_efforts=best_efforts(window, preds), fun=fun_cards(window), report=report,
    )


# ---------------------------------------------------------------- athlete profile (what agents see)

def athlete_profile(runs: list[Run], wellness: list | None = None, strength_dates: list[date] | None = None) -> dict:
    """Compact fitness summary, ~1-2K tokens. Never contains raw runs or free text.

    wellness: engine.wellness.WellnessDay list (sleep, HRV, resting HR, readiness), if the export had it.
    strength_dates: gym sessions found among non-run activities.
    """
    if not runs:
        return {"error": "no runs loaded"}
    runs = sorted(runs, key=lambda r: r.start)
    as_of = runs[-1].start.date()
    first = runs[0].start.date()
    last12 = _between(runs, as_of - timedelta(days=83), as_of)
    weeks12 = weekly_volume(last12, _monday(as_of) - timedelta(weeks=11), as_of)
    full_weeks = [w for w in weeks12 if w.week_start + timedelta(days=6) <= as_of] or weeks12
    max_hr = _max_hr(runs)
    easy = [r for r in last12 if _is_easy(r, max_hr)]
    long_runs = sorted(last12, key=lambda r: r.distance_km, reverse=True)[:4]
    preds, basis = predictions(runs, as_of)
    eff = efficiency_trend(runs, weekly_volume(runs, first, as_of))
    eff_recent = [e.meters_per_beat for e in eff[-4:]]
    eff_prior = [e.meters_per_beat for e in eff[-12:-4]]
    load = load_ratio(runs, as_of)
    last_gap = (as_of - runs[-2].start.date()).days if len(runs) > 1 else None

    recovery, recovery_flags = recovery_summary(wellness or [], as_of)
    flags = []
    if load.zone in {"caution", "danger"}:
        flags.append(f"load ratio {load.ratio} is in the {load.zone} zone")
    prev = load_ratio(runs, as_of - timedelta(days=7))
    if load.ratio and prev.ratio and load.ratio > 1.3 and prev.ratio > 1.3:
        flags.append(f"load ratio above 1.3 two weeks running ({prev.ratio} a week ago, {load.ratio} now)")
    if load.zone == "low":
        flags.append("training load dropped below usual (ratio < 0.8)")
    if last_gap and last_gap >= 7:
        flags.append(f"{last_gap}-day gap before the latest run")

    return {
        "as_of": as_of.isoformat(),
        "history": {"first_run": first.isoformat(), "weeks_of_data": round((as_of - first).days / 7, 1), "runs_total": len(runs)},
        "volume_km": {
            "last_7_days": _km(_between(runs, as_of - timedelta(days=6), as_of)),
            "avg_week_last_4": round(_km(_between(runs, as_of - timedelta(days=27), as_of)) / 4, 1),
            "avg_week_last_12": round(_km(last12) / 12, 1),
            "peak_week_last_12": max((w.km for w in full_weeks), default=0.0),
            "weekly_last_12": [w.km for w in weeks12],
        },
        "frequency": {
            "runs_per_week_last_4": round(len(_between(runs, as_of - timedelta(days=27), as_of)) / 4, 1),
            "weeks_with_3plus_runs_last_12": sum(1 for w in weeks12 if w.runs >= 3),
        },
        "long_runs_last_12_weeks": [
            {"date": r.start.date().isoformat(), "km": round(r.distance_km, 1), "pace": fmt_pace(r.pace_s_per_km)}
            for r in long_runs
        ],
        "load_ratio": load.model_dump(),
        "load_ratio_7_days_ago": prev.ratio,
        "heart_rate": {
            "max_observed": max_hr,
            "typical_easy_hr": round(statistics.median([r.avg_hr for r in easy]), 0) if easy else None,
        },
        "typical_easy_pace": fmt_pace(statistics.median([r.pace_s_per_km for r in easy])) if easy else None,
        "aerobic_efficiency_change_pct": (
            round((statistics.mean(eff_recent) / statistics.mean(eff_prior) - 1) * 100, 1)
            if eff_recent and eff_prior else None
        ),
        "race_predictions": {p.distance: p.time for p in preds},
        "prediction_basis": basis,
        "best_efforts": {b.distance: {"time": b.time, "date": b.day.isoformat()}
                         for b in best_efforts(runs, preds) if b.hard_effort},
        "recovery": recovery,
        "strength": strength_summary(strength_dates or [], as_of),
        "flags": flags + recovery_flags,
    }


# ---------------------------------------------------------------- training paces

def compute_paces(runs: list[Run], distance: str | float, goal_time: str | None = None) -> PaceTable:
    """Training paces from a goal (or, with no goal, from current fitness), via Riegel equivalents."""
    name, d = resolve_distance(distance)
    current = None
    base = best_recent_effort(runs, runs[-1].start.date()) if runs else None
    if base:
        current = riegel(base.duration_s, base.distance_km, d)

    if goal_time:
        race_s = parse_time(goal_time)
        basis = f"goal {fmt_time(race_s)} {name}"
    elif current:
        race_s = current
        basis = f"current fitness ({fmt_time(race_s)} {name} predicted)"
    else:
        raise ValueError("No goal time given and not enough recent runs to estimate fitness")

    def eq_pace(km: float) -> float:
        return riegel(race_s, d, km) / km

    mp, tp, ip, rp = eq_pace(42.195), eq_pace(15.0), eq_pace(5.0), race_s / d

    def zone(zname: str, fast: float, slow: float, purpose: str) -> PaceZone:
        return PaceZone(name=zname, fast_s_per_km=round(fast), slow_s_per_km=round(slow),
                        label=f"{fmt_pace(fast)[:-3]}–{fmt_pace(slow)}", purpose=purpose)

    zones = [
        zone("Recovery", mp * 1.25, mp * 1.35, "Very easy jog the day after a hard session"),
        zone("Easy", mp * 1.12, mp * 1.25, "Most of your weekly kilometers; builds the aerobic base"),
        zone("Long run", mp * 1.08, mp * 1.18, "Weekly long run; endurance and fat use"),
        zone("Marathon", mp - 3, mp + 3, "Marathon-pace blocks inside long runs"),
        zone("Threshold", tp - 3, tp + 3, "Tempo runs and cruise intervals (comfortably hard)"),
        zone("Interval", ip - 3, ip + 3, "VO2max repeats of 800 m to 1.6 km"),
        zone(f"{name} race pace", rp - 2, rp + 2, f"Goal pace for the {name}"),
    ]

    gap = warning = None
    if goal_time and current:
        gap = round((current / race_s - 1) * 100, 1)
        if gap > 8:
            warning = (f"Your goal is {gap}% faster than your current predicted {fmt_time(current)}. "
                       "Paces are set from the goal; consider a stepping-stone target.")
    return PaceTable(basis=basis, race_distance_km=d, race_time=fmt_time(race_s), race_pace=fmt_pace(rp),
                     zones=zones, current_prediction=fmt_time(current) if current else None,
                     goal_gap_pct=gap, warning=warning)
