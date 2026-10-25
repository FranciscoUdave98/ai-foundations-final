import { ArrowDown, ArrowRight, CircleCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { fmtDay, isoDay } from '../../format'
import { LABEL, thisWeek, verdictLine } from '../../planSummary'
import type { AppState, PlanView } from '../../types'
import { useUnits } from '../../units'
import { PhaseBars } from '../PhaseBars'

const WO_COLOR: Record<string, string> = {
  easy: 'var(--wo-easy)', recovery: 'var(--wo-recovery)', long: 'var(--wo-long)', tempo: 'var(--wo-tempo)', threshold: 'var(--wo-tempo)',
  interval: 'var(--wo-interval)', race_pace: 'var(--wo-race-pace)', race: 'var(--brand)', strength: 'var(--wo-strength)', strides: 'var(--wo-easy)',
}

/** The runner's home: how long until race day, where they are on the road, and this week's runs. */
export function RaceHome({ state, view, running, round, goPlan, watch, action }: {
  state: AppState | null; view: PlanView | null; running: boolean; round: number; goPlan: () => void; watch: () => void; action: ReactNode
}) {
  const u = useUnits()
  const t = state?.target
  const a = state?.athlete
  const wk = view ? thisWeek(view) : null
  const today = isoDay(new Date())
  const total = view?.plan.weeks.length ?? t?.weeks_until ?? 0
  const at = wk && wk.week.workouts[0].day <= today ? wk.week.index : 0

  return (
    <>
      <section className="race-home">
        <div className="rh-left">
          {t ? (
            <>
              <div className="rh-count">{t.weeks_until}<small>weeks to go</small></div>
              <div className="rh-race">{t.name.split(' (')[0]}</div>
              <p className="rh-meta">{fmtDay(t.date)} · {t.city}, {t.state}{state?.predicted_for_target ? ` · You could run ${state.predicted_for_target} today` : ''}</p>
            </>
          ) : (
            <>
              <div className="rh-race">Hi {a?.label ?? 'runner'}.</div>
              <p className="rh-meta">{a ? `${Math.round(a.avg_week_km)} km a week lately. Pick a race in Settings below.` : ''}</p>
            </>
          )}
          {running ? (
            <button className="rh-live" onClick={watch}><span className="dot" aria-hidden="true" /> Your coaches are debating now · round {Math.max(1, round)} of 3 <ArrowDown size={16} aria-hidden="true" /></button>
          ) : view ? (
            <button className="rh-verdict" onClick={goPlan}><CircleCheck size={20} aria-hidden="true" /> {verdictLine(view)}</button>
          ) : null}
          <div className="rh-actions">
            {!running && action}
            {view && !running && <button className="btn btn-outline" onClick={goPlan}>Open My Plan <ArrowRight size={16} aria-hidden="true" /></button>}
          </div>
        </div>
        <div className="rh-season card">
          {view ? (
            <>
              <div className="section-title"><h2>Your season</h2><span>{at ? `Week ${at} of ${total}` : `${total} weeks · starts ${fmtDay(view.plan.weeks[0].workouts[0].day)}`}</span></div>
              <PhaseBars view={view} height={180} unit={u.unit} conv={(km) => Number(u.num(km, 1))} />
              {t && <div className="rh-flag">🏁 Race day · {fmtDay(t.date)}</div>}
            </>
          ) : (
            <div className="rh-empty"><span aria-hidden="true">🗓️</span><p>{running ? 'Your season appears when the coaches agree.' : 'Build your plan to see your season here.'}</p></div>
          )}
        </div>
      </section>

      {wk && (
        <>
          <div className="section-title"><h2>{wk.title.startsWith('This') ? 'This week' : 'Your first week'}</h2><span>{wk.sessions.filter((w) => w.type !== 'strength').length} runs · tap My Plan for every week</span></div>
          <div className="week-strip">
            {Array.from({ length: 7 }, (_, d) => {
              const day = wk.week.workouts[0].day
              const date = new Date(`${day}T12:00:00`); date.setDate(date.getDate() + d)
              const iso = isoDay(date)
              const items = wk.week.workouts.filter((w) => w.day === iso && w.type !== 'rest')
              const run = items.find((w) => w.type !== 'strength')
              const gym = items.find((w) => w.type === 'strength')
              return (
                <div key={d} className={`day${run ? '' : ' rest'}${iso === today ? ' today' : ''}`} style={{ '--wo': WO_COLOR[run?.type ?? 'rest'] ?? 'var(--surface-2)' } as React.CSSProperties}>
                  <span className="d">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d]} {date.getDate()}</span>
                  {run ? (
                    <>
                      <span className="t">{LABEL[run.type] ?? run.type}</span>
                      {run.distance_km > 0 && <span className="k">{u.num(run.distance_km, 0)}<small>{u.unit}</small></span>}
                      {run.target_pace && <span className="p">{u.pace(run.target_pace)}</span>}
                    </>
                  ) : <span className="t">{gym ? 'Gym' : 'Rest'}</span>}
                  {run && gym && <span className="p">+ gym</span>}
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
