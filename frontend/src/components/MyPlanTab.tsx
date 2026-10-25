import { Info as InfoIcon } from 'lucide-react'
import { AGENTS, AgentIcon } from '../agents'
import { CoachSays } from './CoachSays'
import { useState } from 'react'
import { api, SESSION_ID } from '../api'
import { addDays, fmtDay } from '../format'
import { lastSetup, loadSaved, setupSig } from '../prefs'
import { LABEL, planChips, runKm, verdictLine } from '../planSummary'
import type { AppState, PlanView, Voices, Workout } from '../types'
import { toast, useTitle } from '../ui'
import type { useCouncil } from '../useCouncil'
import { useUnits } from '../units'
import { renderQuotes } from '../voices'
import { CheckinTab } from './CheckinTab'
import { PhaseBars } from './PhaseBars'

type Council = ReturnType<typeof useCouncil>
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const NEXT: Record<Workout['status'], Workout['status']> = { planned: 'done', done: 'missed', missed: 'planned' }


export function MyPlanTab({ view, state, council, voices, onPlan, onSpend, goCouncil, rerun }: {
  view: PlanView | null; state: AppState | null; council: Council; voices: Voices | null
  onPlan: (p: PlanView) => void; onSpend: () => void; goCouncil: () => void; rerun: () => void
}) {
  useTitle('My Plan')
  const u = useUnits()
  const [checkin, setCheckin] = useState(false)
  const [allWeeks, setAllWeeks] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  if (!view) {
    return (
      <div className="plan-empty" id="plan-top">
        <img className="plan-empty-art" src="/pacekit-png/icons/plan.png" alt="" />
        <div className="coach-host">
          <AgentIcon id="monk" size="lg" />
          <div className="scout-bubble">
            <span className="scout-name" style={{ color: 'var(--agent-monk)' }}>Head Coach <small>{AGENTS.monk.nick}</small></span>
            <p>No plan yet! Bring me your runs and a race, and the team will build your calendar in about a minute.</p>
          </div>
        </div>
        <button className="btn btn-primary btn-next" onClick={goCouncil}>Build my plan</button>
      </div>
    )
  }
  const plan = view.plan
  const kms = plan.weeks.map((w) => runKm(w.workouts))
  const peak = Math.max(...kms)
  const longest = Math.max(...plan.weeks.flatMap((w) => w.workouts.filter((x) => x.type === 'long').map((x) => x.distance_km)), 0)
  const saved = loadSaved()
  const sig = setupSig(state?.target ?? null, saved?.prefs ?? null, saved?.goal_time ?? '')
  const last = lastSetup(SESSION_ID)
  const changed = !!last && !!sig && last !== sig

  async function toggle(w: Workout) {
    if (w.type === 'rest') return
    const status = NEXT[w.status]
    await api.setWorkout(w.day, w.type, status)
    const copy: PlanView = structuredClone(view!)
    for (const wk of copy.plan.weeks) for (const x of wk.workouts) if (x.day === w.day && x.type === w.type) x.status = status
    onPlan(copy)
  }

  return (
    <div className="my-plan" id="plan-top">
      <div className="page-head">
        <div>
          <h1>My Plan</h1>
          <p>{plan.race_name.split(' (')[0]}, {fmtDay(plan.race_date)} · {plan.weeks.length} weeks</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-outline" onClick={() => setCheckin((v) => !v)}><img className="btn-art" src="/pacekit-png/project/weekly-checkin.png" alt="" /> {checkin ? 'Close check-in' : 'Weekly check-in'}</button>
          <a className="btn btn-outline" href={`/api/plan.ics?session=${SESSION_ID}`} download="pacelab-plan.ics" onClick={() => toast('Plan exported')}>
            <img className="btn-art" src="/pacekit-png/project/calendar-export.png" alt="" /> Export to calendar
          </a>
        </div>
      </div>

      {changed && (
        <div className="banner-amber" role="status">
          <span>Setup changed since this plan</span>
          <button className="btn btn-amber btn-sm" onClick={rerun} disabled={council.state.running}><img className="btn-art" src="/pacekit-png/new-icons/regenerate-plan.png" alt="" /> Re-run with new settings</button>
        </div>
      )}

      <section className={`verdict ${view.check.passed ? 'ok' : 'bad'}`} data-highlight="verdict">
        <strong>{verdictLine(view)}</strong>
        {view.ruling && <CoachSays id="monk">{renderQuotes(voices, view.ruling.voice_line)}</CoachSays>}
        <div className="chips plan-chips">{planChips(view, u.dist, state?.athlete?.avg_week_km).map((c) => <span key={c} className="chip">{c}</span>)}</div>
      </section>

      <div className="stat-tiles">
        <div className="card stat"><img className="stat-art" src="/pacekit-png/icons/plan.png" alt="" /><span>Weeks</span><strong>{plan.weeks.length}</strong><small>to race day</small></div>
        <div className="card stat"><img className="stat-art" src="/pacekit-png/data/weekly-distance.png" alt="" /><span>Peak week</span><strong>{u.num(peak, 0)}<small>{u.unit}</small></strong><small>per week</small></div>
        <div className="card stat"><img className="stat-art" src="/pacekit-png/project/race-goal.png" alt="" /><span>Goal time</span><strong className="time">{view.goal_time ?? view.paces?.current_prediction ?? '—'}</strong>
          <small>{view.goal_time ? `data says ${view.paces?.current_prediction ?? '—'}` : 'from your fitness'}</small></div>
        <div className="card stat"><img className="stat-art" src="/pacekit-png/week/long-run.png" alt="" /><span>Longest run</span><strong>{u.num(longest, 0)}<small>{u.unit}</small></strong><small>one run</small></div>
      </div>

      <section className="card">
        <div className="card-head"><h2><img className="dash-ic" src="/pacekit-png/data/training-load.png" alt="" />Weekly volume</h2></div>
        <PhaseBars view={view} height={140} unit={u.unit} conv={(km) => Number(u.num(km, 1))} />
      </section>

      {checkin && <CheckinTab embedded view={view} voices={voices} onPlan={onPlan} onSpend={onSpend} goCouncil={goCouncil} goPlan={() => setCheckin(false)} />}

      <section className="card">
        <div className="card-head">
          <h2><img className="dash-ic" src="/pacekit-png/data/consistency.png" alt="" />Calendar <span className="info" tabIndex={0} role="note" aria-label="Click a workout to mark it done; click again for missed.">
            <InfoIcon size={13} aria-hidden="true" /><span className="info-tip" role="tooltip">Click a workout to mark it done; click again for missed.</span></span></h2>
        </div>
        <div className="plan-grid" role="table" aria-label="Training plan calendar" data-highlight="calendar">
          <div className="plan-row head" role="row">
            <div role="columnheader">Week</div>
            {DAYS.map((d) => <div key={d} role="columnheader">{d}</div>)}
          </div>
          {plan.weeks.slice(0, allWeeks ? plan.weeks.length : 3).map((wk, i) => {
            const monday = wk.workouts[0].day
            return (
              <div className={`plan-row phase-${wk.phase}`} role="row" key={wk.index} id={`plan-week-${wk.index}`}>
                <div className="week-cell" role="rowheader">
                  <strong>W{wk.index}</strong> <span className={`phase-tag ${wk.phase}`}>{wk.phase}</span>
                  <div className="caption">{fmtDay(monday)} · {u.dist(kms[i], 0)}</div>
                  <div className="week-km"><span style={{ width: `${(kms[i] / peak) * 100}%` }} /></div>
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
                            <span className="wo-type">{w.status === 'done' ? '✓ ' : w.status === 'missed' ? '✕ ' : ''}{w.type === 'easy' && /medium/i.test(w.purpose) ? 'Medium' : w.type === 'easy' && /strides/i.test(w.purpose) ? 'Easy + strides' : LABEL[w.type] ?? w.type}</span>
                            {w.distance_km > 0 && <span className="wo-km">{u.dist(w.distance_km)}</span>}
                            {w.target_pace && <span className="wo-pace">{u.pace(w.target_pace)}</span>}
                            {open === key && w.purpose && <span className="wo-tip" role="tooltip">{w.purpose}</span>}
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
        {plan.weeks.length > 3 && (
          <button className="btn btn-outline weeks-toggle" onClick={() => setAllWeeks((v) => !v)}>
            {allWeeks ? 'Show the first 3 weeks only' : `Show all ${plan.weeks.length} weeks`}
          </button>
        )}
      </section>

      <div className="row-2">
        {view.wrist_card && (
          <section className="card">
            <CoachSays id="kickstarter">Race day, goal {view.wrist_card.goal_time}: start easy, find your rhythm, kick at the end.</CoachSays>
            <table className="data"><thead><tr><th>Segment</th><th className="num">Pace</th><th>Cue</th></tr></thead>
              <tbody>{view.wrist_card.splits.map((s) => <tr key={s.segment}><td>{s.segment}</td><td className="num">{u.pace(s.pace)}</td><td>{s.note}</td></tr>)}</tbody></table>
            {view.wrist_card.fueling.length > 0 && <p className="fuel-tip"><img src="/pacekit-png/project/fueling.png" alt="" />{view.wrist_card.fueling[0]}</p>}
          </section>
        )}
        {view.strength && (
          <section className="card">
            <CoachSays id="guru">Gym on {view.strength.days.join(' + ')}. Short sessions that get lighter as race day nears.</CoachSays>
            <ul className="gym-list">
              {view.strength.sessions.map((s) => (
                <li key={s.phase}><strong>{s.phase[0].toUpperCase() + s.phase.slice(1)}</strong><span>{s.minutes} min · {s.exercises.slice(0, 2).map((x) => x.split(' ')[0] + ' ' + (x.split(' ')[1] ?? '')).join(', ')}{s.exercises.length > 2 ? ` +${s.exercises.length - 2}` : ''}</span></li>
              ))}
            </ul>
          </section>
        )}
      </div>

    </div>
  )
}
