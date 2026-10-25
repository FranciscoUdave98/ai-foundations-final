import { ArrowRight, Pencil } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Preferences } from '../../prefs'
import type { AppState, Persona, PlanView, Voices } from '../../types'
import type { useCouncil } from '../../useCouncil'
import { CouncilBoard } from './CouncilBoard'
import { liveStage, nowLine } from './Workflow'

type Council = ReturnType<typeof useCouncil>

/** Step 4: the coaching team is the whole page. Your choices in one line, then the team at work. */
export function StepCoaches({ state, prefs, council, voices, view, action, goStep, openAgent, onAgentOpened, fresh }: {
  state: AppState | null; prefs: Preferences | null; goal: string; council: Council; voices: Voices | null; view: PlanView | null
  action: ReactNode; chat: ReactNode; goStep: (n: number) => void; openAgent: Persona | null; onAgentOpened: () => void
  fresh: boolean   // the plan on screen came from these exact settings
}) {
  const a = state?.athlete
  const t = state?.target
  const s = council.state
  const ruled = !s.running && !!view && fresh
  const stage = s.running ? liveStage(s) : ruled ? 6 : 0
  const redrafts = view && ruled ? view.physio.filter((r) => r.decision === 'veto').length : Math.max(0, s.round - 1)
  const lastVeto = !!view && view.physio.length > 0 && view.physio[view.physio.length - 1].decision === 'veto'
  const status = !ruled ? nowLine(s, stage)
    : lastVeto ? `Done! The Injury Guard still had concerns after ${view.physio.length} rounds, so the Head Coach used the safest version${view.check.passed ? ': it passes every hard safety rule' : ''}.`
    : `Done! They agreed on a ${view.plan.weeks.length}-week plan${view.check.passed ? ' that passes every safety rule' : ''}.`

  return (
    <div className="coaches-step">
      <p className="brief-line" aria-label="What the coaches will work from">
        <button onClick={() => goStep(1)}><img src="/pacekit-png/runners/boston-chaser.png" alt="" /> {a ? `${Math.round(a.avg_week_km)} km a week` : 'Runner'} <Pencil size={12} aria-hidden="true" /></button>
        <button onClick={() => goStep(2)}><img src="/pacekit-png/project/race-goal.png" alt="" /> {t ? `${t.name.split(' (')[0]} · ${t.weeks_until} wks` : 'Race'} <Pencil size={12} aria-hidden="true" /></button>
        <button onClick={() => goStep(3)}><img src="/pacekit-png/icons/plan.png" alt="" /> {prefs ? `${prefs.runs_per_week} runs a week · long run ${prefs.long_run_day}` : 'Week'} <Pencil size={12} aria-hidden="true" /></button>
      </p>
      <CouncilBoard council={council} voices={voices} state={state} openAgent={openAgent} onOpened={onAgentOpened}
        status={redrafts > 0 && ruled && !lastVeto ? `${status.replace(/\.$/, '')}, after ${redrafts} redraft${redrafts === 1 ? '' : 's'}.` : status}
        action={ruled
          ? <button className="btn btn-primary btn-next see-plan" onClick={() => goStep(5)}>See your plan <ArrowRight size={18} aria-hidden="true" /></button>
          : s.running ? null : action} />
    </div>
  )
}
