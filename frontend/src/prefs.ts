// Training preferences (step ③). Saved in localStorage per athlete; sent with every council run.
export type Day = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
export const DAYS: Day[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export type Approach = 'gentle' | 'balanced' | 'ambitious'
export const RAMP: Record<Approach, number> = { gentle: 5, balanced: 8, ambitious: 10 }

export interface Preferences {
  runs_per_week: number
  long_run_day: 'Sat' | 'Sun'
  rest_days: Day[]
  gym_days: Day[]
  max_weekday_min: number
  max_long_min: number
  approach: Approach
  plan_start: string | null        // null = this Monday
  units: 'km' | 'mi'
}

export interface SavedPrefs { athlete: string; prefs: Preferences; goal_time: string }

const KEY = 'pacelab.prefs'

export const BASE: Preferences = {
  runs_per_week: 5, long_run_day: 'Sun', rest_days: ['Mon', 'Fri'], gym_days: ['Tue', 'Thu'], max_weekday_min: 60,
  max_long_min: 150, approach: 'balanced', plan_start: null, units: 'km',
}

export function loadSaved(): SavedPrefs | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as SavedPrefs | null
    return s && s.prefs ? { ...s, prefs: { ...BASE, ...s.prefs } } : null
  } catch {
    return null
  }
}

export function loadPrefs(): Preferences & { goal_time: string } {
  const s = loadSaved()
  return { ...(s?.prefs ?? BASE), goal_time: s?.goal_time ?? '' }
}

export function savePrefs(athlete: string, prefs: Preferences, goal_time: string): void {
  localStorage.setItem(KEY, JSON.stringify({ athlete, prefs, goal_time }))
}

const list = (d: string[]) => (d.length <= 1 ? d.join('') : `${d.slice(0, -1).join(', ')} and ${d[d.length - 1]}`)
const DAY_NAME: Record<Day, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }

export function prefsSummary(p: Preferences, _unit: string, short = false, start?: string): string {
  if (short) return `${p.runs_per_week} runs/week · long run ${p.long_run_day} · ${p.approach}`
  const rest = p.rest_days.length ? `rest on ${list(p.rest_days.map((d) => DAY_NAME[d]))}` : 'no rest day'
  const gym = `${p.gym_days.length} gym day${p.gym_days.length === 1 ? '' : 's'}`
  return `${p.runs_per_week} runs a week, long run on ${DAY_NAME[p.long_run_day]}, ${rest}, ${gym}, weekday runs up to ${p.max_weekday_min} min, ${p.approach}.${start ? ` Plan starts ${start}.` : ''}`
}

/** Rest days that fit the run count: 7 − runs, never the long-run day, Mondays and Fridays first. */
export function suggestRest(runs: number, longDay: 'Sat' | 'Sun', current: Day[] = []): Day[] {
  const need = Math.max(0, 7 - runs)
  const order: Day[] = ['Mon', 'Fri', 'Wed', longDay === 'Sun' ? 'Sat' : 'Sun', 'Thu', 'Tue']
  const keep = current.filter((d) => d !== longDay).slice(0, need)
  for (const d of order) if (keep.length < need && !keep.includes(d)) keep.push(d)
  return DAYS.filter((d) => keep.includes(d))
}

/** "3:05:00" / "42:30" -> seconds */
export function parseTime(t: string): number | null {
  if (!t.trim()) return null
  const parts = t.trim().split(':').map(Number)
  if (!parts.length || parts.some((x) => Number.isNaN(x))) return null
  return parts.reduce((a, x) => a * 60 + x, 0) * (parts.length === 1 ? 60 : 1)
}

// ---------------------------------------------------------------- "setup changed since the last plan"

const SETUP_KEY = 'pacelab.setup'

export function setupSig(target: { id: string; target_km?: number | null } | null, prefs: Preferences | null, goal: string): string {
  if (!target || !prefs) return ''
  const p = { ...prefs, rest_days: [...prefs.rest_days].sort(), gym_days: [...prefs.gym_days].sort(), units: undefined }
  return JSON.stringify({ race: target.id, km: target.target_km ?? null, prefs: p, goal: goal.trim() })
}
/** Remember what the last plan was built from (saved when a run starts). */
export function rememberSetup(sig: string, session: string): void { localStorage.setItem(`${SETUP_KEY}.${session}`, sig) }
export function lastSetup(session: string): string | null { return localStorage.getItem(`${SETUP_KEY}.${session}`) }
