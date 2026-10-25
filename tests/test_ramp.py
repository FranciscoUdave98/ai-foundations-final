"""ramp_build: a flat draft becomes a real build (climb, lighter weeks, peak before the taper), inside the rules."""
from datetime import date, timedelta

from engine import plan_checker as pc
from engine.plan_expander import baseline_specs, ramp_build
from models import WeekSpec


def flat_draft(n=27, km=44.0):
    weeks = []
    for i in range(n):
        phase = "race" if i == n - 1 else "taper" if i >= n - 3 else "build"
        target = 8.0 if phase == "race" else 38.0 if phase == "taper" else (km * 0.9 if (i + 1) % 4 == 0 else km)
        weeks.append(WeekSpec(week=i + 1, phase=phase, target_km=target, long_run_km=0 if phase == "race" else 15))
    return weeks


def build_kms(specs):
    return [s.target_km for s in specs if s.phase not in ("taper", "race")]


def test_flat_draft_climbs_to_a_late_peak():
    specs, note = ramp_build(flat_draft(), usual_km=46, baseline_peak_km=51, race_km=10, approach="balanced")
    km = build_kms(specs)
    assert note and "steady climb" in note
    assert max(km) >= 1.15 * km[0]                       # it actually builds
    assert km.index(max(km)) >= len(km) - 3              # the peak sits just before the taper
    ups = [k for i, k in enumerate(km) if i == 0 or k > pc.DOWN_WEEK_SHARE * km[i - 1] + 0.01]
    assert all(b >= a for a, b in zip(ups, ups[1:]))      # up-weeks never go backwards


def test_ramp_respects_weekly_jump_and_down_weeks():
    for approach, n in [("gentle", 27), ("balanced", 28), ("ambitious", 29), ("balanced", 30), ("balanced", 16)]:
        specs, _ = ramp_build(flat_draft(n=n), 46, 51, 10, approach)
        km = build_kms(specs)
        for i in range(1, len(km)):
            ref = max(km[max(0, i - 2):i])
            assert km[i] <= max(ref * (1 + pc.WEEKLY_JUMP_PCT), ref + pc.WEEKLY_JUMP_FLOOR_KM) + 0.01
        run = 0                                            # never 4 build weeks in a row without a lighter one
        for i in range(1, len(km)):
            run = 0 if km[i] <= pc.DOWN_WEEK_SHARE * km[i - 1] + 0.01 else run + 1
            assert run < pc.DOWN_WEEK_EVERY


def test_peak_stays_inside_the_safety_ceiling():
    specs, _ = ramp_build(flat_draft(n=30, km=60), usual_km=60, baseline_peak_km=62, race_km=42.2, approach="ambitious")
    assert max(build_kms(specs)) <= pc.peak_cap(62)


def test_taper_hangs_off_the_new_peak():
    specs, _ = ramp_build(flat_draft(), 46, 51, 10)
    top = max(build_kms(specs))
    taper = [s.target_km for s in specs if s.phase == "taper"]
    assert all(t <= pc.TAPER_MAX_SHARE * top for t in taper)


def test_short_plans_are_left_alone():
    specs = flat_draft(n=4)
    out, note = ramp_build(specs, 46, 51, 10)
    assert note is None and [s.target_km for s in out] == [s.target_km for s in specs]


def test_code_built_fallback_also_climbs():
    specs = baseline_specs(26, 46, 18, 21.1)
    out, _ = ramp_build(specs, 46, 51, 21.1)
    km = build_kms(out)
    assert km.index(max(km)) >= len(km) - 3 and max(km) > km[0]


def test_preferences_ceiling_caps_the_peak_and_is_explained():
    from engine.prefs import ceiling_note, volume_ceiling
    from models import Preferences
    p = Preferences(runs_per_week=4, long_run_day="Sun", rest_days=["Mon", "Wed", "Fri"], gym_days=["Tue", "Thu"],
                    max_weekday_min=60, max_long_min=180, approach="balanced")
    cap = volume_ceiling(p, 360, 370)                    # 6:00/km easy, 6:10/km long
    assert 40 <= cap <= 48
    specs, _ = ramp_build(flat_draft(km=40), 46, 51, 10, "balanced", ceiling_km=cap)
    assert max(build_kms(specs)) <= cap
    assert "can't go above" in ceiling_note(p, cap, 60)
    p.max_weekday_min = 90
    assert volume_ceiling(p, 360, 370) > 60              # longer weekday runs let the plan build
