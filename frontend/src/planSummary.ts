// Short, computed summaries of a plan: the verdict line, 3-4 chips, phase per week, and this week's sessions.
import { addDays, fmtDay, isoDay } from './format'
import type { PlanView, Workout } from './types'
import { money } from './ui'

export type WeekKind = 'base' | 'build' | 'cutback' | 'taper' | 'race'
export const LABEL: Record<string, string> = {
  easy: 'Easy', recovery: 'Recovery', long: 'Long', tempo: 'Tempo', threshold: 'Threshold', interval: 'Intervals',
  race_pace: 'Race pace', strides: 'Strides', strength: 'Gym', cross: 'Cross', rest: 'Rest', race: 'Race',
}
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const runKm = (ws: Workout[]) => ws.filter((w) => !['rest', 'strength', 'race'].includes(w.type)).reduce((a, w) => a + w.distance_km, 0)

/** km per week and its kind: a base/build/peak week lighter than the one before is a cutback. */
export function weekKinds(view: PlanView): { km: number; kind: WeekKind; index: number }[] {
  const kms = view.plan.weeks.map((w) => runKm(w.workouts))
  return view.plan.weeks.map((w, i) => {
    let kind: WeekKind = w.phase === 'peak' ? 'build' : (w.phase as WeekKind)
    if ((kind === 'base' || kind === 'build') && i > 0 && kms[i] < kms[i - 1] * 0.92) kind = 'cutback'
    return { km: kms[i], kind, index: w.index }
  })
}

/** "Approved after 2 vetoes · every safety rule passes · preferences respected · $0.006 · 56 s" */
export function verdictLine(view: PlanView): string {
  const vetoes = view.physio.filter((r) => r.decision === 'veto').length
  const lastVeto = view.physio.length > 0 && view.physio[view.physio.length - 1].decision === 'veto'
  const r = view.receipt
  return [
    lastVeto || view.safest_version_used ? `Safest version, after ${view.physio.length} round${view.physio.length === 1 ? '' : 's'} with the Injury Guard`
      : vetoes ? `Approved after ${vetoes} redraft${vetoes === 1 ? '' : 's'}` : 'Approved first time',
    view.check.passed ? 'every safety rule passes' : 'a safety rule failed',
    view.preferences ? (view.prefs_respected ? 'preferences respected' : 'some preferences adjusted') : null,
    view.stopped_by_budget ? 'stopped by the budget cap' : null,
    r ? money(r.total_cost_usd) : null,
    r ? `${r.seconds.toFixed(0)} s` : null,
  ].filter(Boolean).join(' · ')
}

/** The plan in 3-4 chips: "Starts gentle: 48 km" · "Lighter weeks: 4, 8, 19" · "3-week taper" · "Gym Mon + Thu". */
export function planChips(view: PlanView, dist: (km: number, digits?: number) => string, avgWeek?: number | null): string[] {
  const kinds = weekKinds(view)
  const first = kinds[0]?.km ?? 0
  const lighter = kinds.filter((k) => k.kind === 'cutback').map((k) => k.index)
  const taper = view.plan.weeks.filter((w) => w.phase === 'taper').length
  const peak = Math.max(...kinds.map((k) => k.km))
  const out = [
    `${avgWeek && first <= avgWeek ? 'Starts gentle' : 'Starts at'}: ${dist(first, 0)}`,
    `Peak week: ${dist(peak, 0)}`,
    lighter.length ? `Lighter weeks: ${lighter.slice(0, 5).join(', ')}${lighter.length > 5 ? ` +${lighter.length - 5}` : ''}` : null,
    taper ? `${taper}-week taper` : null,
    view.strength?.days.length ? `Gym ${view.strength.days.join(' + ')}` : null,
  ]
  return out.filter((x): x is string => !!x).slice(0, 4)
}

/** The plan week that contains today, or the first week if the plan hasn't started. */
export function thisWeek(view: PlanView) {
  const today = isoDay(new Date())
  const wk = view.plan.weeks.find((w) => w.workouts[0].day <= today && today < addDays(w.workouts[0].day, 7)) ?? view.plan.weeks[0]
  const started = wk.workouts[0].day <= today
  return {
    week: wk,
    title: started ? `This week · W${wk.index}` : `Week 1 · from ${fmtDay(wk.workouts[0].day)}`,
    sessions: wk.workouts.filter((w) => w.type !== 'rest'),
    dayName: (w: Workout) => DAY[(new Date(`${w.day}T12:00:00`).getDay() + 6) % 7],
  }
}
