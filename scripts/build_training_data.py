"""Generate PaceLab sample training data: 6 months of runs + daily wellness
for three anonymized athletes. Deterministic (seeded).

Outputs, per athlete, in sample/<athlete>/:
  activities.csv      Strava-export-style activity summary (subset of real column names)
  wellness_daily.csv  Garmin-style daily metrics: sleep, HRV, resting HR, VO2max, body battery, stress, readiness, steps
  athlete.json        profile + the scripted demo events

Calibration: the "athlete_a" profile is a BQ-chasing marathoner. Its CALIBRATION
block is a placeholder until real Garmin numbers replace it (see README).
"""
import csv
import json
import math
import os
import random
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

START = date(2026, 4, 26)   # Sunday
END = date(2026, 10, 24)    # Saturday, ~26 weeks
OUT = "sample"

STRAVA_COLS = ["Activity ID", "Activity Date", "Activity Name", "Activity Type", "Elapsed Time",
               "Moving Time", "Distance", "Elevation Gain", "Average Heart Rate", "Max Heart Rate",
               "Average Cadence", "Average Speed", "Max Speed", "Calories", "Relative Effort",
               "Activity Gear", "Workout Type"]
WELL_COLS = ["date", "sleep_hours", "sleep_score", "deep_sleep_min", "rem_sleep_min", "resting_hr",
             "hrv_overnight_ms", "hrv_status", "vo2max_running", "body_battery_high",
             "body_battery_low", "stress_avg", "training_readiness", "steps", "intensity_minutes"]


@dataclass
class Profile:
    key: str
    label: str
    goal: str
    max_hr: int
    rhr_base: float
    hrv_base: float
    vo2_start: float
    vo2_end: float
    weight_kg: float
    cadence: int
    easy_pace: float        # min/km
    tempo_pace: float
    interval_pace: float
    long_pace: float
    week_km: list           # target km per week (len = n weeks)
    run_days: dict          # weekday -> session type
    gym_days: tuple = ()
    sleep_mean: float = 7.0
    events: dict = field(default_factory=dict)   # iso date -> event
    shoe: str = "Daily trainer"


def weeks():
    n = ((END - START).days + 1) // 7
    return n


def ramp(base, peak, n, down_every=4, dips=None):
    """3-up-1-down progression from base to peak; dips = {week_index: factor}."""
    out = []
    for i in range(n):
        v = base + (peak - base) * i / max(n - 1, 1)
        if (i + 1) % down_every == 0:
            v *= 0.78
        out.append(v)
    for k, f in (dips or {}).items():
        out[k] *= f
    return out


N = weeks()

# ---- Athlete A: anonymized BQ-chasing marathoner (calibration placeholder) ----
A_WEEKS = ramp(46, 64, N, dips={9: 0.15, 14: 0.45})   # week 10 sick, week 15 relocation
A_WEEKS[-2] = sum(A_WEEKS[-6:-2]) / 4 * 1.45      # scripted spike -> high acute:chronic load
A_WEEKS[-1] = sum(A_WEEKS[-6:-2]) / 4 * 1.55
CAL_A = Profile(
    key="athlete_a", label="Marathoner chasing a Boston qualifier",
    goal="Sub-3:00 marathon (BQ); sub-1:30 half on the way",
    max_hr=190, rhr_base=50, hrv_base=68, vo2_start=52.0, vo2_end=54.5, weight_kg=70,
    cadence=174, easy_pace=5.45, tempo_pace=4.45, interval_pace=4.05, long_pace=5.30,
    week_km=A_WEEKS,
    run_days={1: "intervals", 2: "easy", 3: "easy", 5: "long", 6: "recovery"},  # Mon=0
    gym_days=(0, 3), sleep_mean=6.9, shoe="Daily trainer A",
    events={
        "2026-06-28": "sick_start", "2026-07-04": "sick_end",
        "2026-08-02": "relocation_start", "2026-08-08": "relocation_end",
        "2026-09-13": "race_half",
    },
)

# ---- Optional real-data calibration override (written from Garmin pull) ----
_cal_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "calibration_a.json")
if os.path.exists(_cal_path):
    with open(_cal_path) as _f:
        _cal = json.load(_f)
    for _k, _v in _cal.items():
        if _k == "week_km":
            continue
        if hasattr(CAL_A, _k):
            setattr(CAL_A, _k, _v)
    if "week_km_base" in _cal and "week_km_peak" in _cal:
        _w = ramp(_cal["week_km_base"], _cal["week_km_peak"], N, dips={9: 0.15, 14: 0.45})
        _w[-2] = sum(_w[-6:-2]) / 4 * 1.45
        _w[-1] = sum(_w[-6:-2]) / 4 * 1.55
        CAL_A.week_km = _w

# ---- Athlete B: beginner building to a first 5K ----
CAL_B = Profile(
    key="athlete_b", label="Beginner training for a first 5K",
    goal="Finish a 5K running the whole way, then break 30:00",
    max_hr=192, rhr_base=64, hrv_base=45, vo2_start=38.0, vo2_end=41.5, weight_kg=66,
    cadence=162, easy_pace=7.15, tempo_pace=6.30, interval_pace=6.05, long_pace=7.25,
    week_km=ramp(6, 19, N, dips={17: 0.4}),
    run_days={1: "easy", 3: "easy", 5: "long"},
    sleep_mean=7.3, shoe="Beginner shoe",
    events={"2026-10-10": "race_5k"},
)

# ---- Athlete C: half-marathoner, steady, low-drama ----
CAL_C = Profile(
    key="athlete_c", label="Recreational half-marathoner",
    goal="Sub-1:45 half marathon",
    max_hr=186, rhr_base=56, hrv_base=55, vo2_start=45.0, vo2_end=46.5, weight_kg=62,
    cadence=168, easy_pace=6.10, tempo_pace=5.10, interval_pace=4.45, long_pace=6.00,
    week_km=ramp(25, 40, N, dips={20: 0.3}),
    run_days={1: "tempo", 3: "easy", 5: "long", 6: "easy"},
    sleep_mean=7.2, shoe="Daily trainer C",
    events={"2026-08-16": "race_10k"},
)

SPLIT = {  # share of weekly km by session type
    "intervals": 0.17, "tempo": 0.18, "easy": 0.17, "recovery": 0.11, "long": 0.34,
}


def in_event(prof, d, start_key, end_key):
    s = next((k for k, v in prof.events.items() if v == start_key), None)
    e = next((k for k, v in prof.events.items() if v == end_key), None)
    return bool(s and e and date.fromisoformat(s) <= d <= date.fromisoformat(e))


def hr_for(prof, kind, rng, drift=0.0):
    frac = {"easy": 0.74, "recovery": 0.70, "long": 0.77, "tempo": 0.87,
            "intervals": 0.86, "race_half": 0.90, "race_5k": 0.93, "race_10k": 0.92}[kind]
    avg = prof.max_hr * frac + drift + rng.gauss(0, 2.5)
    mx = min(prof.max_hr, avg + {"intervals": 16, "tempo": 9}.get(kind, 12) + rng.gauss(0, 2))
    return round(avg), round(mx)


def pace_for(prof, kind, rng, fitness):
    base = {"easy": prof.easy_pace, "recovery": prof.easy_pace + 0.25, "long": prof.long_pace,
            "tempo": prof.tempo_pace, "intervals": prof.interval_pace}.get(kind, prof.easy_pace)
    # min/km; fitness 0..1 makes paces ~3% faster by the end
    return base * (1 - 0.03 * fitness) + rng.gauss(0, 0.07)


def generate(prof, seed):
    rng = random.Random(seed)
    acts, well = [], []
    loads = []          # daily training load (TRIMP-like) for wellness response
    act_id = 9_000_000_000 + seed * 100_000
    total_days = (END - START).days + 1
    for i in range(total_days):
        d = START + timedelta(days=i)
        wk = min(i // 7, N - 1)
        fitness = i / total_days
        wd = d.weekday()
        sick = in_event(prof, d, "sick_start", "sick_end")
        moving = in_event(prof, d, "relocation_start", "relocation_end")
        ev = prof.events.get(d.isoformat())
        day_load = 0.0

        sessions = []
        if ev and ev.startswith("race_"):
            sessions.append(ev)
        elif wd in prof.run_days and not sick:
            kind = prof.run_days[wd]
            if moving and kind != "long" and rng.random() < 0.6:
                kind = None
            if kind and rng.random() > 0.05:      # 5% random skipped run
                sessions.append(kind)
        if sick and d.isoformat() == prof.events.get("sick_start") and False:
            pass

        for kind in sessions:
            if kind.startswith("race_"):
                dist = {"race_half": 21.2, "race_5k": 5.05, "race_10k": 10.05}[kind]
                p = {"race_half": prof.tempo_pace * 0.985, "race_5k": prof.tempo_pace * 0.98,
                     "race_10k": prof.tempo_pace * 0.99}[kind]
                p = p * (1 - 0.03 * fitness)
                avg_hr, max_hr = hr_for(prof, kind, rng)
                name = {"race_half": "Race – Half Marathon", "race_5k": "Race – 5K",
                        "race_10k": "Race – 10K"}[kind]
                wtype = 1
            else:
                share = SPLIT[kind] / sum(SPLIT[k] for k in prof.run_days.values())
                dist = prof.week_km[wk] * share * rng.uniform(0.92, 1.08)
                if kind == "long":
                    dist = max(dist, 6 if prof.key == "athlete_b" else 12)
                dist = round(max(dist, 2.0), 2)
                p = pace_for(prof, kind, rng, fitness)
                drift = 4 if kind == "long" and dist > 22 else 0
                avg_hr, max_hr = hr_for(prof, kind, rng, drift)
                name = {"easy": "Easy run", "recovery": "Recovery jog", "long": "Long run",
                        "tempo": "Tempo run", "intervals": rng.choice(
                            ["Intervals 6x1K", "Intervals 5x1200m", "Intervals 8x800m"])}[kind]
                wtype = {"long": 2, "intervals": 3, "tempo": 3}.get(kind, 0)
            dist = round(dist, 2)
            moving_s = round(dist * p * 60)
            elapsed_s = moving_s + rng.randint(20, 240)
            speed = dist * 1000 / moving_s
            hour = rng.choice([17, 18, 18, 19]) if prof.key == "athlete_a" else rng.choice([7, 12, 18])
            ts = datetime(d.year, d.month, d.day, hour + 4, rng.randint(0, 59), rng.randint(0, 59))  # UTC
            trimp = moving_s / 60 * ((avg_hr - prof.rhr_base) / (prof.max_hr - prof.rhr_base)) * \
                0.64 * math.exp(1.92 * (avg_hr - prof.rhr_base) / (prof.max_hr - prof.rhr_base))
            day_load += trimp
            act_id += rng.randint(1, 900)
            acts.append({
                "Activity ID": act_id,
                "Activity Date": ts.strftime("%b %d, %Y, %I:%M:%S %p"),
                "Activity Name": name,
                "Activity Type": "Run",
                "Elapsed Time": elapsed_s,
                "Moving Time": moving_s,
                "Distance": dist,
                "Elevation Gain": round(dist * rng.uniform(4, 14), 1),
                "Average Heart Rate": avg_hr,
                "Max Heart Rate": max_hr,
                "Average Cadence": prof.cadence + rng.randint(-3, 4) + (6 if wtype == 1 else 0),
                "Average Speed": round(speed, 3),
                "Max Speed": round(speed * rng.uniform(1.15, 1.35), 3),
                "Calories": round(dist * prof.weight_kg * 1.02),
                "Relative Effort": round(trimp / 2.2),
                "Activity Gear": prof.shoe,
                "Workout Type": wtype,
            })

        if wd in prof.gym_days and not sick and not moving:
            act_id += rng.randint(1, 900)
            mins = rng.randint(48, 65)
            ts = datetime(d.year, d.month, d.day, 21 + rng.randint(0, 1), rng.randint(0, 59), 0)
            acts.append({
                "Activity ID": act_id, "Activity Date": ts.strftime("%b %d, %Y, %I:%M:%S %p"),
                "Activity Name": "Strength – lower body" if wd == 0 else "Strength – upper body & core",
                "Activity Type": "Weight Training", "Elapsed Time": mins * 60, "Moving Time": mins * 60,
                "Distance": 0.0, "Elevation Gain": 0.0, "Average Heart Rate": rng.randint(102, 118),
                "Max Heart Rate": rng.randint(140, 158), "Average Cadence": "", "Average Speed": 0.0,
                "Max Speed": 0.0, "Calories": rng.randint(260, 380), "Relative Effort": rng.randint(12, 22),
                "Activity Gear": "", "Workout Type": "",
            })
            day_load += 25

        loads.append(day_load)

        # ---- wellness (responds to load, sickness, relocation) ----
        acute = sum(loads[-7:]) / 7
        chronic = sum(loads[-28:]) / max(len(loads[-28:]), 1)
        ratio = acute / chronic if chronic > 1 else 1.0
        yesterday = loads[-2] if len(loads) > 1 else 0
        sleep = prof.sleep_mean + (0.55 if wd in (5, 6) else 0) + rng.gauss(0, 0.45)
        if moving:
            sleep -= 0.9
        if sick:
            sleep += rng.uniform(-0.8, 1.0)
        sleep = round(min(max(sleep, 4.6), 9.6), 2)
        rhr = prof.rhr_base - 2.0 * fitness + 0.012 * yesterday + 9 * max(ratio - 1.15, 0) + rng.gauss(0, 1.0)
        hrv = prof.hrv_base + 5 * fitness - 0.03 * yesterday - 30 * max(ratio - 1.15, 0) + \
            2.2 * (sleep - prof.sleep_mean) + rng.gauss(0, 4)
        if sick:
            rhr += 6 + rng.gauss(0, 1)
            hrv -= 18 + rng.gauss(0, 3)
        if moving:
            rhr += 2
            hrv -= 6
        rhr, hrv = round(rhr), round(max(hrv, 18))
        vo2 = prof.vo2_start + (prof.vo2_end - prof.vo2_start) * fitness
        if any(in_event(prof, d - timedelta(days=k), "sick_start", "sick_end") for k in range(0, 15)):
            vo2 -= 0.6
        sleep_score = round(min(98, max(35, 76 + 7.5 * (sleep - 6.5) + 0.25 * (hrv - prof.hrv_base) + rng.gauss(0, 3))))
        hrv_status = "balanced" if hrv >= prof.hrv_base * 0.88 else ("unbalanced" if hrv >= prof.hrv_base * 0.72 else "low")
        readiness = round(min(100, max(5, 66 + 0.6 * (sleep_score - 72) + 0.8 * (hrv - prof.hrv_base)
                                        - 0.05 * yesterday - 60 * max(ratio - 1.25, 0) + rng.gauss(0, 4))))
        bb_high = round(min(100, max(20, 50 + 7 * (sleep - 5.5) + 0.4 * (hrv - prof.hrv_base) + rng.gauss(0, 5))))
        stress = round(min(80, max(12, 30 - 0.3 * (hrv - prof.hrv_base) + (8 if moving else 0) + (10 if sick else 0) + rng.gauss(0, 4))))
        steps = round(rng.gauss(9500, 1800) + 1300 * sum(a["Distance"] for a in acts[-3:] if a["Activity Date"].startswith(d.strftime("%b %d, %Y"))))
        well.append({
            "date": d.isoformat(), "sleep_hours": sleep, "sleep_score": sleep_score,
            "deep_sleep_min": round(sleep * 60 * rng.uniform(0.14, 0.21)),
            "rem_sleep_min": round(sleep * 60 * rng.uniform(0.18, 0.25)),
            "resting_hr": rhr, "hrv_overnight_ms": hrv, "hrv_status": hrv_status,
            "vo2max_running": round(vo2, 1), "body_battery_high": bb_high,
            "body_battery_low": round(max(5, bb_high - rng.uniform(45, 75) - 0.05 * day_load)),
            "stress_avg": stress, "training_readiness": readiness, "steps": max(steps, 2500),
            "intensity_minutes": round(sum(a["Moving Time"] for a in acts
                                           if a["Activity Date"].startswith(d.strftime("%b %d, %Y"))) / 60),
        })
    return acts, well


def write(prof, seed):
    acts, well = generate(prof, seed)
    folder = os.path.join(OUT, prof.key)
    os.makedirs(folder, exist_ok=True)
    acts.sort(key=lambda a: datetime.strptime(a["Activity Date"], "%b %d, %Y, %I:%M:%S %p"), reverse=True)
    with open(os.path.join(folder, "activities.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=STRAVA_COLS)
        w.writeheader()
        w.writerows(acts)
    with open(os.path.join(folder, "wellness_daily.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=WELL_COLS)
        w.writeheader()
        w.writerows(well)
    meta = {
        "athlete_id": prof.key, "label": prof.label, "goal": prof.goal, "max_hr": prof.max_hr,
        "units": {"Distance": "km", "Elapsed Time": "s", "Moving Time": "s", "Elevation Gain": "m",
                  "Average Speed": "m/s", "Average Cadence": "steps/min"},
        "gym_days": [["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] for i in prof.gym_days],
        "scripted_events": prof.events,
        "synthetic": True,
        "window": {"start": START.isoformat(), "end": END.isoformat()},
    }
    with open(os.path.join(folder, "athlete.json"), "w") as f:
        json.dump(meta, f, indent=2)
    runs = [a for a in acts if a["Activity Type"] == "Run"]
    km = sum(a["Distance"] for a in runs)
    print(f"{prof.key}: {len(runs)} runs, {km:.0f} km, {len(acts) - len(runs)} gym, {len(well)} wellness days")
    return acts, well


if __name__ == "__main__":
    for s, p in enumerate([CAL_A, CAL_B, CAL_C], 1):
        write(p, s)
