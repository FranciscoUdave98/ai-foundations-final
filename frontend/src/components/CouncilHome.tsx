import { type ReactNode, useEffect, useState } from 'react'
import type { Step } from '../App'
import { api } from '../api'
import { fmtDay } from '../format'
import type { AppState, Dashboard, Persona, PlanView, RaceDistance, RaceQuery, Voices } from '../types'
import type { useCouncil } from '../useCouncil'
import { useUnits } from '../units'
import { loadPrefs, prefsSummary, savePrefs } from '../prefs'
import { DebateStep } from './steps/DebateStep'
import { PlanStep } from './steps/PlanStep'
import { PrefsStep } from './steps/PrefsStep'
import { RaceStep } from './steps/RaceStep'
import { RunsStep } from './steps/RunsStep'

type Council = ReturnType<typeof useCouncil>

interface Props {
  state: AppState | null
  planView: PlanView | null
  voices: Voices | null
  council: Council
  scrollReq: { step: Step; key: number } | null
  setStep: (s: Step) => void
  refreshState: () => Promise<void> | void
  onData: (d: Dashboard) => void
  onPlan: (p: PlanView) => void
  onSpend: () => void
  goData: () => void
  openAgent?: Persona | null
  onAgentOpened?: () => void
}

const LABEL: Record<Step, string> = { 1: 'Your runs', 2: 'Race', 3: 'Preferences', 4: 'Debate', 5: 'Your plan' }
const DIST: Record<string, RaceDistance> = { '5K': '5K', '10K': '10K', 'Half Marathon': 'Half Marathon', Marathon: 'Marathon' }

export function defaultQuery(state: AppState | null): RaceQuery {
  return { zip: '06511', radius_mi: 100, distance: DIST[state?.athlete?.goal_distance ?? ''] ?? 'Half Marathon', weeks: 52, safety_demo: false }
}

/** Scroll to a section once it exists (the page may still be rendering). */
function scrollToStep(step: Step, tries = 20) {
  const el = document.getElementById(`step-${step}`)
  if (el) el.scrollIntoView({ block: 'start' })
  else if (tries > 0) setTimeout(() => scrollToStep(step, tries - 1), 100)
}

/** The Council tab: one page, five sections top to bottom. Sections unlock as the one above is done. */
export function CouncilHome(p: Props) {
  const { state, planView, council, scrollReq, setStep } = p
  const u = useUnits()
  const [demo, setDemo] = useState<string | null>(null)
  const [demoError, setDemoError] = useState<string | null>(null)
  const running = council.state.running
  // Sections stay mounted on one page, so reset them when the athlete or race changes.
  const who = `${state?.athlete?.id ?? 'none'}-${state?.athlete?.runs ?? 0}`

  useEffect(() => { if (scrollReq) scrollToStep(scrollReq.step) }, [scrollReq])

  const summary: Record<Step, string | null> = {
    1: state?.athlete ? `${state.athlete.label} · ${state.athlete.runs} runs · ${u.dist(state.athlete.avg_week_km)}/week` : null,
    2: state?.target ? `${state.target.name}, ${fmtDay(state.target.date)}` : null,
    3: state?.target ? prefsSummary(loadPrefs(), u.unit, true) : null,
    4: council.state.feed.length ? `Round ${Math.max(1, council.state.round)} · $${council.state.total.toFixed(4)}` : null,
    5: planView ? `${planView.plan.weeks.length} weeks · ${planView.check.passed ? 'every safety rule passes' : 'check the warnings'}` : null,
  }
  const debateOn = running || council.state.feed.length > 0 || !!planView
  const status = (n: Step): 'done' | 'live' | 'next' | 'locked' => {
    if (n === 4 && running) return 'live'
    const open = n === 1 || (n === 2 && !!state?.athlete) || (n === 3 && !!state?.target) || (n === 4 && debateOn) || (n === 5 && !!planView)
    if (!open) return 'locked'
    return (n === 3 ? !!planView : n === 4 ? !!planView : !!summary[n]) ? 'done' : 'next'
  }

  /** "Run the full demo": sample athlete → Race Scout's top pick → default preferences → council → plan. */
  async function runDemo() {
    setDemoError(null)
    try {
      let st = state
      if (!st?.athlete) {
        setDemo('Loading Athlete A…')
        p.onData(await api.useSample('athlete_a'))
        st = await api.state()
      }
      setStep(2)
      setDemo('The Course Whisperer is scouting races…')
      const q = defaultQuery(st)
      await api.searchRaces(q)
      const scout = await api.scoutRaces(q)
      p.onSpend()
      const pick = scout.cards.find((c) => c.id === scout.top_pick) ?? scout.cards[0]
      if (!pick) throw new Error('No races found for the demo search')
      await api.selectRace(pick.id, pick.miles_away, st?.athlete?.goal_km ?? null)
      await p.refreshState()
      setStep(3)
      setDemo('Setting preferences from your data…')
      const d = await api.prefDefaults()
      savePrefs(st?.athlete?.id ?? 'none', d.defaults, '')
      setStep(4)
      setDemo(null)
      await council.start({ goal_time: null, mode: 'lean', distance_km: st?.athlete?.goal_km ?? null, preferences: d.defaults })
      setStep(5)
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : String(e))
      setDemo(null)
    }
  }

  const section = (n: Step, body: ReactNode, locked: string) => {
    const st = status(n)
    return (
      <section id={`step-${n}`} className={`council-section is-${st}`} aria-labelledby={`step-${n}-title`}>
        <header className="section-head">
          <span className="section-n" aria-hidden="true">{st === 'done' ? '✓' : n}</span>
          <h2 id={`step-${n}-title`}>{LABEL[n]}</h2>
          {summary[n] && <span className="section-sum">{summary[n]}</span>}
          <span className={`section-chip chip-${st}`}>{{ done: 'done', live: 'live now', next: 'up next', locked: 'waiting' }[st]}</span>
        </header>
        {st === 'locked' ? <div className="card section-locked">{locked}</div> : body}
      </section>
    )
  }

  return (
    <div className="council-home">
      {(demo || demoError) && (
        <div className={`${demoError ? 'error' : 'demo-progress'} demo-sticky`} role="status">{demoError ?? demo}</div>
      )}

      {section(1, <RunsStep state={state} onData={p.onData} onDemo={runDemo} busy={!!demo || running} goData={p.goData} next={() => setStep(2)} />, '')}
      {section(2, <RaceStep key={who} state={state} auto={!demo} onSelected={async () => { await p.refreshState(); setStep(3) }} onSpend={p.onSpend} />,
        'Load your runs above, or click Run the full demo, and the Course Whisperer finds races near you.')}
      {section(3, <PrefsStep key={`${who}-${state?.target?.id ?? ''}`} state={state} council={council} onStart={() => setStep(4)} onDone={() => setStep(5)} />,
        'Pick a race above to set your runs per week, long-run day, rest and gym days.')}
      {section(4, <DebateStep council={council} voices={p.voices} state={state} openAgent={p.openAgent} onOpened={p.onAgentOpened} />,
        'Click Convene the council above and the coaches debate your plan here, live.')}
      {section(5, planView && (
        <PlanStep view={planView} council={council} voices={p.voices} onPlan={p.onPlan} onSpend={p.onSpend} changePrefs={() => setStep(3)} />
      ), 'Your plan appears here once the council rules.')}
    </div>
  )
}
