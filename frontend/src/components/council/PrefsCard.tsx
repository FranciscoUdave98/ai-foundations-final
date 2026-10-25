import { TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { Info } from '../../glossary'
import { DAYS, type Day, loadSaved, parseTime, type Preferences, savePrefs, suggestRest } from '../../prefs'
import type { AppState } from '../../types'
import { toast } from '../../ui'
import { setUnits } from '../../units'

export interface PrefsValue { prefs: Preferences | null; goal: string; summary: string; notes: string[] }

/** Preferences live in the Council home so the main button can tell when they changed. Saved per athlete. */
export function usePrefs(state: AppState | null) {
  const athleteId = state?.athlete ? `${state.athlete.id}-${state.athlete.runs}` : null
  const [prefs, setPrefsState] = useState<Preferences | null>(null)
  const [goal, setGoalState] = useState('')
  const [summary, setSummary] = useState('')
  const [notes, setNotes] = useState<string[]>([])
  const touched = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const toastTimer = useRef<number | undefined>(undefined)

  // A new athlete: their saved preferences, else defaults from their data.
  useEffect(() => {
    touched.current = false
    if (!athleteId) { setPrefsState(null); return }
    const saved = loadSaved()
    if (saved?.athlete === athleteId) { setPrefsState(saved.prefs); setGoalState(saved.goal_time); return }
    setPrefsState(null); setGoalState('')
    api.prefDefaults().then((d) => setPrefsState(d.defaults as Preferences)).catch(() => {})
  }, [athleteId])

  // Save, then check with the backend what safety would change (debounced).
  useEffect(() => {
    if (!prefs || !athleteId) return
    savePrefs(athleteId, prefs, goal)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      api.prefCheck(prefs).then((r) => { setSummary(r.summary); setNotes(r.notes) }).catch(() => {})
    }, 250)
    if (touched.current) {
      window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => toast('Preferences saved'), 1200)
    }
  }, [prefs, goal, athleteId, state?.target?.id])

  const setPrefs = useCallback((p: Preferences) => { touched.current = true; setPrefsState(p) }, [])
  const setGoal = useCallback((g: string) => { touched.current = true; setGoalState(g) }, [])
  /** The demo sets defaults without a "saved" toast. */
  const reset = useCallback((p: Preferences) => { touched.current = false; setPrefsState(p); setGoalState('') }, [])
  return { prefs, goal, summary, notes, setPrefs, setGoal, reset }
}
export type PrefsState = ReturnType<typeof usePrefs>

export function PrefsCard({ state, p, disabled }: { state: AppState | null; p: PrefsState; disabled: boolean }) {
  const locked = !state?.athlete || !state?.target
  const prefs = p.prefs
  const predicted = state?.predicted_for_target
  const goalS = parseTime(p.goal)
  const predS = predicted ? parseTime(predicted) : null
  const ambitious = goalS != null && predS != null && goalS > 0 && goalS < predS * 0.92

  const body = () => {
    if (!prefs) return <p className="locked-line">Loading your defaults</p>
    const set = (patch: Partial<Preferences>) => p.setPrefs({ ...prefs, ...patch })
    const setRuns = (runs: number) => {
      const rest = suggestRest(runs, prefs.long_run_day, prefs.rest_days)
      set({ runs_per_week: runs, rest_days: rest, gym_days: prefs.gym_days.filter((d) => !rest.includes(d)) })
    }
    const toggleRest = (d: Day) => {
      if (d === prefs.long_run_day) return
      const rest = prefs.rest_days.includes(d) ? prefs.rest_days.filter((x) => x !== d) : [...prefs.rest_days, d]
      set({ rest_days: DAYS.filter((x) => rest.includes(x)), gym_days: prefs.gym_days.filter((x) => !rest.includes(x)) })
    }
    const toggleGym = (d: Day) => {
      if (prefs.rest_days.includes(d)) return
      const gym = prefs.gym_days.includes(d) ? prefs.gym_days.filter((x) => x !== d) : [...prefs.gym_days, d].slice(-3)
      set({ gym_days: DAYS.filter((x) => gym.includes(x)) })
    }
    const setGymCount = (n: number) => {
      const pool = DAYS.filter((d) => !prefs.rest_days.includes(d) && d !== prefs.long_run_day)
      const keep = prefs.gym_days.slice(0, n)
      for (const d of ['Tue', 'Thu', 'Wed', 'Sat', 'Mon', 'Fri'] as Day[]) if (keep.length < n && pool.includes(d) && !keep.includes(d)) keep.push(d)
      set({ gym_days: DAYS.filter((d) => keep.includes(d)) })
    }
    const restOk = prefs.rest_days.length === 7 - prefs.runs_per_week
    return (
      <fieldset className="prefs-grid" disabled={disabled}>
        <div className="col">
          <div className="ctl">
            <label htmlFor="pf-runs">Runs per week <Info term="runs_per_week" /></label>
            <input id="pf-runs" type="range" min={3} max={7} value={prefs.runs_per_week} onChange={(e) => setRuns(Number(e.target.value))} />
            <output>{prefs.runs_per_week}</output>
          </div>
          <div className="ctl">
            <span className="lbl">Long run <Info term="long_run" /></span>
            <div className="seg seg-sm">{(['Sat', 'Sun'] as const).map((d) => (
              <button key={d} type="button" aria-pressed={prefs.long_run_day === d}
                onClick={() => set({ long_run_day: d, rest_days: suggestRest(prefs.runs_per_week, d, prefs.rest_days.filter((x) => x !== d)) })}>{d}</button>
            ))}</div>
          </div>
          <div className="ctl ctl-days">
            <span className={`lbl${restOk ? '' : ' warn'}`}>Rest <Info term="rest_day" /></span>
            <div className="day-chips">{DAYS.map((d) => (
              <button key={d} type="button" aria-pressed={prefs.rest_days.includes(d)} disabled={d === prefs.long_run_day}
                title={d === prefs.long_run_day ? 'Your long-run day' : undefined} onClick={() => toggleRest(d)}>{d[0]}{d[1]}</button>
            ))}</div>
          </div>
          <div className="ctl ctl-days">
            <span className="lbl">Gym <Info term="gym_days" /></span>
            <input type="range" min={0} max={3} value={prefs.gym_days.length} onChange={(e) => setGymCount(Number(e.target.value))} aria-label="Gym days per week" className="short" />
            <div className="day-chips">{DAYS.map((d) => (
              <button key={d} type="button" aria-pressed={prefs.gym_days.includes(d)} disabled={prefs.rest_days.includes(d)}
                title={prefs.rest_days.includes(d) ? 'A rest day' : undefined} onClick={() => toggleGym(d)}>{d[0]}{d[1]}</button>
            ))}</div>
          </div>
        </div>
        <div className="col">
          <div className="ctl">
            <label htmlFor="pf-weekday">Weekday max <Info term="max_weekday_min" /></label>
            <input id="pf-weekday" type="range" min={30} max={120} step={15} value={prefs.max_weekday_min} onChange={(e) => set({ max_weekday_min: Number(e.target.value) })} />
            <output>{prefs.max_weekday_min} min</output>
          </div>
          <div className="ctl">
            <span className="lbl">Approach <Info term="approach" /></span>
            <div className="seg seg-sm">{(['gentle', 'balanced', 'ambitious'] as const).map((x) => (
              <button key={x} type="button" aria-pressed={prefs.approach === x} onClick={() => set({ approach: x })}>{x[0].toUpperCase() + x.slice(1)}</button>
            ))}</div>
          </div>
          <div className="ctl">
            <label htmlFor="pf-goal">Goal time <Info term="goal_time" /></label>
            <input id="pf-goal" className={`goal-in${ambitious ? ' warn' : ''}`} value={p.goal} placeholder={predicted ?? 'h:mm:ss'}
              onChange={(e) => p.setGoal(e.target.value)} title={ambitious ? 'Ambitious; the council may push back.' : undefined} />
          </div>
          <div className="ctl">
            <span className="lbl">Units <Info term="units" /></span>
            <div className="seg seg-sm">{(['km', 'mi'] as const).map((x) => (
              <button key={x} type="button" aria-pressed={prefs.units === x} onClick={() => { set({ units: x }); setUnits(x) }}>{x}</button>
            ))}</div>
          </div>
        </div>
      </fieldset>
    )
  }

  return (
    <section className={`card setup-card${locked ? ' is-locked' : ''}`} id="card-prefs" data-highlight="preferences" aria-labelledby="prefs-title">
      <div className="setup-head"><h2 id="prefs-title">Preferences</h2></div>
      {locked ? <p className="locked-line">{state?.athlete ? 'Pick a race first' : 'Load your runs first'}</p> : (
        <>
          {body()}
          <p className="prefs-line">
            {p.summary || ' '}
            {p.notes.length > 0 && (
              <span className="info warn-info" tabIndex={0} role="note" aria-label={p.notes.join(' ')}>
                <TriangleAlert size={14} aria-hidden="true" /> {p.notes.length} safety change{p.notes.length === 1 ? '' : 's'}
                <span className="info-tip" role="tooltip">{p.notes.join(' ')}</span>
              </span>
            )}
            {ambitious && <span className="warn-text"> · Ambitious goal</span>}
          </p>
        </>
      )}
    </section>
  )
}
