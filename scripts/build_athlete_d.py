"""Add a fourth sample runner (Athlete D, a first-time marathoner between C and A) with the same generator as the other three.

Leaves athletes A-C untouched. Deterministic (seed 4, the next one after A=1, B=2, C=3).
Run from the data/ folder:  python ../scripts/build_athlete_d.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_training_data as b  # noqa: E402

CAL_D = b.Profile(
    key="athlete_d", label="Experienced runner training for a first marathon",
    goal="First marathon under 4:00; a sub-1:55 half on the way",
    max_hr=189, rhr_base=55, hrv_base=58, vo2_start=46.5, vo2_end=48.5, weight_kg=60,
    cadence=170, easy_pace=6.05, tempo_pace=5.05, interval_pace=4.40, long_pace=6.15,
    week_km=b.ramp(34, 50, b.N, dips={11: 0.5}),
    run_days={1: "easy", 2: "tempo", 4: "easy", 6: "long"},
    gym_days=(0, 3), sleep_mean=7.3, shoe="Daily trainer D",
    events={"2026-09-20": "race_half"},
)

if __name__ == "__main__":
    b.write(CAL_D, 4)
