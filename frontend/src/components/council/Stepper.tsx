import { ArrowLeft, ArrowRight, Check, ChevronRight, Lightbulb } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { AgentIcon } from '../../agents'
import { STEPS } from './setup'

/** The five steps across the top: done ones tick and can be revisited, later ones wait their turn. */
export function Stepper({ step, reachable, goStep }: { step: number; reachable: number; goStep: (n: number) => void }) {
  return (
    <nav className="steps-nav" aria-label="Build your plan in 5 steps">
      <div className="sn-progress" aria-hidden="true"><span style={{ width: `${((step - 1) / 4) * 100}%` }} /></div>
      <ol>
        {STEPS.map((s) => {
          const state = s.n === step ? 'now' : s.n < reachable ? 'done' : s.n === reachable ? 'open' : 'todo'
          return (
            <Fragment key={s.n}>
            {s.n > 1 && <li className={`sn-arrow${s.n <= reachable && s.n - 1 < step ? ' passed' : ''}`} aria-hidden="true"><ChevronRight size={20} strokeWidth={2.5} /></li>}
            <li className={`sn sn-${state}`}>
              <button type="button" onClick={() => goStep(s.n)} disabled={s.n > reachable} aria-current={s.n === step ? 'step' : undefined}
                title={s.n > reachable ? 'Finish the steps before this one first' : undefined}>
                <span className="sn-n">{state === 'done' ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : s.n}</span>
                <span className="sn-label"><small>Step {s.n}</small>{s.short}</span>
              </button>
            </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}

/** What the Head Coach tells you to do next in the guided demo. One easy click per line. */
export function guideText(step: number, cue: string | null, scouting: boolean, running: boolean): ReactNode {
  if (step === 1) return cue === 'sample' ? <>Click <strong>The Boston chaser</strong> to load a runner.</> : <>Runner loaded. On to the race!</>
  if (step === 2) return scouting || cue === null ? <>The Race Scout is hunting for races…</>
    : cue === 'race' ? <>Click <strong>Choose this race</strong> on the Scout's pick.</> : <>Race picked. Next!</>
  if (step === 3) return <>These are your preferences. Change a day, or just hit Next.</>
  if (step === 4) return running ? <>Watch the coaches work…</> : cue === 'seeplan' ? <>The coaches agreed!</> : <>Now let the coaches build the plan.</>
  return <>That's a real plan, built in a minute. Try it with your own runs next.</>
}

export function GuideBar({ step, text, onExit, action }: {
  step: number; text: ReactNode; onExit: () => void; action: { label: string; onClick: () => void } | null
}) {
  return (
    <div className="guide-bar" role="status" aria-live="polite">
      <AgentIcon id="monk" />
      <div className="guide-text">
        <span className="guide-kicker">Guided demo · step {step} of 5</span>
        <p>{text}</p>
      </div>
      {action && <button className="btn btn-primary guide-go" onClick={action.onClick}>{action.label} <ArrowRight size={18} aria-hidden="true" /></button>}
      <button className="btn-text guide-exit" onClick={onExit}>{step === 5 ? 'Finish demo' : 'Exit demo'}</button>
    </div>
  )
}

/** Start over: forget this browser's PaceLab session (runner, race, week, plan, chat) and go back to the welcome page. */
export function startOver() {
  if (!window.confirm('Start over? This clears the runner, race, week and plan in this browser.')) return
  Object.keys(localStorage).filter((k) => k.startsWith('pacelab.')).forEach((k) => localStorage.removeItem(k))
  sessionStorage.clear()
  window.location.hash = '#council'
  window.location.reload()
}

/** One step's page: what it is for, its content, and Back / Next at the bottom. */
export function StepFrame({ n, intro, tip, children, back, next, id, compact }: {
  n: number; intro?: ReactNode; children: ReactNode; id?: string; tip?: ReactNode; compact?: boolean
  back?: () => void
  next?: { label: string; onClick: () => void; disabled?: boolean; why?: string } | null
}) {
  const s = STEPS[n - 1]
  return (
    <section className={`wz${compact ? ' compact' : ''}`} id={id} aria-labelledby={`step-${n}-title`}>
      <header className="step-head">
        <span className="step-kicker">Step {n} of 5</span>
        <h1 id={`step-${n}-title`}>{s.title}</h1>
        {intro && <div className="step-intro">{intro}</div>}
        {tip && <p className="step-tip"><Lightbulb size={16} aria-hidden="true" /><span>{tip}</span></p>}
      </header>
      <div className="step-body">{children}</div>
      {(back || next) && (
        <footer className="step-nav">
          {back ? <button className="btn btn-outline" onClick={back}><ArrowLeft size={16} aria-hidden="true" /> Back</button> : <span />}
          {next && (
            <span className="step-next">
              {next.disabled && next.why && <span className="step-why">{next.why}</span>}
              <button className="btn btn-primary btn-next" onClick={next.onClick} disabled={next.disabled}>
                {next.label} <ArrowRight size={18} aria-hidden="true" />
              </button>
            </span>
          )}
        </footer>
      )}
    </section>
  )
}

