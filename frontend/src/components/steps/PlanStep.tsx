import { useState } from 'react'
import { api, SESSION_ID } from '../../api'
import { addDays, fmtDay } from '../../format'
import type { PlanView, Voices, Workout } from '../../types'
import type { useCouncil } from '../../useCouncil'
import { useUnits } from '../../units'
import { renderQuotes } from '../../voices'
import { CheckinTab } from '../CheckinTab'

type Council = ReturnType<typeof useCouncil>
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const LABEL: Record<string, string> = {
  easy: 'Easy', recovery: 'Recovery', long: 'Long run', tempo: 'Tempo', threshold: 'Threshold', interval: 'Intervals',
  race_pace: 'Race pace', strides: 'Strides', strength: 'Gym', cross: 'Cross', rest: 'Rest', race: 'RACE',
}
const NEXT: Record<Workout['status'], Workout['status']> = { planned: 'done', done: 'missed', missed: 'planned' }
export const runKm = (ws: Workout[]) => ws.filter((w) => !['rest', 'strength', 'race'].includes(w.type)).reduce((a, w) => a + w.distance_km, 0)

/** ⑤ Your plan: verdict, 4 numbers, the calendar; wrist card and strength folded away. */
export function PlanStep({ view, council, voices, onPlan, onSpend, changePrefs }: {
  view: PlanView; council: Council; voices: Voices | null; onPlan: (p: PlanView) => void; onSpend: () => void; changePrefs: () => void
}) {
  const u = useUnits()
  const [open, setOpen] = useState<string | null>(null)
  const [checkin, setCheckin] = useState(false)
  const plan = view.plan
  const kms = plan.weeks.map((w) => runKm(w.workouts))
  const peak = Math.max(...kms)
  const longest = Math.max(...plan.weeks.flatMap((w) => w.workouts.filter((x) => x.type === 'long').map((x) => x.distance_km)), 0)
  const vetoes = view.physio.filter((r) => r.decision === 'veto').length
  const r = view.receipt
  const verdict = [
    vetoes ? `Approved after ${vetoes} veto${vetoes === 1 ? '' : 'es'}` : 'Approved first time',
    view.check.passed ? 'every safety rule passes' : 'a safety rule failed',
    view.stopped_by_budget ? 'stopped by the budget cap' : null,
    r ? `$${r.total_cost_usd.toFixed(4)}` : null,
    r ? `${r.seconds.toFixed(0)} s` : null,
  ].filter(Boolean).join(' · ')

  async function toggle(w: Workout) {
    if (w.type === 'rest') return
    const status = NEXT[w.status]
    await api.setWorkout(w.day, w.type, status)
    const copy: PlanView = structuredClone(view)
    for (const wk of copy.plan.weeks) for (const x of wk.workouts) if (x.day === w.day && x.type === w.type) x.status = status
    onPlan(copy)
  }

  return (
    <div className="plan-step">
      <section className={`verdict ${view.check.passed ? 'ok' : 'bad'}`} data-highlight="verdict">
        <span className="verdict-mark" aria-hidden="true">{view.check.passed ? '✓' : '!'}</span>
        <div>
          <strong>{verdict}</strong>
          {view.ruling && <p>{renderQuotes(voices, view.ruling.message)}</p>}
          {view.changes.length > 0 && (
            <details><summary>What code changed after the council ({view.changes.length})</summary>
              <ul>{view.changes.map((c) => <li key={c}>{c}</li>)}</ul></details>
          )}
        </div>
      </section>

      <div className="stat-tiles">
        <div className="card stat"><span>Weeks</span><strong>{plan.weeks.length}</strong><small>to {plan.race_name}, {fmtDay(plan.race_date)}</small></div>
        <div className="card stat"><span>Peak week</span><strong>{u.num(peak, 0)}</strong><small>{u.unit} per week</small></div>
        <div className="card stat"><span>Goal time</span><strong>{view.goal_time ?? view.paces?.current_prediction ?? '—'}</strong>
          <small>{view.goal_time ? `data predicts ${view.paces?.current_prediction ?? '—'}` : 'from your current fitness'}</small></div>
        <div className="card stat"><span>Longest run</span><strong>{u.num(longest, 0)}</strong><small>{u.unit}</small></div>
      </div>

      <div className="plan-buttons">
        <button className="btn" onClick={changePrefs} disabled={council.state.running}>Change preferences</button>
        <button className="btn" onClick={() => setCheckin((v) => !v)}>{checkin ? 'Close check-in' : 'Weekly check-in'}</button>
        <a className="btn" href={`/api/plan.ics?session=${SESSION_ID}`} download="pacelab-plan.ics">Export to calendar (.ics)</a>
      </div>

      {checkin && <CheckinTab embedded view={view} voices={voices} onPlan={onPlan} onSpend={onSpend} goCouncil={changePrefs} goPlan={() => setCheckin(false)} />}

      <div className="plan-legend">
        <span>Click a workout to mark it done, then missed.</span>
        <span className="legend-types">
          {['easy', 'long', 'tempo', 'interval', 'race_pace', 'strength', 'race'].map((t) => <span key={t} className={`wo-chip t-${t}`}>{LABEL[t]}</span>)}
        </span>
      </div>

      <div className="plan-grid" role="table" aria-label="Training plan calendar" data-highlight="calendar">
        <div className="plan-row head" role="row">
          <div role="columnheader">Week</div>
          {DAYS.map((d) => <div key={d} role="columnheader">{d}</div>)}
        </div>
        {plan.weeks.map((wk, i) => {
          const monday = wk.workouts[0].day
          return (
            <div className={`plan-row phase-${wk.phase}`} role="row" key={wk.index} id={`plan-week-${wk.index}`}>
              <div className="week-cell" role="rowheader">
                <strong>W{wk.index}</strong> <span className={`phase-tag ${wk.phase}`}>{wk.phase}</span>
                <div className="muted">{fmtDay(monday)}</div>
                <div className="week-km"><span style={{ width: `${(kms[i] / peak) * 100}%` }} /></div>
                <div className="muted">{u.dist(kms[i])}</div>
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
                          aria-label={`${LABEL[w.type]} ${w.distance_km ? u.dist(w.distance_km) : ''} ${w.target_pace ?? ''}, ${w.status}`}>
                          <span className="wo-type">{w.status === 'done' ? '✓ ' : w.status === 'missed' ? '✕ ' : ''}{LABEL[w.type] ?? w.type}</span>
                          {w.distance_km > 0 && <span className="wo-km">{u.dist(w.distance_km)}</span>}
                          {w.target_pace && <span className="wo-pace">{u.pace(w.target_pace)}</span>}
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

      {view.wrist_card && (
        <details className="card fold">
          <summary><h2>⚡ Race-day wrist card</h2><span className="muted">Goal {view.wrist_card.goal_time}</span></summary>
          <p>{view.wrist_card.strategy}</p>
          <table className="data"><thead><tr><th>Segment</th><th className="num">Pace</th><th>Note</th></tr></thead>
            <tbody>{view.wrist_card.splits.map((s) => <tr key={s.segment}><td>{s.segment}</td><td className="num">{u.pace(s.pace)}</td><td>{s.note}</td></tr>)}</tbody></table>
          {view.wrist_card.fueling.length > 0 && <p><strong>Fuel:</strong> {view.wrist_card.fueling.join(' · ')}</p>}
          {view.wrist_card.cues.length > 0 && <p><strong>Cues:</strong> {view.wrist_card.cues.join(' · ')}</p>}
        </details>
      )}
      {view.strength && (
        <details className="card fold">
          <summary><h2>🏋️ Strength &amp; mobility</h2><span className="muted">{view.strength.days.join(' & ')}</span></summary>
          {view.strength.sessions.map((s) => (
            <div key={s.phase} className="gym-session"><strong>{s.phase}: {s.focus}</strong> <span className="muted">{s.minutes} min</span>
              <div className="muted">{s.exercises.join(' · ')}</div></div>
          ))}
          {view.strength.mobility_note && <p className="muted">{view.strength.mobility_note}</p>}
        </details>
      )}
      {view.paces && (
        <details className="card fold">
          <summary><h2>Your paces</h2><span className="muted">{view.paces.basis}</span></summary>
          <table className="data"><tbody>{view.paces.zones.map((z) => <tr key={z.name}><td>{z.name}</td><td className="num">{u.pace(z.label)}</td><td className="muted">{z.purpose}</td></tr>)}</tbody></table>
        </details>
      )}
    </div>
  )
}
