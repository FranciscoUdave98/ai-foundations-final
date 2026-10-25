import { CoachSays } from '../CoachSays'
import type { AppState, PlanView } from '../../types'
import { RaceHome } from './RaceHome'

/** Step 5: the finished product. Countdown, the season at a glance, this week, and where to go next. */
export function StepPlan({ state, view, goPlan, goHood, openChat }: {
  state: AppState | null; view: PlanView | null; goPlan: () => void; goHood: () => void; openChat: () => void
}) {
  return (
    <div className="plan-step" id="plan-summary">
      {view && <CoachSays id="kickstarter">Your plan is ready: {view.plan.weeks.length} weeks to {view.race.name.split(' (')[0]}. Start easy, build steady, and I'll see you at the start line.</CoachSays>}
      <RaceHome state={state} view={view} running={false} round={0} goPlan={goPlan} watch={() => {}} action={(
      <div className="next-row">
        <button className="next-card card" onClick={goPlan}>
          <img className="next-art" src="/pacekit-png/icons/plan.png" alt="" />
          <strong>Every week, day by day</strong>
          <span>Full calendar + export</span>
        </button>
        <button className="next-card card" onClick={goPlan}>
          <img className="next-art" src="/pacekit-png/data/consistency.png" alt="" />
          <strong>Check in each week</strong>
          <span>Sick or busy? It adapts</span>
        </button>
        <button className="next-card card" onClick={openChat}>
          <img className="next-art" src="/pacekit-png/icons/chat.png" alt="" />
          <strong>Ask your coach</strong>
          <span>"Why is week 6 lighter?"</span>
        </button>
        <button className="next-card card" onClick={goHood}>
          <img className="next-art" src="/pacekit-png/features/low-cost.png" alt="" />
          <strong>See how it was made</strong>
          <span>Every AI call and its cost</span>
        </button>
      </div>
      )} />
    </div>
  )
}
