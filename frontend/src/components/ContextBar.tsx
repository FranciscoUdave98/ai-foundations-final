import { fmtDay } from '../format'
import type { AppState } from '../types'
import { useUnits } from '../units'

/** One line under the top bar: who, how much they run, what they train for, what the data predicts. */
export function ContextBar({ state, onAthlete, onTarget, onPlan }: {
  state: AppState | null; onAthlete: () => void; onTarget: () => void; onPlan: () => void
}) {
  const u = useUnits()
  if (!state?.athlete) {
    return <div className="contextbar"><span className="muted">No data yet: run the demo or load a sample athlete to start.</span></div>
  }
  const a = state.athlete
  const t = state.target
  return (
    <div className="contextbar">
      <button className="ctx" onClick={onAthlete} title="Open My Data">{a.label}</button>
      <span className="dot" aria-hidden="true">·</span>
      <button className="ctx" onClick={onAthlete} title="Average week, last 4 weeks">{u.dist(a.avg_week_km)}/week</button>
      <span className="dot" aria-hidden="true">·</span>
      {t ? (
        <button className="ctx" onClick={onTarget} title="Change the race (step 2)">
          Target: {t.name}, {fmtDay(t.date)} ({t.weeks_until} weeks)
        </button>
      ) : <button className="ctx muted" onClick={onTarget}>Target: pick a race</button>}
      {state.predicted_for_target && (
        <>
          <span className="dot" aria-hidden="true">·</span>
          <button className="ctx" onClick={onPlan} title="What your data predicts for this distance today">Predicted {state.predicted_for_target}</button>
        </>
      )}
    </div>
  )
}
