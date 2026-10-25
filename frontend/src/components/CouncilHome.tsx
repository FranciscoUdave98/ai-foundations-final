import { Play, RefreshCw } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { api, SESSION_ID } from '../api'
import { lastSetup, rememberSetup, setupSig } from '../prefs'
import type { AppState, Dashboard, Persona, PlanView, RaceCard, RaceDistance, Voices } from '../types'
import { toast } from '../ui'
import type { useCouncil } from '../useCouncil'
import { usePrefs } from './council/PrefsCard'
import { WeekBuilder } from './council/WeekBuilder'
import { raceQuery, STEPS } from './council/setup'
import { StepCoaches } from './council/StepCoaches'
import { GuideBar, guideText, StepFrame, Stepper } from './council/Stepper'
import { StepPlan } from './council/StepPlan'
import { StepRace } from './council/StepRace'
import { StepRuns } from './council/StepRuns'
import { Welcome } from './council/Welcome'
import { RouteLoader } from './RouteLoader'

type Council = ReturnType<typeof useCouncil>
const WEEK_KEY = `pacelab.week-ok.${SESSION_ID}`
const GUIDE_KEY = 'pacelab.guide'
type Cue = 'sample' | 'next' | 'race' | 'build' | 'seeplan' | null
// What pulses for each cue: the one thing to click next.
const CUE_SEL: Record<Exclude<Cue, null>, string> = {
  sample: '.sample-list > .sample:first-child', next: '.step-nav .btn-next', race: '.race-opt.top .ro-choose', build: '.btn-go', seeplan: '.see-plan',
}

/** Home: the welcome page (step 0), then five guided steps from your runs to your finished plan. */
export function CouncilHome(p: {
  step: number; goStep: (n: number, replace?: boolean) => void
  state: AppState | null; loaded: boolean; planView: PlanView | null; voices: Voices | null; council: Council
  refreshState: () => Promise<void> | void; onData: (d: Dashboard) => void; onPlan: (pv: PlanView) => void; onSpend: () => void
  goPlan: () => void; goData: () => void; goHood: () => void; openChat: () => void
  rerunPending: boolean; onRerunStarted: () => void; openAgent: Persona | null; onAgentOpened: () => void; chat: ReactNode
}) {
  const { state, planView, council, step, goStep } = p
  const prefs = usePrefs(state)
  const [guide, setGuideState] = useState(() => sessionStorage.getItem(GUIDE_KEY) === '1')
  const setGuide = (on: boolean) => { setGuideState(on); if (on) sessionStorage.setItem(GUIDE_KEY, '1'); else sessionStorage.removeItem(GUIDE_KEY) }
  const [scouting, setScouting] = useState(false)
  const [, bump] = useState(0)
  const running = council.state.running
  const a = state?.athlete
  const target = state?.target ?? null
  // Step 3 counts as done once this runner's week was confirmed (kept per browser session and runner).
  const weekId = a ? `${a.id}-${a.runs}` : null
  const weekOk = !!weekId && localStorage.getItem(WEEK_KEY) === weekId
  const markWeek = (id: string | null) => { if (id) { localStorage.setItem(WEEK_KEY, id); bump((x) => x + 1) } }

  // How far the runner can go: each step needs the one before it.
  const done = [true, !!a, !!target, !!target && (weekOk || !!planView), !!planView]
  const reachable = done.findIndex((d, i) => i > 0 && !d) === -1 ? 5 : done.findIndex((d, i) => i > 0 && !d)
  useEffect(() => { if (p.loaded && step > reachable) goStep(reachable, true) }, [p.loaded, step, reachable, goStep])

  const sig = setupSig(target, prefs.prefs, prefs.goal)
  const saved = lastSetup(SESSION_ID)
  const changed = !!planView && !!saved && !!sig && saved !== sig

  async function convene(body?: Parameters<Council['start']>[0], race: { id: string; target_km?: number | null } | null = target) {
    const b = body ?? { goal_time: prefs.goal.trim() || null, mode: 'lean' as const, distance_km: target?.target_km ?? null, preferences: prefs.prefs }
    if (!b.preferences) return
    rememberSetup(setupSig(race, b.preferences, b.goal_time ?? ''), SESSION_ID)
    await council.start(b)
  }

  // My Plan's "Re-run with new settings" lands on step 4 and starts the run.
  useEffect(() => {
    if (!p.rerunPending || !prefs.prefs || !target || running) return
    p.onRerunStarted()
    convene()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.rerunPending, prefs.prefs, target, running])

  const scout = useCallback(async (d: RaceDistance, radius: number, zip: string) => {
    setScouting(true)
    try {
      const q = raceQuery(d, radius, zip)
      await api.searchRaces(q)
      await api.scoutRaces(q)
      p.onSpend()
      await p.refreshState()
    } catch {
      toast('The race search failed. Try again in a moment.', 'error')
    } finally { setScouting(false) }
  }, [p])

  const pick = useCallback(async (c: RaceCard, km: number) => {
    await api.selectRace(c.id, c.miles_away, km)
    await p.refreshState()
    toast(`Race set: ${c.name.split(' (')[0]}`)
  }, [p])

  const confirmWeek = () => {
    markWeek(weekId)
    goStep(4)
  }

  // The demo is a guided tour: the Head Coach says what to click, and that one thing pulses.
  const startDemo = () => { setGuide(true); goStep(1) }
  const exitDemo = () => setGuide(false)
  const scoutRes = state?.last_scout?.result ?? null
  const ruled = !running && !!planView && !changed
  const cue: Cue = !guide || step === 0 ? null
    : step === 1 ? (a ? 'next' : 'sample')
    : step === 2 ? (scouting || !scoutRes ? null : target ? 'next' : 'race')
    : step === 3 ? 'next'
    : step === 4 ? (running ? null : ruled ? 'seeplan' : 'build')
    : null
  const guideAction = cue === 'next'
    ? { label: step === 1 ? 'Next: pick a race' : step === 2 ? 'Next: your preferences' : 'Next: meet the coaches', onClick: () => (step === 3 ? confirmWeek() : goStep(step + 1)) }
    : cue === 'build' && prefs.prefs && target ? { label: 'Build my plan', onClick: () => { convene() } }
    : cue === 'seeplan' ? { label: 'See your plan', onClick: () => goStep(5) }
    : guide && step === 5 ? { label: 'Make my own plan', onClick: () => { exitDemo(); goStep(1) } }
    : null
  useEffect(() => {
    if (!cue || cue === 'next') return
    const t = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(CUE_SEL[cue])
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.top < 80 || r.bottom > window.innerHeight - 20) el.scrollIntoView({ block: 'center' })
    }, 450)
    return () => clearTimeout(t)
  }, [cue, step])

  if (!p.loaded) return <div className="page-wait"><RouteLoader /></div>

  if (step === 0) {
    return (
      <Welcome onStart={() => { exitDemo(); goStep(planView ? 5 : reachable) }} onDemo={startDemo} busy={running} goStep={goStep}
        resume={a ? { step: reachable, title: STEPS[reachable - 1].title } : null}
        ready={planView ? { race: planView.race.name.split(' (')[0] } : null} />
    )
  }

  const why = !a ? 'Load your runs first' : !target ? 'Pick a race first' : running ? 'The coaches are already working' : !prefs.prefs ? 'Loading your preferences' : undefined
  const label = !planView ? 'Build my plan' : changed ? 'Rebuild with my new settings' : 'Rebuild my plan'
  const sub = !planView ? 'About a minute · under 1¢ of AI' : changed ? 'Your setup changed since this plan' : 'Same settings, a fresh debate'
  const mainButton = (
    <span className="action-wrap" title={why}>
      <button className={`btn btn-main btn-go${changed ? ' btn-amber' : planView ? ' btn-outline' : ' btn-primary'}`} onClick={() => convene()} disabled={!!why}>
        {planView ? <RefreshCw size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        <span><strong>{label}</strong><small>{sub}</small></span>
      </button>
    </span>
  )
  const back = () => goStep(step - 1)
  const fresh = !!planView && !changed

  return (
    <div className={`flow${guide ? ' guided' : ''}`} data-cue={cue ?? undefined}>
      <Stepper step={step} reachable={reachable} goStep={goStep} />
      {guide && <GuideBar step={step} onExit={exitDemo} text={guideText(step, cue, scouting, running)} action={guideAction} />}

      {step === 1 && (
        <StepFrame n={1} back={back} compact
          intro={<p>Try it with a sample runner, or bring your own runs.</p>}
          next={{ label: 'Next: choose your race', onClick: () => goStep(2), disabled: !a, why: 'Pick a runner or upload your runs to continue' }}>
          <StepRuns state={state} onData={p.onData} busy={running} goData={p.goData} />
        </StepFrame>
      )}

      {step === 2 && (
        <StepFrame n={2} back={back} compact
          next={{ label: 'Next: your preferences', onClick: () => goStep(3), disabled: !target || scouting, why: 'Choose a race to continue' }}>
          <StepRace state={state} voices={p.voices} scouting={scouting} scout={scout} pick={pick} demo={false} />
        </StepFrame>
      )}

      {step === 3 && (
        <StepFrame n={3} back={back} compact
          next={{ label: 'Next: meet the coaches', onClick: confirmWeek, disabled: !prefs.prefs, why: 'Loading your defaults' }}>
          <div className="week-step">
            <WeekBuilder state={state} p={prefs} disabled={running} />
          </div>
        </StepFrame>
      )}

      {step === 4 && (
        <StepFrame n={4} id="step-coaches" compact next={null}>
          <StepCoaches state={state} prefs={prefs.prefs} goal={prefs.goal} council={council} voices={p.voices} view={planView}
            action={mainButton} chat={p.chat} goStep={goStep} openAgent={p.openAgent} onAgentOpened={p.onAgentOpened} fresh={fresh} />
        </StepFrame>
      )}

      {step === 5 && (
        <StepFrame n={5} back={back} compact
          next={{ label: 'Open the full plan', onClick: p.goPlan }}>
          <StepPlan state={state} view={planView} goPlan={p.goPlan} goHood={p.goHood} openChat={p.openChat} />
        </StepFrame>
      )}
    </div>
  )
}
