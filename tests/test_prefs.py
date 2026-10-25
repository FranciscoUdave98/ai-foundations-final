"""Preferences (step 3): defaults, safety reconciliation, the weekly template, checker rules, and a
council run that respects them. Offline."""

from __future__ import annotations

import asyncio

import pytest

from engine import plan_checker as pc
from engine.plan_expander import expand, make_safe, place_strength, plan_window, zone_seconds
from engine.prefs import defaults, reconcile, template
from models import Preferences
from tests.test_council import RACE_DATE, TODAY, athlete, specs, tmp_logs  # noqa: F401  (fixtures)

FOUR = Preferences(runs_per_week=4, long_run_day="Sat", rest_days=["Mon", "Wed", "Fri"], gym_days=["Tue", "Thu"],
                   approach="gentle", max_weekday_min=60, max_long_min=150)


def _plan(athlete, prefs):  # noqa: F811
    from engine.metrics import compute_paces
    runs, _ = athlete
    paces = compute_paces(runs, 21.1)
    start, n = plan_window(TODAY, RACE_DATE)
    plan = expand(specs(n), start, RACE_DATE, 21.1, "Savin Rock", paces, prefs=prefs)
    plan, _ = place_strength(plan, None, [], prefs=prefs)
    return plan, paces


def _run_days(week):
    return {wo.day for wo in week.workouts if wo.type in pc.RUN_TYPES and wo.distance_km > 0}


def test_defaults_come_from_the_data(athlete):  # noqa: F811
    _, prof = athlete
    d = defaults(prof, 42.2, TODAY)
    assert d.runs_per_week == 5 and d.long_run_day == "Sun" and len(d.rest_days) == 2
    assert d.max_long_min == 180 and not set(d.gym_days) & set(d.rest_days)


def test_safety_wins_over_preferences(athlete):  # noqa: F811
    _, prof = athlete
    p, notes = reconcile(Preferences(runs_per_week=7, rest_days=[], gym_days=["Mon"]), prof)
    assert p.runs_per_week == 6 and len(p.rest_days) == 1
    assert any("7 → 6" in n for n in notes) and any("Gym moved off" in n for n in notes) is (p.rest_days == ["Mon"])


def test_template_keeps_key_sessions_apart():
    roles = template(FOUR)
    assert roles["Sat"] == "long" and [d for d, r in roles.items() if r == "rest"] == ["Mon", "Wed", "Fri"]
    quality = [d for d, r in roles.items() if r == "quality"]
    assert "Fri" not in quality and "Sun" not in quality                    # never next to the long run


def test_four_runs_a_week_is_respected_every_week(athlete):  # noqa: F811
    plan, paces = _plan(athlete, FOUR)
    es, ls = zone_seconds(paces, "Easy"), zone_seconds(paces, "Long run")
    safe, _, check = make_safe(plan, 62.9, 76.7, paces.zones[1].label, FOUR, es, ls)
    assert check.passed
    for w in safe.weeks:
        n = len(_run_days(w))
        assert (n == 4) if w.phase != "race" else (n <= 4)
        for wo in w.workouts:
            name = wo.day.strftime("%a")
            if wo.type != "race":
                assert name not in FOUR.rest_days or wo.type == "rest"
            if wo.type == "strength":
                assert name in FOUR.gym_days
            if wo.type == "long":
                assert name == "Sat" and wo.distance_km * ls / 60 <= FOUR.max_long_min + 2
            elif wo.type in pc.RUN_TYPES and wo.type != "race":
                assert wo.distance_km * es / 60 <= FOUR.max_weekday_min + 2


def test_checker_flags_each_preference(athlete):  # noqa: F811
    plan, paces = _plan(athlete, Preferences())                             # built for 5 runs, long Sunday
    es, ls = zone_seconds(paces, "Easy"), zone_seconds(paces, "Long run")
    rules = {v.rule for v in pc.check_plan(plan, 62.9, 76.7, FOUR, es, ls).violations}
    assert {"pref_runs_per_week", "pref_long_day", "pref_rest_day"} <= rules
    tight = Preferences(max_weekday_min=30, max_long_min=90)
    rules = {v.rule for v in pc.check_plan(plan, 62.9, 76.7, tight, es, ls).violations}
    assert {"pref_weekday_minutes", "pref_long_minutes"} <= rules


def test_gentle_approach_tightens_the_ramp(athlete):  # noqa: F811
    from tests.test_engine import good_plan
    p = good_plan()                                                          # weeks 54 -> 57 -> 60 (+5.6%, +5.3%)
    assert not [v for v in pc.check_plan(p, 55, 61).violations if v.rule == "weekly_jump"]
    gentle = Preferences(approach="gentle", rest_days=["Mon"], runs_per_week=6, gym_days=[])
    jumps = [v for v in pc.check_plan(p, 55, 61, gentle).violations if v.rule == "weekly_jump"]
    assert jumps


def test_council_with_four_runs_ships_a_plan_that_respects_them(athlete, tmp_logs, monkeypatch):  # noqa: F811
    from pydantic_ai.models.test import TestModel

    from agents import budget, council
    from models import RaceHit
    from tools import races as rt
    runs, prof = athlete
    monkeypatch.setattr(budget, "CAPS", budget.BudgetCaps())
    race = rt.get_race("r060")
    hit = RaceHit(**race.model_dump(exclude={"description", "lat", "lon", "zip", "source"}), miles_away=4, weeks_until=23, target_km=21.1)
    managers = [council._agent(p).override(model=TestModel()) for p in ["monk", "wallbreaker", "taper", "guru", "kickstarter"]]

    async def go():
        for m in managers:
            m.__enter__()
        try:
            return [e async for e in council.council_events(prof, runs, hit, None, today=TODAY, prefs=FOUR)]
        finally:
            for m in managers:
                m.__exit__(None, None, None)

    events = asyncio.run(go())
    view = next(e for e in events if e["type"] == "plan_ready")["plan_view"]
    assert view["check"]["passed"] and view["prefs_respected"]
    for w in view["plan"]["weeks"]:
        days = {wo["day"] for wo in w["workouts"] if wo["type"] not in ("rest", "strength") and wo["distance_km"] > 0}
        assert (len(days) == 4) if w["phase"] != "race" else (len(days) <= 4)
