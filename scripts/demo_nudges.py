"""Run every nudge scenario on a sample week and check the right trigger fires."""
from datetime import date, timedelta

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from engine.nudge_engine import NudgeEngine  # noqa: E402

WEEK = ["rest", "easy", "intervals", "easy", "strength", "long", "recovery"]  # Mon..Sun
KM = {"easy": 9, "intervals": 10, "long": 24, "recovery": 6, "tempo": 11}
PACE = {"easy": "5:40", "intervals": "4:20", "long": "5:50", "recovery": "6:05", "tempo": "4:50"}
WORDS = {"easy": "9 km easy", "intervals": "6 × 800 m", "long": "24 km long run",
         "recovery": "6 km recovery", "tempo": "3 × 3 km at tempo"}

start = date(2026, 9, 7)  # a Monday
plan = {}
for i in range(84):
    d = start + timedelta(days=i)
    t = WEEK[d.weekday()]
    plan[d] = {"type": t, "km": KM.get(t), "pace": PACE.get(t), "workout": WORDS.get(t)}
all_runs = {d for d, p in plan.items() if p["type"] in {"easy", "intervals", "long", "recovery"}}
ctx = {"athlete": "Alex", "race_name": "Savin Rock Marathon", "weeks_until": 23,
       "cut_km": 38, "count": 12, "radius": 50}


def runs_without(*gaps):
    out = set(all_runs)
    for a, b in gaps:
        out -= {a + timedelta(days=i) for i in range((b - a).days + 1)}
    return out


D = lambda m, d: date(2026, m, d)
scenarios = [
    # name, today, slot, run_dates, flags, expected first trigger
    ("on plan, morning", D(10, 20), "morning", all_runs, None, None),
    ("missed Tue easy run (long streak lost)", D(10, 21), "morning", runs_without((D(10, 20), D(10, 20))), None, "streak_lost"),
    ("missed long run, short streak", D(10, 4), "morning", runs_without((D(9, 29), D(9, 29)), (D(10, 3), D(10, 3))), None, "missed_long_run"),
    ("missed 2 in a row", D(10, 23), "morning", runs_without((D(10, 21), D(10, 22))), None, "missed_2"),
    ("missed 3 in a row", D(10, 24), "morning", runs_without((D(10, 20), D(10, 23))), None, "missed_3"),
    ("11 days off", D(10, 29), "morning", runs_without((D(10, 20), D(10, 31))), None, "missed_week"),
    ("18 days off", D(11, 5), "morning", runs_without((D(10, 20), D(11, 10))), None, "gone_quiet"),
    ("comeback: long run yesterday after 3 misses", D(10, 25), "morning", runs_without((D(10, 20), D(10, 22))), None, "comeback"),
    ("missed easy run, short streak", D(9, 30), "morning", runs_without((D(9, 22), D(9, 22)), (D(9, 29), D(9, 29))), None, "missed_1"),
    ("evening, streak at risk", D(10, 22), "evening", all_runs - {D(10, 22)}, None, "streak_at_risk"),
    ("evening, ran on rest day", D(10, 19), "evening", all_runs | {D(10, 19)}, None, "evening_rest_broken"),
    ("ill: no guilt", D(10, 24), "morning", runs_without((D(10, 20), D(10, 23))), {"ill": True}, "paused"),
]


eng = NudgeEngine(ROOT / "data" / "nudges.json", ROOT / "data" / "agent_voices.json", seed=7)
fails = 0
for name, today, slot, runs, flags, expect in scenarios:
    notes = eng.nudges(today, slot, plan, runs, ctx=ctx, flags=flags)
    got = notes[0]["trigger"] if notes else None
    if expect is None:
        s = eng.streak(today - timedelta(days=1), plan, runs)
        expect = "streak_milestone" if s in eng.bank["milestones"] else got
    ok = got == expect
    fails += not ok
    print(f"{'✓' if ok else '✗'} {name} [{today:%a %b %d}, {slot}] -> {got}" + ("" if ok else f" (expected {expect})"))
    for n in notes:
        print(f"    {n['title']}: {n['text']}")
print("\nall scenarios pass" if not fails else f"\n{fails} scenario(s) failed")
raise SystemExit(1 if fails else 0)
