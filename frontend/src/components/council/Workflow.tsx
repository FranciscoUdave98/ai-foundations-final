import { Check, RotateCcw } from 'lucide-react'
import { AGENTS, AgentIcon } from '../../agents'
import type { Persona } from '../../types'
import type { CouncilState } from '../../useCouncil'

const STAGES: { agents: Persona[]; title: string; text: string }[] = [
  { agents: ['wallbreaker'], title: 'Draft', text: 'The Plan Builder writes every week from your numbers.' },
  { agents: ['marshal'], title: 'Rule check', text: 'The Safety Checker tests it against fixed rules in code.' },
  { agents: ['taper'], title: 'Injury review', text: 'The Injury Guard approves it, or says no and sends it back.' },
  { agents: ['kickstarter', 'guru'], title: 'Finishing touches', text: 'Race-day pacing and strength sessions are added.' },
  { agents: ['monk'], title: 'Sign-off', text: 'The Head Coach checks it all fits and hands you the plan.' },
]

const busy = (st: string) => st === 'thinking' || st === 'done' || st === 'approved' || st === 'veto' || st === 'veto_resolved'

/** Which stage the live run is in (1-5), 6 once the plan is out, 0 before any run. */
export function liveStage(s: CouncilState): number {
  if (!s.feed.length) return 0
  if (!s.running) return s.result || s.nodes.monk.status === 'done' ? 6 : 0
  if (s.nodes.monk.status === 'done') return 5
  const k = s.nodes.kickstarter.status, g = s.nodes.guru.status
  if (busy(k) || busy(g)) return k === 'done' && g === 'done' && ['monk', 'marshal'].includes(s.feed[s.feed.length - 1].persona) ? 5 : 4
  const last = [...s.feed].reverse().find((f) => f.persona !== 'monk' && f.persona !== 'whisperer')?.persona
  return last === 'taper' ? 3 : last === 'marshal' ? 2 : 1
}

/** One plain-English sentence about what's happening right now. */
export function nowLine(s: CouncilState, stage: number): string {
  const round = Math.max(1, s.round)
  const n = s.nodes
  if (stage === 1) return round > 1 ? 'The Plan Builder is redrafting…' : 'The Plan Builder is drafting your weeks…'
  if (stage === 2) return n.marshal.status === 'fail' ? 'The Safety Checker found problems. Fixing them…' : 'The Safety Checker is testing the rules…'
  if (stage === 3) {
    if (n.taper.status === 'veto') return 'The Injury Guard said NO: too much, too soon. Back to the draft!'
    if (n.taper.status === 'approved') return 'The Injury Guard approved it!'
    return 'The Injury Guard is checking for injury risk…'
  }
  if (stage === 4) return 'Adding race-day pacing and gym work…'
  if (stage === 5) return 'The Head Coach is signing off…'
  if (stage === 6) return 'Done! Your coaches agreed on a plan.'
  return 'Six AI coaches, one plan. Press Build and watch them work.'
}

/** The five stages in one line; the current one lights up, done ones tick. */
export function StageStrip({ stage, redrafts }: { stage: number; redrafts: number }) {
  return (
    <ol className="stage-strip" aria-label="Stages">
      {STAGES.map((st, i) => {
        const n = i + 1
        const state = stage === 0 ? 'idle' : n < stage ? 'done' : n === stage ? 'now' : 'todo'
        return (
          <li key={st.title} className={`ss ss-${state}`} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="ss-n">{state === 'done' ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : n}</span>
            <span className="ss-icons">{st.agents.map((a) => <AgentIcon key={a} id={a} size="sm" />)}</span>
            <span className="ss-t">{st.title}</span>
          </li>
        )
      })}
      {redrafts > 0 && <li className="ss-loop"><RotateCcw size={13} aria-hidden="true" /> {redrafts} redraft{redrafts === 1 ? '' : 's'}</li>}
    </ol>
  )
}

/** The coaches' process as five stages with a loop back from the injury review. Static on the welcome page, live in step 4. */
export function Workflow({ stage = 0, vetoes = 0, compact = false }: { stage?: number; vetoes?: number; compact?: boolean }) {
  return (
    <div className={`workflow${compact ? ' compact' : ''}`}>
      <ol className="wf-stages">
        {STAGES.map((st, i) => {
          const n = i + 1
          const state = stage === 0 ? 'idle' : n < stage ? 'done' : n === stage ? 'now' : 'todo'
          return (
            <li key={st.title} className={`wf-stage wf-${state}`} aria-current={state === 'now' ? 'step' : undefined}>
              <div className="wf-top">
                <span className="wf-n">{state === 'done' ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : n}</span>
                <span className="wf-icons">{st.agents.map((a) => <AgentIcon key={a} id={a} size="sm" />)}</span>
              </div>
              <strong>{st.title}</strong>
              <span className="wf-who">{st.agents.map((a) => AGENTS[a].title).join(' + ')}</span>
              {!compact && <p>{st.text}</p>}
            </li>
          )
        })}
      </ol>
      <p className="wf-loop">
        <RotateCcw size={14} aria-hidden="true" />
        {compact ? 'Injury Guard says no? Back to Draft (up to 3 rounds).' : 'If the Injury Guard says no, the plan goes back to the Draft stage, up to 3 rounds.'}
        {vetoes > 0 && <strong> This run: {vetoes} {vetoes === 1 ? 'redraft' : 'redrafts'}.</strong>}
      </p>
    </div>
  )
}
