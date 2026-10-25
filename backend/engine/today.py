"""The Dashboard's "Today" card: plan streak + Duolingo-style nudges. Plain code, zero tokens.

Wraps engine/nudge_engine.py (from the PaceLab voice pack) for PaceLab's plan format, and adds
the demo "Simulate" scenarios, because nobody waits a week to see a missed-run nudge.

The streak is a *plan* streak: a day counts when the plan was kept, and rest days count. It rewards
following the plan, including resting, so it never pushes daily running.
"""

from __future__ import annotations

import json
import random
from datetime import date, timedelta
from pathlib import Path

from engine.nudge_engine import RUN, NudgeEngine
from models import Plan

DATA = Path(__file__).resolve().parents[2] / "data"
NUDGES = DATA / "nudges.json"
VOICES = DATA / "agent_voices.json"

# PaceLab workout types -> the nudge engine's types
TYPE_MAP = {"easy": "easy", "recovery": "recovery", "strides": "easy", "long": "long", "race": "long",
            "tempo": "tempo", "threshold": "tempo", "race_pace": "tempo", "interval": "intervals"}
LABEL = {"easy": "easy", "recovery": "recovery", "strides": "easy with strides", "long": "long run", "race": "RACE",
         "tempo": "tempo", "threshold": "threshold", "race_pace": "race pace", "interval": "intervals"}

SCENARIOS = {
    "real": "Today (your real data)",
    "on_plan": "Preview: on plan, mid-block",
    "missed_1": "Missed 1 easy run",
    "streak_lost": "Missed a run after a long streak",
    "missed_long_run": "Skipped the long run",
    "missed_3": "Missed 3 runs in a row",
    "days_11": "11 days off",
    "days_18": "18 days off (last nudge)",
    "comeback": "Comeback after 3 misses",
    "streak_at_risk": "Evening: today's run not done",
    "rest_broken": "Evening: ran on a rest day",
    "sick": "Check-in said: sick",
}

# Sample week for athletes with no plan yet (same pattern as the voice pack's demo).
TEMPLATE = ["rest", "easy", "intervals", "easy", "strength", "long", "recovery"]
TEMPLATE_KM = {"easy": 8, "intervals": 9, "long": 18, "recovery": 6}


def plan_days(plan: Plan) -> dict[date, dict]:
    """One entry per day: the run if there is one, else a gym session, else rest."""
    out: dict[date, dict] = {}
    for week in plan.weeks:
        for wo in week.workouts:
            run_type = TYPE_MAP.get(wo.type)
            cur = out.get(wo.day)
            if run_type:
                pace = (wo.target_pace or "").split("–")[0].split("/")[0] or None
                out[wo.day] = {"type": run_type, "km": wo.distance_km or None, "pace": pace,
                               "workout": f"{wo.distance_km:g} km {LABEL.get(wo.type, wo.type)}", "race": wo.type == "race"}
            elif wo.type == "strength" and (cur is None or cur["type"] == "rest"):
                out[wo.day] = {"type": "strength", "km": None, "pace": None, "workout": "gym session"}
            elif cur is None:
                out[wo.day] = {"type": "rest", "km": None, "pace": None, "workout": "rest day"}
    return out


def template_days(start: date, weeks: int = 12) -> dict[date, dict]:
    out = {}
    for i in range(weeks * 7):
        d = start + timedelta(days=i)
        t = TEMPLATE[d.weekday()]
        km = TEMPLATE_KM.get(t)
        out[d] = {"type": t, "km": km, "pace": None, "workout": f"{km} km {t}" if km else f"{t} day"}
    return out


def _runs_in(days: dict[date, dict], before: date) -> set[date]:
    return {d for d, p in days.items() if d < before and p["type"] in RUN}


def _find(days: dict[date, dict], start: date, pred) -> date:
    """First day from 3 weeks into the plan where pred(day) holds (scenarios need some history)."""
    for i in range(21, 140):
        d = start + timedelta(days=i)
        if d in days and pred(d):
            return d
    return start + timedelta(days=21)


def simulate(days: dict[date, dict], scenario: str) -> tuple[date, str, set[date], dict]:
    """(today, slot, run_dates, flags) for a demo scenario on this plan."""
    start = min(days)
    typ = lambda d: days.get(d, {}).get("type")  # noqa: E731
    run = lambda d: typ(d) in RUN  # noqa: E731

    def prev_run(d: date) -> date:
        d -= timedelta(days=1)
        while not run(d):
            d -= timedelta(days=1)
        return d

    if scenario == "missed_1":
        t = _find(days, start, lambda d: typ(d - timedelta(days=1)) in {"easy", "recovery"})
        y = t - timedelta(days=1)
        earlier = prev_run(prev_run(prev_run(y)))          # an older miss keeps the streak short
        return t, "morning", _runs_in(days, t) - {y, earlier}, {}
    if scenario == "streak_lost":
        t = _find(days, start, lambda d: typ(d - timedelta(days=1)) in {"easy", "recovery"})
        return t, "morning", _runs_in(days, t) - {t - timedelta(days=1)}, {}
    if scenario == "missed_long_run":
        t = _find(days, start, lambda d: typ(d - timedelta(days=1)) == "long")
        y = t - timedelta(days=1)
        return t, "morning", _runs_in(days, t) - {y, prev_run(prev_run(y))}, {}
    if scenario in {"missed_3", "sick"}:
        t = _find(days, start, lambda d: run(d - timedelta(days=1)))
        y = t - timedelta(days=1)
        gone = {y, prev_run(y), prev_run(prev_run(y))}
        return t, "morning", _runs_in(days, t) - gone, {"ill": True} if scenario == "sick" else {}
    if scenario in {"days_11", "days_18"}:
        off = 11 if scenario == "days_11" else 18
        t = _find(days, start + timedelta(days=off), lambda d: run(d - timedelta(days=1)))
        return t, "morning", {d for d in _runs_in(days, t) if d < t - timedelta(days=off)}, {}
    if scenario == "comeback":
        t = _find(days, start, lambda d: run(d - timedelta(days=1)))
        y = t - timedelta(days=1)
        gone = {prev_run(y), prev_run(prev_run(y)), prev_run(prev_run(prev_run(y)))}
        return t, "morning", _runs_in(days, t) - gone, {}
    if scenario == "streak_at_risk":
        t = _find(days, start, run)
        return t, "evening", _runs_in(days, t), {}
    if scenario == "rest_broken":
        t = _find(days, start, lambda d: typ(d) == "rest")
        return t, "evening", _runs_in(days, t) | {t}, {}
    # on_plan: a normal morning a few weeks in, every planned run done
    t = _find(days, start, lambda d: True)
    return t, "morning", _runs_in(days, t), {}


def today_card(plan: Plan | None, logged_runs: set[date], scenario: str = "real", slot: str | None = None,
               ctx: dict | None = None, today: date | None = None, done: set[date] | None = None,
               history: list[str] | None = None, flags: dict | None = None) -> dict:
    """Everything the Today card shows. `history` is the per-user list of recent nudge ids (kept by the caller)."""
    today = today or date.today()
    real_plan = plan is not None
    days = plan_days(plan) if plan else template_days(today - timedelta(days=today.weekday()) - timedelta(weeks=4))
    note = None
    if scenario == "real":
        start = min(days)
        if real_plan and today < start:
            note = f"Your plan starts {start:%a %b %d}. Pick a preview below to see the daily nudges."
        elif not real_plan:
            note = "No plan yet: build one in the Coaching Council. Pick a preview below to see the daily nudges."
        runs = set(logged_runs) | set(done or ())
        hour_slot = slot or "morning"
        nudge_today, flags = today, flags or {}
        if note:                                    # nothing real to nudge about yet: preview a normal day
            real_flags = flags
            nudge_today, hour_slot, runs, flags = simulate(days, "on_plan")
            flags = real_flags or flags              # a sick or sore check-in still pauses everything
        if flags and any(flags.values()):
            why = "a red flag" if flags.get("red_flag") else "illness" if flags.get("ill") else "pain"
            note = f"Nudges are paused: your last check-in reported {why}. Check in again when you're better."
    else:
        nudge_today, hour_slot, runs, flags = simulate(days, scenario)
        if slot and scenario not in {"streak_at_risk", "rest_broken"}:
            hour_slot = slot

    eng = NudgeEngine(NUDGES, VOICES, seed=random.randrange(10**6), history=history or [])
    base = dict(ctx or {})
    nudges = eng.nudges(nudge_today, hour_slot, days, runs, ctx=base, flags=flags)
    entry = days.get(nudge_today, {"type": "rest", "workout": "rest day"})
    if entry.get("race") and hour_slot == "morning" and not flags:
        nudges = [_race_day_nudge(base)] + [n for n in nudges if not n["trigger"].startswith("morning_")]
    streak = eng.streak(nudge_today - timedelta(days=1), days, runs)
    if hour_slot == "evening" and eng.kept(nudge_today, days, runs):
        streak += 1
    week_start = nudge_today - timedelta(days=nudge_today.weekday())
    week = []
    for i in range(7):
        d = week_start + timedelta(days=i)
        p = days.get(d, {"type": "rest"})
        state = "future" if d > nudge_today or (d == nudge_today and hour_slot == "morning") else (
            "kept" if eng.kept(d, days, runs) else "missed")
        if p["type"] == "rest" and d in runs and d <= nudge_today:
            state = "extra"
        week.append({"day": d.isoformat(), "type": p["type"], "workout": p.get("workout"), "state": state})
    return {
        "scenario": scenario, "scenarios": SCENARIOS, "slot": hour_slot, "date": nudge_today.isoformat(),
        "simulated": scenario != "real" or note is not None, "note": note, "streak": streak,
        "paused": bool(flags and (flags.get("ill") or flags.get("pain") or flags.get("red_flag"))),
        "today": {"type": entry["type"], "workout": entry.get("workout"), "pace": entry.get("pace"), "race": bool(entry.get("race"))},
        "week": week, "nudges": nudges, "history": eng.history[-20:], "uses_template": not real_plan,
    }


def _race_day_nudge(ctx: dict) -> dict:
    voices = json.loads(VOICES.read_text(encoding="utf-8"))
    quotes = {q["id"]: q["text"] for q in voices["quotes"]}
    lines = [line for line in voices["lines"]["kickstarter"]["race_tips"] if "{" not in line.replace("{quote:", "")]
    text = random.choice(lines or ["Race day. Don't race the first mile. Race the last one."])
    for qid, q in quotes.items():
        text = text.replace(f"{{quote:{qid}}}", f"“{q}”")
    p = next(p for p in voices["personas"] if p["id"] == "kickstarter")
    return {"trigger": "race_day", "id": "race_day", "persona": "kickstarter", "title": f"{p['emoji']} {p['name']}",
            "text": f"RACE DAY: {ctx.get('race_name', 'your race')}. {text}"}
