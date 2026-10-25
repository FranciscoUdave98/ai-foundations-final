"""All Pydantic models for PaceLab.

Part 1 holds the data side (runs, dashboard, profile, paces, plan + checker).
Agent outputs (council verdicts, CheckIn, race cards) are added in later parts.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------- runs

class Run(BaseModel):
    """One running activity, normalized from any export format.

    Activity names are dropped on purpose: they are free text the athlete typed,
    which we never need and never want to hand to an agent.
    """

    start: datetime
    distance_km: float
    duration_s: float                      # moving time when known, else elapsed
    avg_hr: float | None = None
    max_hr: float | None = None
    cadence_spm: float | None = None       # steps per minute (both feet)
    elevation_gain_m: float | None = None
    calories: float | None = None
    activity_type: str = "Run"
    source: str = "unknown"                # strava_csv | garmin_csv | fit | gpx
    workout_type: Literal["race", "long", "workout"] | None = None

    @property
    def pace_s_per_km(self) -> float:
        return self.duration_s / self.distance_km if self.distance_km else 0.0


class ParseReport(BaseModel):
    files_read: int = 0
    runs_found: int = 0
    skipped_non_runs: int = 0
    skipped_bad_rows: int = 0
    duplicates_removed: int = 0
    warnings: list[str] = Field(default_factory=list)
    strength_dates: list[date] = Field(default_factory=list)   # gym sessions seen among non-run activities


# ---------------------------------------------------------------- dashboard

class WeekVolume(BaseModel):
    week_start: date
    km: float
    runs: int
    long_run_km: float
    minutes: float


class DayVolume(BaseModel):
    day: date
    km: float


class PaceHrPoint(BaseModel):
    day: date
    distance_km: float
    pace_s_per_km: float
    avg_hr: float
    meters_per_beat: float


class EfficiencyWeek(BaseModel):
    week_start: date
    meters_per_beat: float                 # higher = fitter (more distance per heartbeat)
    easy_pace_s_per_km: float | None = None


class BestEffort(BaseModel):
    distance: str                          # "5K", "10K", "Half Marathon", "Marathon"
    distance_km: float
    time_s: float
    time: str
    pace: str
    day: date
    from_run_km: float
    hard_effort: bool = True               # False: just an easy run of that length, not a real effort


class Prediction(BaseModel):
    distance: str
    distance_km: float
    time_s: float
    time: str
    pace: str


class LoadRatio(BaseModel):
    acute_km: float                        # last 7 days
    chronic_weekly_km: float               # last 28 days / 4
    ratio: float | None
    zone: Literal["low", "sweet spot", "caution", "danger", "no data"]


class Kpis(BaseModel):
    this_week_km: float
    four_week_avg_km: float
    longest_run_km: float                  # last 12 weeks
    load: LoadRatio
    predictions: list[Prediction]
    prediction_basis: str


class FunCard(BaseModel):
    id: str
    emoji: str
    title: str
    value: str                             # the big number, formatted
    detail: str                            # the sentence under it
    basis: str                             # how it was computed (tooltip)


class Dashboard(BaseModel):
    as_of: date
    first_day: date
    total_runs: int
    kpis: Kpis
    weekly: list[WeekVolume]
    daily: list[DayVolume]
    pace_hr: list[PaceHrPoint]
    efficiency: list[EfficiencyWeek]
    best_efforts: list[BestEffort]
    fun: list[FunCard] = Field(default_factory=list)
    report: ParseReport | None = None


# ---------------------------------------------------------------- paces

class PaceZone(BaseModel):
    name: str                              # Recovery, Easy, Long run, Marathon, Threshold, Interval
    fast_s_per_km: float
    slow_s_per_km: float
    label: str                             # "5:10–5:35/km"
    purpose: str


class PaceTable(BaseModel):
    basis: str                             # "goal 1:35:00 half marathon" or "current fitness"
    race_distance_km: float
    race_time: str
    race_pace: str
    zones: list[PaceZone]
    current_prediction: str | None = None  # what the data says you can run today
    goal_gap_pct: float | None = None      # + means the goal is faster than today's fitness
    warning: str | None = None


# ---------------------------------------------------------------- plan + checker

WorkoutType = Literal[
    "easy", "recovery", "long", "tempo", "threshold", "interval",
    "race_pace", "strides", "strength", "cross", "rest", "race",
]
HARD_TYPES = {"tempo", "threshold", "interval", "race_pace", "long", "race"}


class Workout(BaseModel):
    day: date
    type: WorkoutType
    distance_km: float = 0.0
    target_pace: str | None = None
    purpose: str = ""
    status: Literal["planned", "done", "missed"] = "planned"


class PlanWeek(BaseModel):
    index: int                             # 1-based
    phase: Literal["base", "build", "peak", "taper", "race"]
    workouts: list[Workout]

    @property
    def km(self) -> float:
        return round(sum(w.distance_km for w in self.workouts), 1)

    @property
    def long_run_km(self) -> float:
        runs = [w.distance_km for w in self.workouts if w.type == "long"]
        return max(runs) if runs else 0.0


class Plan(BaseModel):
    race_name: str
    race_date: date
    race_distance_km: float
    goal_time: str | None = None
    weeks: list[PlanWeek]


class Violation(BaseModel):
    rule: Literal[
        "weekly_jump", "start_jump", "back_to_back_hard", "no_rest_day",
        "no_taper", "long_run_cap", "hard_limit", "no_down_week",
        "pref_runs_per_week", "pref_long_day", "pref_rest_day", "pref_gym_day", "pref_weekday_minutes",
        "pref_long_minutes",
    ]
    week: int | None = None
    detail: str
    severity: Literal["block", "warn"] = "block"


class CheckResult(BaseModel):
    passed: bool
    violations: list[Violation]
    rules_checked: list[str]


# ---------------------------------------------------------------- races (Part 3)

RaceDistance = Literal["any", "5K", "10K", "Half Marathon", "Marathon", "other"]


class Race(BaseModel):
    """One race as loaded from data/races.csv. Text fields are already Guardian-cleaned."""

    id: str
    name: str
    date: date
    date_status: Literal["confirmed", "reported", "estimated"] = "confirmed"
    city: str
    state: str
    zip: str
    lat: float
    lon: float
    distances: list[str]
    distance_km: list[float]
    price_usd: float | None = None
    terrain: str = "road"
    url: str | None = None
    source: str = ""
    description: str = ""                 # cleaned; raw text never leaves the loader
    guardian_flags: list[str] = Field(default_factory=list)


class RaceQuery(BaseModel):
    zip: str = Field(pattern=r"^\d{5}$")
    radius_mi: float = Field(50, ge=1, le=300)
    distance: RaceDistance = "any"
    start: date | None = None              # default: today
    end: date | None = None                # default: start + 16 weeks
    weeks: int = Field(16, ge=1, le=60)
    safety_demo: bool = False              # also search the planted attack races in tests/attacks/


class RaceHit(BaseModel):
    """Structured race fields only: this is all the Head Coach ever sees about a race."""

    id: str
    name: str
    date: date
    date_status: str
    city: str
    state: str
    distances: list[str]
    distance_km: list[float]
    price_usd: float | None
    terrain: str
    url: str | None
    miles_away: float
    weeks_until: int
    guardian_flags: list[str] = Field(default_factory=list)
    target_km: float | None = None         # the distance the athlete trains for (races often offer several)


class RaceSearchResult(BaseModel):
    query: RaceQuery
    origin: str                            # "New Haven, CT 06511"
    start: date
    end: date
    hits: list[RaceHit]
    searched: int                          # races in the file
    suggestions: list[RaceHit] = Field(default_factory=list)   # wider search when nothing matched


class ScoutNote(BaseModel):
    """What the Race Scout writes for one race. Code checks every field before it is shown."""

    race_id: str
    headline: str = Field(description="One short line on what makes this race special, max 90 characters")
    why_it_fits: str = Field(description="One or two sentences on fit for this athlete's fitness and the weeks available, max 220 characters")
    watch_out: str | None = Field(None, description="One caution (hills, lottery entry, sold out, estimated date), max 160 characters")


class ScoutOutput(BaseModel):
    summary: str = Field(description="Two sentences on the options overall, max 280 characters")
    top_pick: str | None = Field(None, description="race_id of the best fit, or null")
    notes: list[ScoutNote]
    voice_line: str = Field("", description="One or two sentences in your character's voice, max 140 characters")


class RaceCard(RaceHit):
    headline: str | None = None
    why_it_fits: str | None = None
    watch_out: str | None = None


class UsageRecord(BaseModel):
    run_id: str
    agent: str
    model: str
    time: datetime
    seconds: float
    requests: int
    tool_calls: int
    input_tokens: int
    cached_input_tokens: int
    cache_write_tokens: int
    output_tokens: int
    reasoning_tokens: int
    cost_usd: float
    what_if_astra_usd: float


class ScoutResult(BaseModel):
    run_id: str
    summary: str
    voice_line: str = ""
    top_pick: str | None
    cards: list[RaceCard]
    usage: UsageRecord
    safety_events: int                     # new safety-log entries from this run
    trap_calls: int


# ---------------------------------------------------------------- training preferences (step 3)

DayName = Literal["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


class Preferences(BaseModel):
    """What the athlete wants. Code enforces every one of these; safety rules still win."""

    runs_per_week: int = Field(5, ge=3, le=7)
    long_run_day: Literal["Sat", "Sun"] = "Sun"
    rest_days: list[DayName] = Field(default_factory=lambda: ["Mon", "Fri"])
    gym_days: list[DayName] = Field(default_factory=lambda: ["Tue", "Thu"], max_length=3)
    max_weekday_min: int = Field(60, ge=30, le=120)
    max_long_min: int = Field(180, ge=90, le=210)
    approach: Literal["gentle", "balanced", "ambitious"] = "balanced"
    plan_start: date | None = None          # None = this Monday
    units: Literal["km", "mi"] = "km"


# ---------------------------------------------------------------- coaching council (Part 4)
# Every agent output has a voice_line: one in-character sentence shown on its live card.

VOICE = Field(description="One or two sentences in your character's voice, max 140 characters, with one real number")


class Session(BaseModel):
    kind: Literal["tempo", "threshold", "interval", "hills", "race_pace", "strides"]
    km: float = Field(ge=0, le=45, description="Total km of this run including warm-up and cool-down")
    description: str = Field(description="What to do, max 90 characters, e.g. '6 x 800 m at interval pace, 400 m jog'")


class WeekSpec(BaseModel):
    week: int
    phase: Literal["base", "build", "peak", "taper", "race"]
    target_km: float = Field(ge=0, le=200, description="Total running km this week (race week: excluding the race)")
    long_run_km: float = Field(ge=0, le=45, description="0 in race week")
    quality: list[Session] = Field(default_factory=list, description="0-2 hard sessions besides the long run")
    focus: str = Field("", description="Purpose of the week, max 80 characters")


class PlanDraft(BaseModel):
    summary: str = Field(description="The shape of the block in 2 sentences, max 300 characters")
    weeks: list[WeekSpec]
    voice_line: str = VOICE


class PhysioReview(BaseModel):
    decision: Literal["approve", "veto"]
    triggers: list[str] = Field(default_factory=list, description="Each reason with the number that triggered it")
    fixes: list[str] = Field(default_factory=list, description="Concrete changes, e.g. 'Week 1: 50 km, not 66'")
    voice_line: str = VOICE


class StrengthSession(BaseModel):
    phase: Literal["base", "build", "peak", "taper"]
    focus: str = Field(description="max 60 characters")
    minutes: int = Field(ge=10, le=75)
    exercises: list[str] = Field(description="3-6 exercises with sets x reps")


class StrengthPlan(BaseModel):
    days: list[Literal["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]] = Field(description="Gym days, usually 2")
    sessions: list[StrengthSession]
    mobility_note: str = Field("", description="max 160 characters")
    voice_line: str = VOICE


class Split(BaseModel):
    segment: str = Field(description="e.g. '0-5 km'")
    pace: str = Field(description="min:ss/km")
    note: str = Field("", description="max 60 characters")


class WristCard(BaseModel):
    goal_time: str
    strategy: str = Field(description="Pacing strategy in 1-2 sentences, max 220 characters")
    splits: list[Split] = Field(description="4-9 segments covering the whole race")
    fueling: list[str] = Field(default_factory=list, description="Timing of gels/water, plain, max 5 items")
    warmup: str = ""
    cues: list[str] = Field(default_factory=list, description="2-4 short mental cues")
    voice_line: str = VOICE


class CoachRuling(BaseModel):
    ruling: str = Field(description="How the council's disagreements were settled, max 300 characters")
    goal_note: str = Field(description="Goal vs what the data predicts, honest and kind, max 220 characters")
    message: str = Field(description="Message to the athlete in your character, 3-6 sentences, max 900 characters")
    voice_line: str = VOICE


class CouncilRequest(BaseModel):
    goal_time: str | None = Field(None, max_length=10)
    preferences: Preferences | None = None
    distance_km: float | None = Field(None, gt=0, le=100)   # which of the race's distances; default: the one picked
    mode: Literal["lean", "full"] = "lean"        # full = also send the last 90 days of raw runs (A/B test)


class AgentReceipt(BaseModel):
    agent: str
    calls: int
    input_tokens: int
    cached_input_tokens: int
    output_tokens: int
    cost_usd: float
    seconds: float


class Receipt(BaseModel):
    run_id: str
    run_type: str
    mode: str
    agents: list[AgentReceipt]
    total_cost_usd: float
    total_tokens: int
    what_if_astra_usd: float
    seconds: float


class PlanView(BaseModel):
    """Everything the My Plan tab shows."""

    run_id: str
    created: datetime
    race: RaceHit
    goal_time: str | None
    plan: Plan
    check: CheckResult
    safest_version_used: bool = False
    draft_summary: str = ""
    strength: StrengthPlan | None = None
    wrist_card: WristCard | None = None
    ruling: CoachRuling | None = None
    physio: list[PhysioReview] = Field(default_factory=list)
    receipt: Receipt | None = None
    paces: PaceTable | None = None
    changes: list[str] = Field(default_factory=list)      # what code changed after the council (safe-fix, gym moves)
    stopped_by_budget: bool = False
    preferences: Preferences | None = None
    pref_adjustments: list[str] = Field(default_factory=list)   # where safety overrode a preference, and why
    prefs_respected: bool = True


# ---------------------------------------------------------------- weekly check-in (Part 5)

Weekday = Literal["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


class CheckIn(BaseModel):
    """What the athlete said about their week, as fields. Only what they actually said; null when unsaid."""

    missed_days: list[Weekday] = Field(default_factory=list, description="Days with a planned session the athlete did not do")
    completed_all: bool = Field(False, description="True only if they say they did every session")
    illness: Literal["none", "recovering", "still_sick"] = "none"
    illness_note: str | None = Field(None, description="e.g. 'cold', 'flu', max 60 characters")
    pain_location: str | None = Field(None, description="e.g. 'left shin', max 40 characters; null if no pain")
    pain_score: int | None = Field(None, ge=0, le=10, description="0-10 if they gave one or clearly implied one")
    sleep_hours: float | None = Field(None, ge=0, le=14, description="Typical nightly sleep this week, if stated")
    fatigue: int | None = Field(None, ge=1, le=5, description="1 fresh to 5 exhausted, if stated or clearly implied")
    mood: int | None = Field(None, ge=1, le=5, description="1 low to 5 great, if stated or clearly implied")
    long_run_day: Weekday | None = Field(None, description="Only if they ask to move next week's long run to another day")
    red_flag_symptoms: list[str] = Field(default_factory=list, description="Chest pain or pressure, fainting, shortness of breath at rest, palpitations, suspected fracture, inability to bear weight, numbness, head injury, blood")
    summary: str = Field("", description="One plain sentence summarizing the week, max 160 characters")


class CheckInIntake(BaseModel):
    checkin: CheckIn
    reply: str = Field(description="A short reply to the athlete in your character, 1-2 sentences, max 220 characters")
    voice_line: str = Field("", description="One or two sentences in your character's voice, max 140 characters")


class CheckInMessage(BaseModel):
    message: str = Field(description="To the athlete: what changes and why, in your character, 2-5 sentences, max 700 characters")
    voice_line: str = Field("", description="One or two sentences in your character's voice, max 140 characters")


class DiffRow(BaseModel):
    day: date
    week: int
    before: str                            # "Intervals 9 km" / "Rest"
    after: str
    reason: str


class WeekDiff(BaseModel):
    week: int
    km_before: float
    km_after: float


class CheckInResult(BaseModel):
    id: str
    created: datetime
    week: int
    text: str                              # what the athlete typed, after the Guardian
    status: Literal["red_flag", "refused", "proposal", "no_change"]
    mode: Literal["none", "light", "full"]
    checkin: CheckIn | None = None
    red_flags: list[str] = Field(default_factory=list)
    stop_message: str | None = None        # see-a-doctor message (red flag) or refusal
    guardian_removed: list[str] = Field(default_factory=list)   # instruction-like sentences cut from the text
    reply: str | None = None               # Head Coach's reply
    reply_voice: str | None = None
    physio: PhysioReview | None = None
    rules_applied: list[str] = Field(default_factory=list)
    diff: list[DiffRow] = Field(default_factory=list)
    weeks: list[WeekDiff] = Field(default_factory=list)
    checker_held: list[str] = Field(default_factory=list)      # limits the plan checker enforced
    check: CheckResult | None = None
    usage: Receipt | None = None
    decision: Literal["pending", "accepted", "rejected", "n/a"] = "pending"
