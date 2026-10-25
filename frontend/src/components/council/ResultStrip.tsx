import { ArrowRight, CalendarRange, CircleCheck, CircleAlert } from 'lucide-react'
import type { PlanView } from '../../types'
import { LABEL, planChips, thisWeek, verdictLine } from '../../planSummary'
import { useUnits } from '../../units'
import { PhaseBars } from '../PhaseBars'

/** One card: what the council decided, the season at a glance, and this week. */
export function ResultStrip({ view, avgWeek, goPlan, running }: {
  view: PlanView | null; avgWeek: number | null; goPlan: () => void; running: boolean
}) {
  const u = useUnits()
  if (!view) {
    return (
      <section className="card result-strip empty" aria-label="Your plan">
        <CalendarRange size={22} aria-hidden="true" />
        <span>{running ? 'The council is building your plan' : 'Your plan appears here after the council rules.'}</span>
      </section>
    )
  }
  const wk = thisWeek(view)
  return (
    <section className="card result-strip" aria-label="Your plan">
      <div className="rs-verdict">
        {view.check.passed ? <CircleCheck size={20} className="ok-icon" aria-hidden="true" /> : <CircleAlert size={20} className="warn-icon" aria-hidden="true" />}
        <strong>{verdictLine(view)}</strong>
      </div>
      <div className="rs-body">
        <div className="rs-col">
          <span className="caption">{view.plan.weeks.length} weeks to {view.race.name.split(' (')[0]}</span>
          <PhaseBars view={view} height={56} unit={u.unit} conv={(km) => Number(u.num(km, 1))} />
        </div>
        <div className="rs-col">
          <span className="caption">{wk.title}</span>
          <div className="chips">
            {wk.sessions.map((w) => (
              <span key={`${w.day}-${w.type}`} className={`wo-chip t-${w.type}`}>
                {wk.dayName(w)} · {LABEL[w.type] ?? w.type}{w.distance_km > 0 ? ` ${u.dist(w.distance_km, 0)}` : ''}
              </span>
            ))}
          </div>
          <div className="chips plan-chips">{planChips(view, u.dist, avgWeek).map((c) => <span key={c} className="chip">{c}</span>)}</div>
        </div>
        <button className="btn btn-primary rs-open" onClick={goPlan}>Open My Plan <ArrowRight size={16} aria-hidden="true" /></button>
      </div>
    </section>
  )
}
