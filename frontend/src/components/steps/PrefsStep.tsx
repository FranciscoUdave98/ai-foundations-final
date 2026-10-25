import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { Info } from '../../glossary'
import { DAYS, type Day, loadSaved, parseTime, type Preferences, RAMP, savePrefs, suggestRest } from '../../prefs'
import type { AppState } from '../../types'
import type { useCouncil } from '../../useCouncil'
import { setUnits } from '../../units'

type Council = ReturnType<typeof useCouncil>

/** ③ Preferences: two columns of controls, a live summary, then "Convene the council". */
export function PrefsStep({ state, council, onStart, onDone }: {
  state: AppState | null; council: Council; onStart: () => void; onDone: () => void
}) {
  const athleteId = state?.athlete?.id ?? 'none'
  const saved = loadSaved()
  const [prefs, setPrefs] = useState<Preferences | null>(saved?.athlete === athleteId ? saved.prefs : null)
  const [goal, setGoal] = useState(saved?.athlete === athleteId ? saved.goal_time : '')
  const [summary, setSummary] = useState('')
  const [notes, setNotes] = useState<string[]>([])
  const [nowRuns, setNowRuns] = useState<number | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const t = state?.target
  const predicted = state?.predicted_for_target

  // Defaults from the athlete's data the first time.
  useEffect(() => {
    api.prefDefaults().then((d) => {
      setNowRuns(d.runs_per_week_now)
      setPrefs((p) => p ?? (d.defaults as Preferences))
    }).catch(() => setPrefs((p) => p ?? null))
  }, [athleteId])

  // Live: what safety would change, and the summary sentence (debounced).
  useEffect(() => {
    if (!prefs) return
    savePrefs(athleteId, prefs, goal)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      api.prefCheck(prefs).then((r) => { setSummary(r.summary); setNotes(r.notes) }).catch(() => {})
    }, 250)
  }, [prefs, goal, athleteId])

  if (!prefs) return <section className="card step-card"><p className="muted">Loading your defaults…</p></section>
  const set = (patch: Partial<Preferences>) => setPrefs({ ...prefs, ...patch })
  const setRuns = (runs: number) => set({ runs_per_week: runs, rest_days: suggestRest(runs, prefs.long_run_day, prefs.rest_days),
    gym_days: prefs.gym_days.filter((d) => !suggestRest(runs, prefs.long_run_day, prefs.rest_days).includes(d)) })
  const toggleRest = (d: Day) => {
    if (d === prefs.long_run_day) return
    const rest = prefs.rest_days.includes(d) ? prefs.rest_days.filter((x) => x !== d) : [...prefs.rest_days, d]
    set({ rest_days: DAYS.filter((x) => rest.includes(x)), gym_days: prefs.gym_days.filter((x) => !rest.includes(x)) })
  }
  const toggleGym = (d: Day) => {
    if (prefs.rest_days.includes(d)) return
    const on = prefs.gym_days.includes(d)
    const gym = on ? prefs.gym_days.filter((x) => x !== d) : [...prefs.gym_days, d].slice(-3)
    set({ gym_days: DAYS.filter((x) => gym.includes(x)) })
  }
  const setGymCount = (n: number) => {
    const pool = DAYS.filter((d) => !prefs.rest_days.includes(d) && d !== prefs.long_run_day)
    const keep = prefs.gym_days.slice(0, n)
    for (const d of ['Tue', 'Thu', 'Wed', 'Sat', 'Mon', 'Fri'] as Day[]) if (keep.length < n && pool.includes(d) && !keep.includes(d)) keep.push(d)
    set({ gym_days: DAYS.filter((d) => keep.includes(d)) })
  }
  const needRest = 7 - prefs.runs_per_week
  const restOk = prefs.rest_days.length === needRest
  const goalS = parseTime(goal)
  const predS = predicted ? parseTime(predicted) : null
  const ambitious = goalS != null && predS != null && goalS > 0 && goalS < predS * 0.92

  async function convene() {
    if (!prefs) return
    savePrefs(athleteId, prefs, goal)
    onStart()
    await council.start({ goal_time: goal.trim() || null, mode: 'lean', distance_km: t?.target_km ?? null, preferences: prefs })
    onDone()
  }

  return (
    <section className="card step-card prefs" data-highlight="preferences">
      <div className="card-head">
        <div><h2>Your preferences</h2><div className="card-sub">The plan follows these as rules. Safety still wins if they clash, and the verdict says where.</div></div>
      </div>
      <div className="prefs-grid">
        <div className="prefs-col">
          <div className="ctl">
            <label>Runs per week <Info term="runs_per_week" /><strong>{prefs.runs_per_week}</strong></label>
            <input type="range" min={3} max={7} value={prefs.runs_per_week} onChange={(e) => setRuns(Number(e.target.value))} />
            {nowRuns != null && <span className="hint">You run about {nowRuns} a week now.</span>}
          </div>
          <div className="ctl">
            <label>Long-run day <Info term="long_run" /></label>
            <div className="seg">{(['Sat', 'Sun'] as const).map((d) => (
              <button key={d} aria-pressed={prefs.long_run_day === d}
                onClick={() => set({ long_run_day: d, rest_days: suggestRest(prefs.runs_per_week, d, prefs.rest_days.filter((x) => x !== d)) })}>{d === 'Sat' ? 'Saturday' : 'Sunday'}</button>
            ))}</div>
          </div>
          <div className="ctl">
            <label>Rest days <Info term="rest_day" /><span className={restOk ? 'hint' : 'hint amber'}>pick {needRest}</span></label>
            <div className="day-chips">{DAYS.map((d) => (
              <button key={d} aria-pressed={prefs.rest_days.includes(d)} disabled={d === prefs.long_run_day} onClick={() => toggleRest(d)}>{d}</button>
            ))}</div>
          </div>
          <div className="ctl">
            <label>Gym days <Info term="gym_days" /><strong>{prefs.gym_days.length}</strong></label>
            <input type="range" min={0} max={3} value={prefs.gym_days.length} onChange={(e) => setGymCount(Number(e.target.value))} />
            <div className="day-chips">{DAYS.map((d) => (
              <button key={d} aria-pressed={prefs.gym_days.includes(d)} disabled={prefs.rest_days.includes(d)} onClick={() => toggleGym(d)}>{d}</button>
            ))}</div>
          </div>
        </div>
        <div className="prefs-col">
          <div className="ctl">
            <label>Max weekday run <Info term="max_weekday_min" /><strong>{prefs.max_weekday_min} min</strong></label>
            <input type="range" min={30} max={120} step={15} value={prefs.max_weekday_min} onChange={(e) => set({ max_weekday_min: Number(e.target.value) })} />
          </div>
          <div className="ctl">
            <label>Max long run <Info term="max_long_min" /><strong>{prefs.max_long_min} min</strong></label>
            <input type="range" min={90} max={210} step={15} value={prefs.max_long_min} onChange={(e) => set({ max_long_min: Number(e.target.value) })} />
          </div>
          <div className="ctl">
            <label>Approach <Info term="approach" /><span className="hint">up to {RAMP[prefs.approach]}% more a week</span></label>
            <div className="seg">{(['gentle', 'balanced', 'ambitious'] as const).map((a) => (
              <button key={a} aria-pressed={prefs.approach === a} onClick={() => set({ approach: a })}>{a[0].toUpperCase() + a.slice(1)}</button>
            ))}</div>
          </div>
          <div className="ctl">
            <label>Goal time <Info term="goal_time" /><span className="hint">optional</span></label>
            <input className="text-in" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. 3:15:00" maxLength={10} />
            {predicted && <span className="hint">Your data predicts {predicted}</span>}
            {ambitious && <span className="hint amber">Ambitious; the council may push back.</span>}
          </div>
          <div className="ctl">
            <label>Plan start <Info term="plan_start" /></label>
            <div className="seg">
              <button aria-pressed={prefs.plan_start === null} onClick={() => set({ plan_start: null })}>This Monday</button>
              <button aria-pressed={prefs.plan_start !== null} onClick={() => set({ plan_start: prefs.plan_start ?? new Date().toISOString().slice(0, 10) })}>Pick a date</button>
            </div>
            {prefs.plan_start !== null && <input type="date" className="text-in" value={prefs.plan_start} onChange={(e) => set({ plan_start: e.target.value })} />}
          </div>
          <div className="ctl">
            <label>Units <Info term="units" /></label>
            <div className="seg">{(['km', 'mi'] as const).map((x) => (
              <button key={x} aria-pressed={prefs.units === x} onClick={() => { set({ units: x }); setUnits(x) }}>{x}</button>
            ))}</div>
          </div>
        </div>
      </div>
      <p className="prefs-summary" aria-live="polite">{summary}</p>
      {notes.length > 0 && <ul className="pref-notes">{notes.map((n) => <li key={n}>⚠ {n}</li>)}</ul>}
      <button className="btn btn-primary btn-big" onClick={convene} disabled={council.state.running || !t}>Convene the council</button>
    </section>
  )
}
