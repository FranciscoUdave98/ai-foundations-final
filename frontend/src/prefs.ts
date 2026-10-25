// Training preferences (step ③). Saved in localStorage; sent to the backend with every council run.
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
  goal_time: string
  plan_start: 'this_monday' | string        // or an ISO date
  units: 'km' | 'mi'
}

const KEY = 'pacelab.prefs'

export const BASE: Preferences = {
  runs_per_week: 5, long_run_day: 'Sun', rest_days: ['Mon', 'Fri'], gym_days: ['Tue', 'Thu'], max_weekday_min: 60,
  max_long_min: 150, approach: 'balanced', goal_time: '', plan_start: 'this_monday', units: 'km',
}

export function loadPrefs(): Preferences {
  try {
    return { ...BASE, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Preferences>) }
  } catch {
    return BASE
  }
}

export function savePrefs(p: Preferences): void {
  localStorage.setItem(KEY, JSON.stringify(p))
}

const list = (d: string[]) => (d.length <= 1 ? d.join('') : `${d.slice(0, -1).join(', ')} and ${d[d.length - 1]}`)
const DAY_NAME: Record<Day, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }

/** "5 runs a week, long run on Sunday, rest on Monday and Friday, 2 gym days, weekday runs up to 60 min, balanced." */
export function prefsSummary(p: Preferences, _unit: string, short = false): string {
  const rest = p.rest_days.length ? `rest on ${list(p.rest_days.map((d) => DAY_NAME[d]))}` : 'no rest day'
  const gym = `${p.gym_days.length} gym day${p.gym_days.length === 1 ? '' : 's'}`
  if (short) return `${p.runs_per_week} runs/week · long run ${p.long_run_day} · ${p.approach}`
  return `${p.runs_per_week} runs a week, long run on ${DAY_NAME[p.long_run_day]}, ${rest}, ${gym}, weekday runs up to ${p.max_weekday_min} min, ${p.approach}.`
}

/** Rest days that fit the run count: 7 − runs, never the long-run day, Mondays and Fridays first. */
export function suggestRest(runs: number, longDay: 'Sat' | 'Sun', current: Day[] = []): Day[] {
  const need = Math.max(0, 7 - runs)
  const order: Day[] = ['Mon', 'Fri', 'Wed', longDay === 'Sun' ? 'Sat' : 'Sun', 'Thu', 'Tue']
  const keep = current.filter((d) => d !== longDay).slice(0, need)
  for (const d of order) if (keep.length < need && !keep.includes(d)) keep.push(d)
  return DAYS.filter((d) => keep.includes(d))
}
