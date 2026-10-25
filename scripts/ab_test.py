"""Lean vs Full A/B: the same council on 3 athletes, with the compact profile only (lean) or the profile plus
the last 90 days of raw runs (full). Real model calls, about $0.05 in total. Writes output/ab_test.json,
which Under the hood shows as a table.

Run from the repo folder:  .venv/Scripts/python scripts/ab_test.py
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env")

from agents import council  # noqa: E402
from agents.hood import AB_FILE  # noqa: E402
from engine.goals import KM, goal_distance  # noqa: E402
from engine.metrics import athlete_profile  # noqa: E402
from engine.parsers import load_folder  # noqa: E402
from engine.wellness import load_wellness  # noqa: E402
from models import RaceQuery  # noqa: E402
from tools import races as race_tools  # noqa: E402

ATHLETES = ["athlete_a", "athlete_b", "athlete_c"]
MIN_WEEKS = {"Marathon": 16, "Half Marathon": 12, "10K": 8, "5K": 6}


def pick_race(distance: str):
    q = RaceQuery(zip="06511", radius_mi=100, distance=distance, weeks=52, safety_demo=False)
    hits = race_tools.search_races(q, date.today()).hits
    good = [h for h in hits if h.weeks_until >= MIN_WEEKS.get(distance, 8)]
    hit = (good or hits)[0]
    target = KM.get(distance)
    km = next((k for k in hit.distance_km if target and abs(k - target) / target <= 0.03), max(hit.distance_km))
    return hit.model_copy(update={"target_km": km})


async def one(athlete: str, mode: str) -> dict:
    folder = ROOT / "data" / "sample" / athlete
    meta = json.loads((folder / "athlete.json").read_text(encoding="utf-8"))
    runs, report = load_folder(folder)
    profile = athlete_profile(runs, load_wellness(folder), report.strength_dates)
    distance = goal_distance(meta.get("goal"))
    race = pick_race(distance)
    t0 = time.perf_counter()
    view = None
    async for e in council.council_events(profile, runs, race, None, mode):
        if e["type"] == "plan_ready":
            view = e["plan_view"]
    if not view:
        return {"athlete": athlete, "mode": mode, "error": "no plan"}
    r = view["receipt"]
    weeks = view["plan"]["weeks"]
    km = [sum(w["distance_km"] for w in wk["workouts"] if w["type"] not in ("race", "strength", "rest")) for wk in weeks]
    return {
        "athlete": athlete, "label": meta.get("label", athlete), "goal_distance": distance, "race": race.name,
        "race_date": race.date.isoformat(), "mode": mode, "run_id": view["run_id"],
        "input_tokens": sum(a["input_tokens"] for a in r["agents"]), "cached_tokens": sum(a["cached_input_tokens"] for a in r["agents"]),
        "output_tokens": sum(a["output_tokens"] for a in r["agents"]), "calls": sum(a["calls"] for a in r["agents"]),
        "cost_usd": r["total_cost_usd"], "seconds": round(time.perf_counter() - t0, 1),
        "checker_passed": view["check"]["passed"], "vetoes": sum(1 for p in view["physio"] if p["decision"] == "veto"),
        "safest_version_used": view["safest_version_used"], "weeks": len(weeks),
        "week1_km": round(km[0], 1), "peak_km": round(max(km), 1),
    }


async def main() -> None:
    rows = []
    for athlete in ATHLETES:
        for mode in ("lean", "full"):
            row = await one(athlete, mode)
            rows.append(row)
            print(json.dumps(row))
    lean = [r for r in rows if r["mode"] == "lean" and "error" not in r]
    full = [r for r in rows if r["mode"] == "full" and "error" not in r]

    def avg(rs, k):
        return round(sum(r[k] for r in rs) / len(rs), 6) if rs else None
    totals = {m: {k: avg(rs, k) for k in ("input_tokens", "cost_usd", "seconds", "vetoes")} | {"passed": sum(r["checker_passed"] for r in rs), "n": len(rs)}
              for m, rs in (("lean", lean), ("full", full))}
    AB_FILE.write_text(json.dumps({"created": datetime.now().isoformat(timespec="seconds"), "rows": rows, "totals": totals}, indent=2),
                       encoding="utf-8")
    print(json.dumps(totals))


if __name__ == "__main__":
    asyncio.run(main())
