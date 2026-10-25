"""Streak nudges (voice pack): the pack's own 12 demo scenarios, plus PaceLab's Today card on a real plan."""

from __future__ import annotations

import subprocess
import sys
from datetime import date
from pathlib import Path

import pytest

from engine.today import SCENARIOS, today_card
from tests.test_council import RACE_DATE, TODAY, specs

ROOT = Path(__file__).resolve().parents[1]

EXPECTED = {
    "on_plan": None, "missed_1": "missed_1", "streak_lost": "streak_lost", "missed_long_run": "missed_long_run",
    "missed_3": "missed_3", "days_11": "missed_week", "days_18": "gone_quiet", "comeback": "comeback",
    "streak_at_risk": "streak_at_risk", "rest_broken": "evening_rest_broken", "sick": "paused",
}


def test_voice_pack_demo_scenarios_all_pass():
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "demo_nudges.py")], capture_output=True, text=True,
                       encoding="utf-8", env={"PYTHONIOENCODING": "utf-8", "SYSTEMROOT": "C:\\Windows"})
    assert r.returncode == 0, r.stdout + r.stderr
    assert "all scenarios pass" in r.stdout


@pytest.fixture(scope="module")
def plan():
    from engine.metrics import compute_paces
    from engine.parsers import load_folder
    from engine.plan_expander import expand, place_strength, plan_window
    runs, _ = load_folder(ROOT / "data" / "sample" / "athlete_a")
    start, n = plan_window(TODAY, RACE_DATE)
    p = expand(specs(n), start, RACE_DATE, 21.1, "Savin Rock", compute_paces(runs, 21.1))
    return place_strength(p, None, ["Tue", "Fri"])[0]


@pytest.mark.parametrize("scenario", sorted(EXPECTED))
def test_each_simulated_scenario_fires_the_right_nudge(plan, scenario):
    card = today_card(plan, set(), scenario, ctx={"race_name": "Savin Rock", "weeks_until": 23})
    assert card["nudges"], scenario
    first = card["nudges"][0]["trigger"]
    if EXPECTED[scenario]:
        assert first == EXPECTED[scenario], (scenario, first)
    assert all("{" not in n["text"] for n in card["nudges"])        # every placeholder filled
    assert len(card["week"]) == 7 and card["simulated"]


def test_sick_pauses_everything_else(plan):
    card = today_card(plan, set(), "sick")
    assert card["paused"] and {n["trigger"] for n in card["nudges"]} == {"paused"}


def test_streak_counts_rest_days(plan):
    card = today_card(plan, set(), "on_plan")
    assert card["streak"] >= 21                                   # 3+ weeks kept, rest days included


def test_real_mode_before_the_plan_starts_previews(plan):
    card = today_card(plan, set(), "real", today=date(2026, 10, 24))
    assert card["note"] and "starts" in card["note"] and card["nudges"]


def test_no_plan_uses_the_sample_week():
    card = today_card(None, set(), "missed_3")
    assert card["uses_template"] and card["nudges"][0]["trigger"] == "missed_3"


def test_race_day_morning_gets_a_race_nudge(plan):
    card = today_card(plan, set(), "real", today=RACE_DATE, ctx={"race_name": "Savin Rock"})
    assert card["today"]["race"] and card["nudges"][0]["trigger"] == "race_day"


def test_today_api():
    from fastapi.testclient import TestClient
    from main import app
    c = TestClient(app)
    s = {"x-session": "pytest-today"}
    c.post("/api/data/sample", headers=s)
    r = c.get("/api/today", params={"scenario": "missed_3"}, headers=s).json()
    assert r["nudges"][0]["trigger"] == "missed_3" and set(r["scenarios"]) == set(SCENARIOS)
    assert c.get("/api/today", params={"scenario": "nope"}, headers=s).status_code == 422
