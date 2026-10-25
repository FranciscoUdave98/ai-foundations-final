"""Part 4 tests: plan expander, safe-fix, gym placement, budget caps, .ics, wellness, fun cards,
and a whole council run on PydanticAI's TestModel (no API calls, no tokens).
"""

from __future__ import annotations

import asyncio
from datetime import date, timedelta
from pathlib import Path

import pytest

from engine import plan_checker as pc
from engine.fun_stats import fun_cards
from engine.ics import plan_to_ics
from engine.metrics import athlete_profile, compute_paces
from engine.parsers import load_folder
from engine.plan_expander import allowed_gym_days, expand, make_safe, place_strength, plan_window
from engine.wellness import load_wellness
from models import HARD_TYPES, RaceHit, Session, StrengthPlan, StrengthSession, WeekSpec

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "data" / "sample" / "athlete_a"
TODAY = date(2026, 10, 24)
RACE_DATE = date(2027, 4, 3)                       # Savin Rock, a Saturday


@pytest.fixture(scope="module")
def athlete():
    runs, report = load_folder(FOLDER)
    prof = athlete_profile(runs, load_wellness(FOLDER), report.strength_dates)
    return runs, prof


@pytest.fixture()
def tmp_logs(tmp_path, monkeypatch):
    """Send every log file to a temp folder so tests never touch output/ or logs/."""
    from agents import budget, council, logs, race_scout, usage
    for mod in (logs, usage, budget, council, race_scout):
        for name in ("USAGE_LOG", "SAFETY_LOG", "TRAP_LOG", "AUDIT_LOG"):
            if hasattr(mod, name):
                monkeypatch.setattr(mod, name, tmp_path / f"{name.lower()}.json")
    return tmp_path


def specs(n: int, km: float = 55, long_km: float = 18) -> list[WeekSpec]:
    out = []
    for i in range(n):
        phase = "race" if i == n - 1 else "taper" if i >= n - 3 else "build"
        target = 25 if phase == "race" else (km * 0.8 if (i + 1) % 4 == 0 else km)
        out.append(WeekSpec(week=i + 1, phase=phase, target_km=target, long_run_km=0 if phase == "race" else long_km,
                            quality=[Session(kind="interval", km=9, description="6 x 800 m"),
                                     Session(kind="tempo", km=10, description="6 km tempo")]))
    out[-2].target_km, out[-3].target_km = 35, 44
    return out


# ---------------------------------------------------------------- expander

def test_plan_window_starts_this_monday_and_caps_at_30_weeks():
    start, n = plan_window(TODAY, RACE_DATE)
    assert start == date(2026, 10, 26) and n == 23                       # no gap before the plan
    assert start + timedelta(weeks=n - 1) <= RACE_DATE < start + timedelta(weeks=n)
    start, n = plan_window(TODAY, date(2026, 12, 6))
    assert start == date(2026, 10, 26) and n == 6
    start, n = plan_window(date(2026, 10, 26), date(2026, 12, 6))           # today is a Monday: start today
    assert start == date(2026, 10, 26)
    start, n = plan_window(TODAY, date(2027, 10, 17))                      # a year out: the last 30 weeks
    assert n == 30
    start, n = plan_window(TODAY, RACE_DATE, start=date(2026, 11, 11))     # a picked date snaps to its Monday
    assert start == date(2026, 11, 9)


def test_expand_dates_paces_and_race_week(athlete):
    runs, prof = athlete
    paces = compute_paces(runs, 21.1, "1:35:00")
    start, n = plan_window(TODAY, RACE_DATE)
    plan = expand(specs(n), start, RACE_DATE, 21.1, "Savin Rock", paces, 5, "1:35:00")
    assert len(plan.weeks) == n
    race = [w for w in plan.weeks[-1].workouts if w.type == "race"]
    assert race and race[0].day == RACE_DATE and race[0].target_pace
    day_before = next(w for w in plan.weeks[-1].workouts if w.day == RACE_DATE - timedelta(days=1))
    assert day_before.type == "rest"
    for w in plan.weeks:
        assert {wo.day for wo in w.workouts} == {w.workouts[0].day + timedelta(days=d) for d in range(7)}
        assert all(wo.target_pace for wo in w.workouts if wo.type not in {"rest", "strength"})


def test_long_run_is_trimmed_in_code(athlete):
    runs, _ = athlete
    paces = compute_paces(runs, 21.1)
    start, n = plan_window(TODAY, RACE_DATE)
    plan = expand(specs(n, km=50, long_km=30), start, RACE_DATE, 21.1, "Savin Rock", paces)
    assert not [v for v in pc.check_plan(plan).violations if v.rule == "long_run_cap"]


def test_make_safe_repairs_a_reckless_draft(athlete):
    runs, prof = athlete
    paces = compute_paces(runs, 21.1)
    start, n = plan_window(TODAY, RACE_DATE)
    reckless = [WeekSpec(week=i + 1, phase="race" if i == n - 1 else "build", target_km=90 + i * 5, long_run_km=34,
                         quality=[Session(kind="interval", km=12, description="x")]) for i in range(n)]
    plan = expand(reckless, start, RACE_DATE, 21.1, "Savin Rock", paces)
    base, peak = prof["volume_km"]["avg_week_last_4"], prof["volume_km"]["peak_week_last_12"]
    before = pc.check_plan(plan, base, peak)
    assert not before.passed
    assert {"start_jump", "hard_limit", "no_down_week", "no_taper"} <= {v.rule for v in before.violations}
    safe, changes, after = make_safe(plan, base, peak)
    assert after.passed and changes
    weekly = [pc._run_km(w) for w in safe.weeks]
    assert max(weekly) <= pc.peak_cap(peak) + 0.5


def test_down_week_and_peak_rules():
    from tests.test_engine import good_plan
    p = good_plan()
    assert pc.check_plan(p, 55, 61).passed
    assert pc.peak_cap(61) == pytest.approx(91.5) and pc.peak_cap(15) == 35


def test_gym_never_the_day_before_a_hard_run(athlete):
    runs, _ = athlete
    paces = compute_paces(runs, 21.1)
    start, n = plan_window(TODAY, RACE_DATE)
    plan = expand(specs(n), start, RACE_DATE, 21.1, "Savin Rock", paces)
    strength = StrengthPlan(days=["Mon", "Thu"], voice_line="x", sessions=[
        StrengthSession(phase="build", focus="Posterior chain", minutes=40, exercises=["RDL 3x8", "Split squat 3x8", "Calf raise 3x15"])])
    with_gym, notes = place_strength(plan, strength, ["Mon", "Thu"])
    assert notes                                                   # Monday is before Tuesday's intervals: moved
    for w in with_gym.weeks:
        hard = {wo.day for wo in w.workouts if wo.type in HARD_TYPES}
        for wo in w.workouts:
            if wo.type == "strength":
                assert wo.day + timedelta(days=1) not in hard
    assert "Mon" not in allowed_gym_days(plan.weeks[0])


# ---------------------------------------------------------------- budget, ics, wellness, fun cards

def test_budget_caps(monkeypatch):
    from agents import budget
    monkeypatch.setattr(budget, "spent_so_far", lambda: (0.10, 0.20))
    monkeypatch.setattr(budget, "CAPS", budget.BudgetCaps(per_run_usd=0.01, per_session_usd=0.5, per_day_usd=2))
    budget.check(0.005)
    with pytest.raises(budget.BudgetExceeded) as e:
        budget.check(0.008, in_flight=0.003)
    assert e.value.scope == "run"
    monkeypatch.setattr(budget, "CAPS", budget.BudgetCaps(per_run_usd=1, per_session_usd=0.1, per_day_usd=2))
    with pytest.raises(budget.BudgetExceeded) as e:
        budget.check(0.0)
    assert e.value.scope == "session"


def test_ics_export(athlete):
    from tests.test_engine import good_plan
    text = plan_to_ics(good_plan())
    assert text.startswith("BEGIN:VCALENDAR") and text.rstrip().endswith("END:VCALENDAR")
    assert text.count("BEGIN:VEVENT") == sum(1 for w in good_plan().weeks for wo in w.workouts if wo.type != "rest")
    assert all(len(line.encode()) <= 75 for line in text.split("\r\n"))


def test_wellness_flags_and_gym_days(athlete):
    _, prof = athlete
    assert prof["recovery"]["hrv_ms_7d"] < prof["recovery"]["hrv_ms_baseline"]
    assert any("HRV down" in f for f in prof["flags"])
    assert prof["strength"]["usual_days"] == ["Mon", "Thu"]


def test_fun_cards_match_the_spec_examples(athlete):
    runs, _ = athlete
    cards = {c.id: c for c in fun_cards(runs)}
    assert cards["big_mac"].value == "140" and cards["ice_cream"].value == "about 588"
    assert cards["world"].value == "2.9%" and cards["central_park"].value == "119"
    assert cards["boston_nyc"].value == "about 3.3" and cards["route_66"].value == "29%"
    assert cards["everest"].value == "1.27" and cards["binge"].value == "117 hours"
    assert "156 TV episodes" in cards["binge"].detail


# ---------------------------------------------------------------- whole council on TestModel (offline)

def test_council_runs_end_to_end_offline_and_ships_a_safe_plan(athlete, tmp_logs, monkeypatch):
    """TestModel returns made-up structured output and calls every tool. Whatever the agents say,
    the plan the athlete gets must pass every checker rule."""
    from pydantic_ai.models.test import TestModel

    from agents import budget, council
    from tools import races as rt
    runs, prof = athlete
    monkeypatch.setattr(budget, "CAPS", budget.BudgetCaps())
    race = rt.get_race("r060")
    hit = RaceHit(**race.model_dump(exclude={"description", "lat", "lon", "zip", "source"}), miles_away=4, weeks_until=23,
                  target_km=21.1)
    personas = ["monk", "wallbreaker", "taper", "guru", "kickstarter"]
    managers = [council._agent(p).override(model=TestModel()) for p in personas]

    async def go():
        for m in managers:
            m.__enter__()
        try:
            return [e async for e in council.council_events(prof, runs, hit, "1:35:00", today=TODAY)]
        finally:
            for m in managers:
                m.__exit__(None, None, None)

    events = asyncio.run(go())
    types = [e["type"] for e in events]
    assert types[0] == "run_started" and types[-1] == "done"
    assert {"delegate", "agent_done", "spend"} <= set(types)
    ready = next(e for e in events if e["type"] == "plan_ready")
    view = ready["plan_view"]
    assert view["check"]["passed"] is True
    assert view["plan"]["weeks"][-1]["phase"] == "race"
    assert view["receipt"]["agents"] and view["receipt"]["total_tokens"] > 0
    assert (tmp_logs / "usage_log.json").exists()                  # every agent run was logged


def test_council_budget_stop_offline(athlete, tmp_logs, monkeypatch):
    from pydantic_ai.models.test import TestModel

    from agents import budget, council
    from tools import races as rt
    runs, prof = athlete
    monkeypatch.setattr(budget, "CAPS", budget.BudgetCaps(per_run_usd=1e-9))
    race = rt.get_race("r060")
    hit = RaceHit(**race.model_dump(exclude={"description", "lat", "lon", "zip", "source"}), miles_away=4, weeks_until=23)

    async def go():
        with council._agent("monk").override(model=TestModel()), council._agent("wallbreaker").override(model=TestModel()):
            return [e async for e in council.council_events(prof, runs, hit, None, today=TODAY)]

    events = asyncio.run(go())
    stop = [e for e in events if e["type"] == "budget_stop"]
    assert stop and stop[0]["scope"] == "run"
    assert events[-1]["type"] == "done"
