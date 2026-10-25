"""Daily wellness (Garmin-style: sleep, resting HR, HRV, readiness) and gym sessions. No LLM.

The Physio reads these as trends vs the athlete's own baseline, never as single numbers.
"""

from __future__ import annotations

import csv
import io
import statistics
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

from pydantic import BaseModel

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


class WellnessDay(BaseModel):
    day: date
    sleep_hours: float | None = None
    sleep_score: float | None = None
    resting_hr: float | None = None
    hrv_ms: float | None = None
    hrv_status: str | None = None
    vo2max: float | None = None
    readiness: float | None = None
    stress: float | None = None


def _f(v: str | None) -> float | None:
    try:
        return float(v) if v not in (None, "", "--") else None
    except ValueError:
        return None


def parse_wellness_csv(text: str) -> list[WellnessDay]:
    out = []
    for row in csv.DictReader(io.StringIO(text)):
        try:
            d = date.fromisoformat((row.get("date") or "").strip())
        except ValueError:
            continue
        out.append(WellnessDay(
            day=d, sleep_hours=_f(row.get("sleep_hours")), sleep_score=_f(row.get("sleep_score")),
            resting_hr=_f(row.get("resting_hr")), hrv_ms=_f(row.get("hrv_overnight_ms")),
            hrv_status=(row.get("hrv_status") or "")[:20] or None, vo2max=_f(row.get("vo2max_running")),
            readiness=_f(row.get("training_readiness")), stress=_f(row.get("stress_avg")),
        ))
    return sorted(out, key=lambda w: w.day)


def is_wellness_csv(first_line: str) -> bool:
    return first_line.startswith("date,") and "resting_hr" in first_line


def wellness_from_files(files: list[tuple[str, bytes]]) -> list[WellnessDay]:
    days: dict[date, WellnessDay] = {}
    for name, raw in files:
        if not name.lower().endswith(".csv"):
            continue
        text = raw.decode("utf-8-sig", errors="replace")
        if is_wellness_csv(text.split("\n", 1)[0]):
            for w in parse_wellness_csv(text):
                days[w.day] = w
    return sorted(days.values(), key=lambda w: w.day)


def load_wellness(folder: Path) -> list[WellnessDay]:
    return wellness_from_files([(p.name, p.read_bytes()) for p in folder.glob("*.csv")])


def _mean(vals: list[float | None]) -> float | None:
    v = [x for x in vals if x is not None]
    return round(statistics.mean(v), 1) if v else None


def recovery_summary(days: list[WellnessDay], as_of: date) -> tuple[dict, list[str]]:
    """Last 7 days vs the 4 weeks before them, plus plain-language flags."""
    if not days:
        return {}, []
    recent = [w for w in days if as_of - timedelta(days=6) <= w.day <= as_of]
    base = [w for w in days if as_of - timedelta(days=34) <= w.day <= as_of - timedelta(days=7)]
    if not recent:
        return {}, []

    def pair(attr: str) -> tuple[float | None, float | None]:
        return _mean([getattr(w, attr) for w in recent]), _mean([getattr(w, attr) for w in base])

    hrv, hrv_b = pair("hrv_ms")
    rhr, rhr_b = pair("resting_hr")
    sleep, sleep_b = pair("sleep_hours")
    ready, ready_b = pair("readiness")
    latest = recent[-1]
    summary = {
        "hrv_ms_7d": hrv, "hrv_ms_baseline": hrv_b,
        "resting_hr_7d": rhr, "resting_hr_baseline": rhr_b,
        "sleep_hours_7d": sleep, "sleep_hours_baseline": sleep_b,
        "readiness_7d": ready, "readiness_baseline": ready_b,
        "readiness_latest": latest.readiness, "hrv_status_latest": latest.hrv_status,
        "vo2max_latest": latest.vo2max,
    }
    flags = []
    if hrv and hrv_b and hrv_b - hrv >= 6:
        flags.append(f"HRV down {hrv_b - hrv:.0f} ms vs baseline ({hrv_b:.0f} to {hrv:.0f})")
    if rhr and rhr_b and rhr - rhr_b >= 3:
        flags.append(f"resting HR up {rhr - rhr_b:.0f} bpm vs baseline")
    if ready is not None and ready < 50:
        flags.append(f"training readiness low ({ready:.0f}/100 this week)")
    if sleep and sleep_b and sleep_b - sleep >= 0.75:
        flags.append(f"sleeping {sleep_b - sleep:.1f} h less than usual")
    return summary, flags


def strength_summary(dates: list[date], as_of: date) -> dict:
    recent = [d for d in dates if as_of - timedelta(days=55) <= d <= as_of]
    if not recent:
        return {"sessions_per_week_last_8": 0, "usual_days": []}
    counts = Counter(WEEKDAYS[d.weekday()] for d in recent)
    usual = [day for day, n in counts.most_common() if n >= max(2, len(recent) // 6)][:3]
    return {"sessions_per_week_last_8": round(len(recent) / 8, 1), "usual_days": sorted(usual, key=WEEKDAYS.index)}
