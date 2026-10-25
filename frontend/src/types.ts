// Mirrors backend/models.py (Part 1 data side).

export interface ParseReport {
  files_read: number
  runs_found: number
  skipped_non_runs: number
  skipped_bad_rows: number
  duplicates_removed: number
  warnings: string[]
}

export interface WeekVolume { week_start: string; km: number; runs: number; long_run_km: number; minutes: number }
export interface DayVolume { day: string; km: number }
export interface PaceHrPoint { day: string; distance_km: number; pace_s_per_km: number; avg_hr: number; meters_per_beat: number }
export interface EfficiencyWeek { week_start: string; meters_per_beat: number; easy_pace_s_per_km: number | null }
export interface BestEffort { distance: string; distance_km: number; time_s: number; time: string; pace: string; day: string; from_run_km: number; hard_effort: boolean }
export interface Prediction { distance: string; distance_km: number; time_s: number; time: string; pace: string }

export type LoadZone = 'low' | 'sweet spot' | 'caution' | 'danger' | 'no data'
export interface LoadRatio { acute_km: number; chronic_weekly_km: number; ratio: number | null; zone: LoadZone }

export interface Kpis {
  this_week_km: number
  four_week_avg_km: number
  longest_run_km: number
  load: LoadRatio
  predictions: Prediction[]
  prediction_basis: string
}

export interface FunCard { id: string; emoji: string; title: string; value: string; detail: string; basis: string }

export interface Dashboard {
  as_of: string
  first_day: string
  total_runs: number
  kpis: Kpis
  weekly: WeekVolume[]
  daily: DayVolume[]
  pace_hr: PaceHrPoint[]
  efficiency: EfficiencyWeek[]
  best_efforts: BestEffort[]
  fun: FunCard[]
  report: ParseReport | null
}

export interface Profile {
  as_of: string
  history: { first_run: string; weeks_of_data: number; runs_total: number }
  volume_km: { last_7_days: number; avg_week_last_4: number; avg_week_last_12: number; peak_week_last_12: number; weekly_last_12: number[] }
  frequency: { runs_per_week_last_4: number; weeks_with_3plus_runs_last_12: number }
  load_ratio: LoadRatio
  heart_rate: { max_observed: number | null; typical_easy_hr: number | null }
  typical_easy_pace: string | null
  aerobic_efficiency_change_pct: number | null
  race_predictions: Record<string, string>
  prediction_basis: string
  flags: string[]
}

export interface SampleAthlete { id: string; label: string; goal: string }

export type TabId = 'start' | 'dashboard' | 'races' | 'council' | 'plan' | 'checkin' | 'hood'

// ---------------------------------------------------------------- races (Part 3)

export type RaceDistance = 'any' | '5K' | '10K' | 'Half Marathon' | 'Marathon' | 'other'

export interface RaceQuery {
  zip: string
  radius_mi: number
  distance: RaceDistance
  weeks: number
  safety_demo: boolean
}

export interface RaceHit {
  id: string
  name: string
  date: string
  date_status: 'confirmed' | 'reported' | 'estimated'
  city: string
  state: string
  distances: string[]
  distance_km: number[]
  price_usd: number | null
  terrain: string
  url: string | null
  miles_away: number
  weeks_until: number
  guardian_flags: string[]
  target_km?: number | null
}

export interface RaceCard extends RaceHit {
  headline?: string | null
  why_it_fits?: string | null
  watch_out?: string | null
}

export interface RaceSearchResult {
  origin: string
  start: string
  end: string
  hits: RaceHit[]
  searched: number
  suggestions: RaceHit[]
}

export interface UsageRecord {
  run_id: string
  agent: string
  requests: number
  tool_calls: number
  input_tokens: number
  cached_input_tokens: number
  cache_write_tokens: number
  output_tokens: number
  seconds: number
  cost_usd: number
  what_if_astra_usd: number
}

export interface ScoutResult {
  run_id: string
  summary: string
  voice_line: string
  top_pick: string | null
  cards: RaceCard[]
  usage: UsageRecord
  safety_events: number
  trap_calls: number
}

export interface UsageTotals {
  runs: number
  requests: number
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  cost_usd: number
  what_if_astra_usd: number
  by_agent: Record<string, { calls: number; tokens: number; cost_usd: number }>
}

export interface UsageSummary { session: UsageTotals; all_time: UsageTotals }

// ---------------------------------------------------------------- council + plan (Part 4)

export type WorkoutType = 'easy' | 'recovery' | 'long' | 'tempo' | 'threshold' | 'interval' | 'race_pace' | 'strides' | 'strength' | 'cross' | 'rest' | 'race'

export interface Workout {
  day: string
  type: WorkoutType
  distance_km: number
  target_pace: string | null
  purpose: string
  status: 'planned' | 'done' | 'missed'
}

export interface PlanWeek { index: number; phase: string; workouts: Workout[] }
export interface Plan { race_name: string; race_date: string; race_distance_km: number; goal_time: string | null; weeks: PlanWeek[] }
export interface Violation { rule: string; week: number | null; detail: string; severity: 'block' | 'warn' }
export interface CheckResult { passed: boolean; violations: Violation[]; rules_checked: string[] }
export interface StrengthSession { phase: string; focus: string; minutes: number; exercises: string[] }
export interface StrengthPlan { days: string[]; sessions: StrengthSession[]; mobility_note: string; voice_line: string }
export interface Split { segment: string; pace: string; note: string }
export interface WristCard { goal_time: string; strategy: string; splits: Split[]; fueling: string[]; warmup: string; cues: string[]; voice_line: string }
export interface CoachRuling { ruling: string; goal_note: string; message: string; voice_line: string }
export interface PhysioReview { decision: 'approve' | 'veto'; triggers: string[]; fixes: string[]; voice_line: string }
export interface AgentReceipt { agent: string; calls: number; input_tokens: number; cached_input_tokens: number; output_tokens: number; cost_usd: number; seconds: number }
export interface Receipt { run_id: string; run_type: string; mode: string; agents: AgentReceipt[]; total_cost_usd: number; total_tokens: number; what_if_astra_usd: number; seconds: number }
export interface PaceZone { name: string; fast_s_per_km: number; slow_s_per_km: number; label: string; purpose: string }
export interface PaceTable { basis: string; race_distance_km: number; race_time: string; race_pace: string; zones: PaceZone[]; current_prediction: string | null; goal_gap_pct: number | null; warning: string | null }

export interface PlanView {
  run_id: string
  created: string
  race: RaceHit
  goal_time: string | null
  plan: Plan
  check: CheckResult
  safest_version_used: boolean
  draft_summary: string
  strength: StrengthPlan | null
  wrist_card: WristCard | null
  ruling: CoachRuling | null
  physio: PhysioReview[]
  receipt: Receipt | null
  paces: PaceTable | null
  changes: string[]
  stopped_by_budget: boolean
}

export type Persona = 'monk' | 'wallbreaker' | 'taper' | 'kickstarter' | 'guru' | 'whisperer' | 'marshal'

export interface CouncilEvent {
  type: string
  persona: Persona
  seq: number
  t_ms: number
  voice_line?: string | null
  vars?: Record<string, string | number | null | undefined>
  [key: string]: unknown
}

export interface Voices {
  personas: { id: Persona; name: string; role: string; emoji: string; catchphrase: string; quotes: string[] }[]
  quotes: { id: string; author: string; text: string; context: string; source: string }[]
  lines: Record<string, Record<string, string[]>>
  banter: Record<string, [string, string][]>
  loading: string[]
  quote_card_pool: string[]
}

export interface BudgetStatus {
  caps: { per_run_usd: number; per_session_usd: number; per_day_usd: number; max_requests_per_run: number }
  spent: { session_usd: number; today_usd: number }
}

export interface RunReceipt {
  run_id: string
  type: string
  time: string
  agents: Record<string, { calls: number; input: number; cached: number; output: number; cost_usd: number }>
  cost_usd: number
  tokens: number
  cached: number
  calls: number
  astra_usd: number
}

export interface ReceiptsSummary {
  runs: RunReceipt[]
  avg_cost_by_type: Record<string, number>
  runs_by_type: Record<string, number>
  monthly_mix: Record<string, number>
  measured_types: string[]
  cost_per_user_month: number
  scale: { '100_users': number; '10000_users': number }
}

export interface SafetyEvent { time: string; layer: string; kind: string; source: string; detail: string; excerpt: string; action: string }
export interface SafetyLog { events: SafetyEvent[]; total: number; trap_calls: unknown[] }

// ---------------------------------------------------------------- Today card (streak nudges)

export interface Nudge { trigger: string; id: string; persona: string; title: string; text: string }
export interface TodayCard {
  scenario: string
  scenarios: Record<string, string>
  slot: 'morning' | 'evening'
  date: string
  simulated: boolean
  note: string | null
  streak: number
  paused: boolean
  today: { type: string; workout: string | null; pace: string | null; race: boolean }
  week: { day: string; type: string; workout: string | null; state: 'kept' | 'missed' | 'future' | 'extra' }[]
  nudges: Nudge[]
  uses_template: boolean
}

// ---------------------------------------------------------------- weekly check-in (Part 5)

export interface CheckIn {
  missed_days: string[]
  completed_all: boolean
  illness: 'none' | 'recovering' | 'still_sick'
  illness_note: string | null
  pain_location: string | null
  pain_score: number | null
  sleep_hours: number | null
  fatigue: number | null
  mood: number | null
  long_run_day: string | null
  red_flag_symptoms: string[]
  summary: string
}
export interface DiffRow { day: string; week: number; before: string; after: string; reason: string }
export interface WeekDiff { week: number; km_before: number; km_after: number }
export interface CheckInResult {
  id: string
  created: string
  week: number
  text: string
  status: 'red_flag' | 'refused' | 'proposal' | 'no_change'
  mode: 'none' | 'light' | 'full'
  checkin: CheckIn | null
  red_flags: string[]
  stop_message: string | null
  guardian_removed: string[]
  reply: string | null
  reply_voice: string | null
  physio: PhysioReview | null
  rules_applied: string[]
  diff: DiffRow[]
  weeks: WeekDiff[]
  checker_held: string[]
  check: CheckResult | null
  usage: Receipt | null
  decision: 'pending' | 'accepted' | 'rejected' | 'n/a'
}
export interface CheckinsInfo {
  history: CheckInResult[]
  weeks: { index: number; phase: string; start: string }[]
  default_week: number | null
  flags: { red_flag?: boolean; ill?: boolean; pain?: boolean }
  plan_started: boolean
}

// ---------------------------------------------------------------- restructure: app state for the Council home

export interface AppState {
  athlete: {
    id: string
    label: string
    goal: string
    goal_distance: string
    goal_km: number
    runs: number
    avg_week_km: number
    runs_per_week: number
    as_of: string
    predictions: Record<string, string>
  } | null
  target: RaceHit | null
  predicted_for_target: string | null
  plan: { run_id: string; weeks: number; start: string; race: string; race_date: string; passed: boolean } | null
  last_scout: { query: RaceQuery; result: ScoutResult } | null
  checkin_flags: { red_flag?: boolean; ill?: boolean; pain?: boolean }
}
