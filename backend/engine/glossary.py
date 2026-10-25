"""Plain-English glossary. One source for the ⓘ tooltips and the coach chat's explain_metric tool,
so a definition is always the same wherever it appears."""

GLOSSARY: dict[str, str] = {
    "load_ratio": "Load ratio: your last 7 days of running divided by your average week over the 4 weeks before. Under 0.8 is light, 0.8 to 1.3 is the sweet spot, 1.3 to 1.5 is caution, over 1.5 raises injury risk.",
    "weekly_km": "Weekly kilometers: everything you ran Monday to Sunday. The plan grows it slowly, with a lighter week every 3 or 4 weeks.",
    "long_run": "Long run: the week's longest run. It builds endurance, and it grows gradually toward race day.",
    "runs_per_week": "Runs per week: how many days you run. The rest are rest days; the plan never asks for more than you choose.",
    "rest_day": "Rest day: no running and no gym. Recovery is when the training actually turns into fitness.",
    "gym_days": "Gym days: strength sessions (single-leg work, glutes, calves, core). They make running injuries less likely; they never go on a rest day.",
    "max_weekday_min": "Max weekday run: the longest you want any non-long run to take. Code estimates minutes from distance times your easy pace.",
    "max_long_min": "Max long run: the longest you want the long run to take, estimated from distance times your long-run pace.",
    "approach": "Approach: how fast weekly volume may grow. Gentle 5%, balanced 8%, ambitious 10% a week. Ten percent is the hard safety limit for anyone.",
    "goal_time": "Goal time: the finish time you're training for. If it's much faster than your data predicts, the council may push back.",
    "plan_start": "Plan start: the Monday the plan begins. This Monday means there's no gap before training starts.",
    "units": "Units: kilometers or miles, everywhere in the app.",
    "predictions": "Predicted race times: what your current fitness suggests you could run today, from your best recent effort using the Riegel formula.",
    "easy_pace": "Easy pace: conversational running. Most of your weekly kilometers should be at this pace.",
    "threshold": "Threshold (tempo): comfortably hard, about the pace you could hold for an hour. Builds the ability to hold a fast pace.",
    "intervals": "Intervals: repeats of 800 m to 1.6 km near 5K pace with easy jogs between. Builds top-end aerobic fitness.",
    "race_pace": "Race pace: the exact pace of your goal race, practised in blocks so it feels familiar on the day.",
    "taper": "Taper: the last 1 to 3 weeks before the race, when volume drops so you arrive fresh.",
    "down_week": "Down week: a lighter week (about 80%) every 3 or 4 weeks, so the body can absorb the training.",
    "hrv": "HRV (heart rate variability): overnight variation between heartbeats. Lower than your usual often means stress, illness or fatigue.",
    "aerobic_efficiency": "Aerobic efficiency: meters per heartbeat. Higher means you cover more ground for the same effort, so you're getting fitter.",
    "plan_checker": "Plan checker: code (not AI) that enforces the safety rules: ramp limits, rest days, no back-to-back hard days, long-run caps, taper and your preferences.",
    "veto": "Veto: Dr. Taper (the physio agent) rejecting a draft for safety. The Plan Builder must revise it; after two revisions, code repairs it.",
    "token_cost": "Token cost: every AI call is billed by the tokens it reads and writes. PaceLab logs the real counts and shows the dollars per agent.",
    "fun_stats": "Fun stats: your kilometers, calories, climbing and time translated into everyday units, like Big Macs and Everests.",
    "calendar": "Training calendar: every planned workout by day, with distance, target pace and purpose.",
}


def explain(name: str) -> str | None:
    key = name.strip().lower().replace(" ", "_").replace("-", "_")
    aliases = {"acr": "load_ratio", "acute_chronic": "load_ratio", "tempo": "threshold", "interval": "intervals",
               "long": "long_run", "rest": "rest_day", "gym": "gym_days", "strength": "gym_days", "prediction": "predictions",
               "weekly_kilometers": "weekly_km", "mileage": "weekly_km", "cost": "token_cost", "checker": "plan_checker"}
    return GLOSSARY.get(aliases.get(key, key))
