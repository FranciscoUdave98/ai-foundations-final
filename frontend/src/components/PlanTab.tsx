import { useState } from 'react'
import { api } from '../api'
import { addDays, fmtDay } from '../format'
import type { PlanView, Voices, Workout } from '../types'
import { renderQuotes } from '../voices'

interface Props {
  view: PlanView | null
  voices: Voices | null
  onChange: (v: PlanView) => void
  goCouncil: () => void
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const LABEL: Record<string, string> = {
  easy: 'Easy', recovery: 'Recovery', long: 'Long run', tempo: 'Tempo', threshold: 'Threshold', interval: 'Intervals',
  race_pace: 'Race pace', strides: 'Strides', strength: 'Gym', cross: 'Cross', rest: 'Rest', race: 'RACE',
}
const NEXT: Record<Workout['status'], Workout['status']> = { planned: 'done', done: 'missed', missed: 'planned' }
const runKm = (ws: Workout[]) => ws.filter((w) => !['rest', 'strength', 'race'].includes(w.type)).reduce((a, w) => a + w.distance_km, 0)

export function PlanTab({ view, voices, onChange, goCouncil }: Props) {
  const [open, setOpen] = useState<string | null>(null)

  if (!view) {
    return (
      <div className="card soon">
        <span className="badge">My Plan</span>
        <h2>No plan yet</h2>
        <p>Convene the Coaching Council to build one from your data.</p>
        <button className="btn btn-primary" onClick={goCouncil}>Open the Coaching Council</button>
      </div>
    )
  }

  const plan = view.plan
  const peak = Math.max(...plan.weeks.map((w) => runKm(w.workouts)))
  const done = plan.weeks.flatMap((w) => w.workouts).filter((w) => w.status === 'done').length
  const total = plan.weeks.flatMap((w) => w.workouts).filter((w) => w.type !== 'rest').length

  async function toggle(w: Workout) {
    if (w.type === 'rest') return
    const status = NEXT[w.status]
    await api.setWorkout(w.day, w.type, status)
    const copy: PlanView = structuredClone(view!)
    for (const wk of copy.plan.weeks) for (const x of wk.workouts) if (x.day === w.day && x.type === w.type) x.status = status
    onChange(copy)
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>My Plan</h1>
          <p>{plan.weeks.length} weeks to <strong>{plan.race_name}</strong> on {fmtDay(plan.race_date, true)} ·
            {' '}{plan.race_distance_km.toFixed(1)} km{view.goal_time ? ` · goal ${view.goal_time}` : ''}{view.paces?.current_prediction ? ` · data predicts ${view.paces.current_prediction}` : ''}</p>
        </div>
        <div className="plan-actions">
          <span className={`status ${view.check.passed ? 'ok' : 'bad'}`}><i style={{ background: view.check.passed ? 'var(--good)' : 'var(--critical)' }} />
            {view.check.passed ? '✓ Passes every safety rule' : '✕ Fails a safety rule'}</span>
          <a className="btn" href="/api/plan.ics" download="pacelab-plan.ics">Export to calendar (.ics)</a>
        </div>
      </div>

      {view.ruling && (
        <section className="card coach-msg">
          <span className="ruling-emoji" aria-hidden="true">{voices?.personas.find((p) => p.id === 'monk')?.emoji ?? '🧘'}</span>
          <div>
            <p>{renderQuotes(voices, view.ruling.message)}</p>
            <p className="muted">{view.ruling.goal_note}</p>
          </div>
        </section>
      )}
      {(view.safest_version_used || view.changes.length > 0) && (
        <details className="card changes">
          <summary>{view.safest_version_used ? 'Code made the plan safe after the council' : 'Adjustments code made'} ({view.changes.length})</summary>
          <ul>{view.changes.map((c) => <li key={c}>{c}</li>)}</ul>
        </details>
      )}

      <div className="plan-legend">
        <span>Click a workout to mark it done, then missed. Progress: {done} of {total} sessions done.</span>
        <span className="legend-types">
          {['easy', 'long', 'tempo', 'interval', 'race_pace', 'strength', 'race'].map((t) => <span key={t} className={`wo-chip t-${t}`}>{LABEL[t]}</span>)}
        </span>
      </div>

      <div className="plan-grid" role="table" aria-label="Training plan calendar">
        <div className="plan-row head" role="row">
          <div role="columnheader">Week</div>
          {DAYS.map((d) => <div key={d} role="columnheader">{d}</div>)}
        </div>
        {plan.weeks.map((wk) => {
          const monday = wk.workouts[0].day
          const km = runKm(wk.workouts)
          return (
            <div className={`plan-row phase-${wk.phase}`} role="row" key={wk.index}>
              <div className="week-cell" role="rowheader">
                <strong>W{wk.index}</strong> <span className={`phase-tag ${wk.phase}`}>{wk.phase}</span>
                <div className="muted">{fmtDay(monday)}</div>
                <div className="week-km"><span style={{ width: `${(km / peak) * 100}%` }} /></div>
                <div className="muted">{km.toFixed(1)} km</div>
              </div>
              {DAYS.map((_, d) => {
                const day = addDays(monday, d)
                const items = wk.workouts.filter((w) => w.day === day && w.type !== 'rest')
                return (
                  <div key={d} className="day-cell" role="cell">
                    {items.length === 0 && <span className="rest">rest</span>}
                    {items.map((w) => {
                      const key = `${w.day}-${w.type}`
                      return (
                        <button key={key} className={`wo t-${w.type} s-${w.status}`} onClick={() => toggle(w)}
                          onMouseEnter={() => setOpen(key)} onMouseLeave={() => setOpen(null)} onFocus={() => setOpen(key)} onBlur={() => setOpen(null)}
                          aria-label={`${LABEL[w.type]} ${w.distance_km || ''} km ${w.target_pace ?? ''}, ${w.status}`}>
                          <span className="wo-type">{w.status === 'done' ? '✓ ' : w.status === 'missed' ? '✕ ' : ''}{LABEL[w.type] ?? w.type}</span>
                          {w.distance_km > 0 && <span className="wo-km">{w.distance_km} km</span>}
                          {w.target_pace && <span className="wo-pace">{w.target_pace}</span>}
                          {open === key && <span className="wo-tip" role="tooltip">{w.purpose}</span>}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="row-2b" style={{ marginTop: 16 }}>
        {view.wrist_card && (
          <section className="card wrist">
            <div className="card-head"><h2>⚡ Race-day wrist card</h2><span className="muted">Goal {view.wrist_card.goal_time}</span></div>
            <p>{view.wrist_card.strategy}</p>
            <table className="data"><thead><tr><th>Segment</th><th className="num">Pace</th><th>Note</th></tr></thead>
              <tbody>{view.wrist_card.splits.map((s) => <tr key={s.segment}><td>{s.segment}</td><td className="num">{s.pace}</td><td>{s.note}</td></tr>)}</tbody></table>
            {view.wrist_card.fueling.length > 0 && <p><strong>Fuel:</strong> {view.wrist_card.fueling.join(' · ')}</p>}
            {view.wrist_card.warmup && <p><strong>Warm-up:</strong> {view.wrist_card.warmup}</p>}
            {view.wrist_card.cues.length > 0 && <p><strong>Cues:</strong> {view.wrist_card.cues.join(' · ')}</p>}
          </section>
        )}
        <section className="card">
          {view.strength && (
            <>
              <div className="card-head"><h2>🏋️ Strength &amp; mobility</h2><span className="muted">{view.strength.days.join(' & ')}</span></div>
              {view.strength.sessions.map((s) => (
                <div key={s.phase} className="gym-session"><strong>{s.phase}: {s.focus}</strong> <span className="muted">{s.minutes} min</span>
                  <div className="muted">{s.exercises.join(' · ')}</div></div>
              ))}
              {view.strength.mobility_note && <p className="muted">{view.strength.mobility_note}</p>}
            </>
          )}
          {view.paces && (
            <>
              <div className="card-head" style={{ marginTop: 12 }}><h2>Your paces</h2><span className="muted">{view.paces.basis}</span></div>
              <table className="data"><tbody>{view.paces.zones.map((z) => <tr key={z.name}><td>{z.name}</td><td className="num">{z.label}</td><td className="muted">{z.purpose}</td></tr>)}</tbody></table>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
