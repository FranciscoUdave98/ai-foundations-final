"""Part 1 tests: parsers, metrics engine, plan checker and the data API. No LLM calls."""

from __future__ import annotations

import io
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from engine.metrics import (
    athlete_profile, build_dashboard, compute_paces, fmt_time, load_ratio, parse_time,
    resolve_distance, riegel,
)
from engine.parsers import load_folder, parse_files
from engine.plan_checker import check_plan
from models import Plan, PlanWeek, Run, Workout

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / "data" / "sample" / "athlete_a"      # BQ marathoner from the data pack

GARMIN_CSV = """Activity Type,Date,Favorite,Title,Distance,Calories,Time,Avg HR,Max HR,Avg Run Cadence,Total Ascent
Running,2026-10-01 07:00:00,false,Secret name,6.21,500,00:50:00,145,160,170,"1,200"
Cycling,2026-10-02 07:00:00,false,Ride,20.0,600,01:00:00,130,150,--,--
Treadmill Running,2026-10-03 07:00:00,false,Tread,3.10,300,00:25:30,150,165,88,--
"""

GPX = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
 <trk><type>running</type><trkseg>
  <trkpt lat="41.3083" lon="-72.9279"><ele>10</ele><time>2026-10-05T10:00:00Z</time>
   <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
  <trkpt lat="41.3173" lon="-72.9279"><ele>15</ele><time>2026-10-05T10:05:00Z</time>
   <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>150</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
  <trkpt lat="41.3263" lon="-72.9279"><ele>12</ele><time>2026-10-05T10:10:00Z</time>
   <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>160</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
 </trkseg></trk>
</gpx>
"""


@pytest.fixture(scope="module")
def sample_runs() -> list[Run]:
    runs, _ = load_folder(SAMPLE)
    return runs


# ---------------------------------------------------------------- parsers

def test_strava_sample_parses_runs_and_skips_rides():
    runs, report = load_folder(SAMPLE)
    assert report.runs_found == len(runs) > 100
    assert report.skipped_non_runs > 0
    assert report.skipped_bad_rows == 0
    assert all(r.source == "strava_csv" for r in runs)
    assert sum(r.workout_type == "race" for r in runs) == 1          # the Sep 13 half marathon
    # distance comes from the meters column; cadence normalized to both feet
    assert all(0.3 < r.distance_km < 30 for r in runs)
    assert all(150 < r.cadence_spm < 200 for r in runs if r.cadence_spm)


def test_garmin_csv_in_miles_and_cadence():
    runs, report = parse_files([("Activities.csv", GARMIN_CSV.encode())], units="mi")
    assert len(runs) == 2 and report.skipped_non_runs == 1
    assert runs[0].distance_km == pytest.approx(6.21 * 1.609344, abs=0.01)
    assert runs[1].cadence_spm == 176                       # 88 one-foot -> 176
    assert runs[0].elevation_gain_m == pytest.approx(1200 * 0.3048)


def test_gpx_with_heart_rate():
    runs, _ = parse_files([("morning.gpx", GPX.encode())])
    assert len(runs) == 1
    r = runs[0]
    assert r.distance_km == pytest.approx(2.0, abs=0.05)
    assert r.duration_s == 600
    assert r.avg_hr == 150 and r.max_hr == 160


def test_zip_with_activities_csv_and_zip_of_gpx():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.write(SAMPLE / "activities.csv", "export_123/activities.csv")
    runs, _ = parse_files([("export.zip", buf.getvalue())])
    assert len(runs) > 100

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("activities/1.gpx", GPX)
    runs, _ = parse_files([("export.zip", buf.getvalue())])
    assert len(runs) == 1


def test_duplicates_removed_and_bad_files_reported():
    runs, report = parse_files([("a.gpx", GPX.encode()), ("b.gpx", GPX.encode()), ("x.fit", b"not a fit file")])
    assert len(runs) == 1 and report.duplicates_removed == 1
    assert any(".fit" in w for w in report.warnings)


def test_activity_names_never_kept():
    runs, _ = parse_files([("Activities.csv", GARMIN_CSV.encode())])
    assert "Secret name" not in str([r.model_dump() for r in runs])


# ---------------------------------------------------------------- metrics

def test_riegel_and_time_parsing():
    assert riegel(20 * 60, 5, 10) == pytest.approx(20 * 60 * 2 ** 1.06)
    assert fmt_time(riegel(20 * 60, 5, 10)) == "41:42"
    assert parse_time("1:35:00") == 5700
    assert parse_time("42:30") == 2550
    assert parse_time("3h05") == 11100
    assert resolve_distance("HM")[0] == "Half Marathon"
    assert resolve_distance(42.2)[0] == "Marathon"
    with pytest.raises(ValueError):
        parse_time("fast")


def test_load_ratio_zones():
    as_of = date(2026, 10, 28)
    def runs_for(acute_per_day: float) -> list[Run]:
        out = []
        for i in range(35):
            day = as_of - timedelta(days=i)
            km = acute_per_day if i < 7 else 5.0
            out.append(Run(start=datetime.combine(day, datetime.min.time()), distance_km=km, duration_s=km * 330))
        return out
    assert load_ratio(runs_for(5.0), as_of).zone == "sweet spot"
    assert load_ratio(runs_for(10.0), as_of).zone == "danger"
    assert load_ratio(runs_for(2.0), as_of).zone == "low"
    assert load_ratio([], as_of).zone == "no data"


def test_dashboard_and_profile(sample_runs):
    d = build_dashboard(sample_runs)
    assert d.as_of == max(r.start.date() for r in sample_runs)
    assert len(d.kpis.predictions) == 4
    assert d.kpis.predictions[0].time_s < d.kpis.predictions[-1].time_s
    assert sum(w.km for w in d.weekly) == pytest.approx(sum(r.distance_km for r in sample_runs), abs=1)
    assert d.pace_hr and d.efficiency and d.best_efforts

    p = athlete_profile(sample_runs)
    import json
    text = json.dumps(p)
    assert len(text) < 8000                                  # ~2K tokens max
    assert '"runs":' not in text and "duration_s" not in text  # summary only, no raw run records
    assert set(p["race_predictions"]) == {"5K", "10K", "Half Marathon", "Marathon"}


def test_predictions_use_the_race_and_spike_is_flagged(sample_runs):
    d = build_dashboard(sample_runs)
    assert "(race)" in d.kpis.prediction_basis and "Sep 13" in d.kpis.prediction_basis
    assert d.kpis.load.zone in {"caution", "danger"}                  # the scripted last-2-weeks spike
    assert any("two weeks running" in f for f in athlete_profile(sample_runs)["flags"])


def test_all_sample_athletes_load():
    for a in ("athlete_a", "athlete_b", "athlete_c"):
        runs, report = load_folder(SAMPLE.parent / a)
        assert runs and not report.warnings and report.skipped_bad_rows == 0


def test_date_range_filter(sample_runs):
    end = date(2026, 8, 31)
    d = build_dashboard(sample_runs, start=date(2026, 6, 1), end=end)
    assert d.as_of == end and d.first_day == date(2026, 6, 1)
    assert all(date(2026, 6, 1) <= x.day <= end for x in d.daily)


def test_paces_order_and_goal_warning(sample_runs):
    t = compute_paces(sample_runs, "half marathon", "1:30:00")
    z = {x.name: x for x in t.zones}
    assert z["Interval"].fast_s_per_km < z["Threshold"].fast_s_per_km < z["Marathon"].fast_s_per_km
    assert z["Marathon"].fast_s_per_km < z["Easy"].fast_s_per_km < z["Recovery"].fast_s_per_km
    assert t.race_pace == "4:16/km"
    assert compute_paces(sample_runs, "half marathon", "1:15:00").warning
    assert compute_paces(sample_runs, "10K").basis.startswith("current fitness")


# ---------------------------------------------------------------- plan checker

def make_week(index: int, monday: date, km: float, phase: str, race_km: float = 0.0) -> PlanWeek:
    d = lambda n: monday + timedelta(days=n)  # noqa: E731
    if race_km:
        wos = [
            Workout(day=d(1), type="tempo", distance_km=round(km * 0.3, 1)),
            Workout(day=d(2), type="easy", distance_km=round(km * 0.35, 1)),
            Workout(day=d(4), type="easy", distance_km=round(km * 0.35, 1)),
            Workout(day=d(6), type="race", distance_km=race_km),
        ]
    else:
        wos = [
            Workout(day=d(0), type="rest"),
            Workout(day=d(1), type="interval", distance_km=round(km * 0.17, 1)),
            Workout(day=d(2), type="easy", distance_km=round(km * 0.11, 1)),
            Workout(day=d(3), type="tempo", distance_km=round(km * 0.17, 1)),
            Workout(day=d(4), type="easy", distance_km=round(km * 0.11, 1)),
            Workout(day=d(5), type="long", distance_km=round(km * 0.33, 1)),
            Workout(day=d(6), type="easy", distance_km=round(km * 0.11, 1)),
        ]
    return PlanWeek(index=index, phase=phase, workouts=wos)


def good_plan() -> Plan:
    monday = date(2026, 10, 26)
    vols = [(54, "base"), (57, "base"), (60, "build"), (50, "build"), (60, "build"), (63, "peak"), (52, "taper")]
    weeks = [make_week(i + 1, monday + timedelta(weeks=i), km, ph) for i, (km, ph) in enumerate(vols)]
    weeks.append(make_week(8, monday + timedelta(weeks=7), 30, "race", race_km=21.1))
    return Plan(race_name="Test Half", race_date=weeks[-1].workouts[-1].day, race_distance_km=21.0975,
                goal_time="1:30:00", weeks=weeks)


def test_good_plan_passes():
    r = check_plan(good_plan(), baseline_week_km=55, baseline_peak_km=61)
    assert r.passed, r.violations


def _rules(plan: Plan, **kw) -> set[str]:
    return {v.rule for v in check_plan(plan, baseline_week_km=55, baseline_peak_km=61, **kw).violations}


def test_each_rule_fires():
    p = good_plan(); p.weeks[0] = make_week(1, p.weeks[0].workouts[0].day, 80, "base")
    assert "start_jump" in _rules(p)

    p = good_plan(); p.weeks[4] = make_week(5, p.weeks[4].workouts[0].day, 75, "build")
    assert "weekly_jump" in _rules(p)

    p = good_plan(); p.weeks[2].workouts[2].type = "tempo"            # Tue interval, Wed tempo
    assert "back_to_back_hard" in _rules(p)

    p = good_plan(); p.weeks[1].workouts[0] = Workout(day=p.weeks[1].workouts[0].day, type="easy", distance_km=5)
    assert "no_rest_day" in _rules(p)

    p = good_plan(); p.weeks[6] = make_week(7, p.weeks[6].workouts[0].day, 63, "taper")
    assert "no_taper" in _rules(p)

    p = good_plan(); p.weeks[3].workouts[5].distance_km = 30            # 30 of a ~63 km week
    assert "long_run_cap" in _rules(p)

    p = good_plan(); p.weeks[5] = make_week(6, p.weeks[5].workouts[0].day, 200, "peak")
    assert "hard_limit" in _rules(p)


# ---------------------------------------------------------------- API

def test_api_flow():
    from main import app
    c = TestClient(app)
    s = {"x-session": "pytest"}
    assert c.get("/api/profile", headers=s).status_code == 404

    assert {a["id"] for a in c.get("/api/data/samples").json()} == {"athlete_a", "athlete_b", "athlete_c"}
    assert c.post("/api/data/sample", params={"athlete": "../../backend"}, headers=s).status_code == 404
    assert c.post("/api/data/sample", params={"athlete": "athlete_b"}, headers=s).json()["total_runs"] == 76
    r = c.post("/api/data/sample", headers=s)
    assert r.status_code == 200 and r.json()["total_runs"] == 118
    assert c.get("/api/profile", headers=s).json()["race_predictions"]
    assert c.get("/api/dashboard", params={"start": "2026-07-01"}, headers=s).json()["first_day"] == "2026-07-01"
    assert c.get("/api/paces", params={"distance": "marathon", "goal_time": "3:05:00"}, headers=s).status_code == 200
    assert c.get("/api/paces", params={"distance": "banana"}, headers=s).status_code == 422
    assert c.post("/api/plan/check", json=good_plan().model_dump(mode="json"), headers=s).json()["passed"]

    r = c.post("/api/data/upload", files=[("files", ("run.gpx", GPX.encode(), "application/gpx+xml"))], headers=s)
    assert r.status_code == 200 and r.json()["total_runs"] == 1
    r = c.post("/api/data/upload", files=[("files", ("notes.txt", b"hello", "text/plain"))], headers=s)
    assert r.status_code == 422


def test_easy_run_is_not_a_best_effort(sample_runs):
    """athlete_a's fastest ~5 km run is an easy run (6:27/km vs 21:32 predicted): no 'best' 5K yet."""
    d = build_dashboard(sample_runs)
    efforts = {b.distance: b for b in d.best_efforts}
    assert efforts["5K"].hard_effort is False
    assert efforts["Half Marathon"].hard_effort is True              # the Sep 13 race
    assert "5K" not in athlete_profile(sample_runs)["best_efforts"]
