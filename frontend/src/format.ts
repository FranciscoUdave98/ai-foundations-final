export function fmtPace(sPerKm: number): string {
  const s = Math.round(sPerKm)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/km`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Parse 'YYYY-MM-DD' as a local date (no timezone shift). */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDays(iso: string, n: number): string {
  const d = parseDay(iso)
  d.setDate(d.getDate() + n)
  return isoDay(d)
}

/** Monday of the week containing iso (weeks run Monday-Sunday, like the backend). */
export function mondayOf(iso: string): string {
  return addDays(iso, -((parseDay(iso).getDay() + 6) % 7))
}

export function fmtDay(iso: string, withYear = false): string {
  const d = parseDay(iso)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${withYear ? `, ${d.getFullYear()}` : ''}`
}

export function fmtWeekday(iso: string): string {
  const d = parseDay(iso)
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function monthShort(iso: string): string {
  return MONTHS[parseDay(iso).getMonth()]
}

export function km(n: number, digits = 1): string {
  return `${n.toFixed(digits)} km`
}

/** Clean axis ticks: 0, step, 2*step ... covering max. */
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0]
  const raw = max / target
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 1000) / 1000)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}
