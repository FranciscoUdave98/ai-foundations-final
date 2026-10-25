import { useState } from 'react'
import type { Step } from '../App'
import { api } from '../api'
import { fmtDay } from '../format'
import type { AppState, Dashboard, PlanView, RaceDistance, RaceQuery, Voices } from '../types'
import type { useCouncil } from '../useCouncil'
import { useUnits } from '../units'
import { loadPrefs, prefsSummary } from '../prefs'
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
  stepOverride: Step | null
  setStep: (s: Step) => void
  refreshState: () => Promise<void> | void
  onData: (d: Dashboard) => void
  onPlan: (p: PlanView) => void
  onSpend: () => void
  goData: () => void
}

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Your runs' }, { n: 2, label: 'Race' }, { n: 3, label: 'Preferences' }, { n: 4, label: 'Debate' }, { n: 5, label: 'Your plan' },
]
const DIST: Record<string, RaceDistance> = { '5K': '5K', '10K': '10K', 'Half Marathon': 'Half Marathon', Marathon: 'Marathon' }

export function defaultQuery(state: AppState | null): RaceQuery {
  return { zip: '06511', radius_mi: 100, distance: DIST[state?.athlete?.goal_distance ?? ''] ?? 'Half Marathon', weeks: 52, safety_demo: false }
}

export function CouncilHome(p: Props) {
  const { state, planView, council, stepOverride, setStep } = p
  const u = useUnits()
  const [demo, setDemo] = useState<string | null>(null)
  const [demoError, setDemoError] = useState<string | null>(null)
  const running = council.state.running

  const reachable = (n: Step) =>
    n === 1 || (n === 2 && !!state?.athlete) || (n === 3 && !!state?.target) ||
    (n === 4 && (running || council.state.feed.length > 0 || !!planView)) || (n === 5 && !!planView)
  const natural: Step = running ? 4 : !state?.athlete ? 1 : !state.target ? 2 : !planView ? 3 : 5
  const current: Step = running ? 4 : stepOverride && reachable(stepOverride) ? stepOverride : natural

  const summary: Record<Step, string | null> = {
    1: state?.athlete ? `${state.athlete.label} · ${state.athlete.runs} runs · ${u.dist(state.athlete.avg_week_km)}/week` : null,
    2: state?.target ? `${state.target.name}, ${fmtDay(state.target.date)}` : null,
    3: state?.target ? prefsSummary(loadPrefs(), u.unit, true) : null,
    4: council.state.feed.length ? `Round ${Math.max(1, council.state.round)} · $${council.state.total.toFixed(4)}` : null,
    5: planView ? `${planView.plan.weeks.length} weeks · ${planView.check.passed ? 'every safety rule passes' : 'check the warnings'}` : null,
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
      setDemo('Setting preferences…')
      const prefs = loadPrefs()
      setStep(4)
      setDemo(null)
      await council.start({ goal_time: prefs.goal_time || null, mode: 'lean', distance_km: st?.athlete?.goal_km ?? null })
      setStep(5)
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : String(e))
      setDemo(null)
    }
  }

  return (
    <div className="council-home">
      <ol className="stepper" aria-label="Plan steps">
        {STEPS.map((s) => {
          const done = !!summary[s.n] && s.n !== current
          const can = reachable(s.n) && !running
          return (
            <li key={s.n} className={`step${s.n === current ? ' current' : ''}${done ? ' done' : ''}`}>
              <button disabled={!can} onClick={() => setStep(s.n)} aria-current={s.n === current ? 'step' : undefined}>
                <span className="step-n">{done ? '✓' : s.n}</span>
                <span className="step-text">
                  <span className="step-label">{s.label}</span>
                  {summary[s.n] && <span className="step-sum">{summary[s.n]}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      {(demo || demoError) && (
        <div className={demoError ? 'error' : 'demo-progress'} role="status">{demoError ?? demo}</div>
      )}

      {current === 1 && <RunsStep state={state} onData={p.onData} onDemo={runDemo} busy={!!demo || running} goData={p.goData} next={() => setStep(2)} />}
      {current === 2 && <RaceStep state={state} onSelected={async () => { await p.refreshState(); setStep(3) }} onSpend={p.onSpend} />}
      {current === 3 && <PrefsStep state={state} council={council} onStart={() => setStep(4)} onDone={() => setStep(5)} />}
      {current === 4 && <DebateStep council={council} voices={p.voices} state={state} />}
      {current === 5 && planView && (
        <PlanStep view={planView} council={council} voices={p.voices} onPlan={p.onPlan} onSpend={p.onSpend}
          changePrefs={() => setStep(3)} />
      )}
    </div>
  )
}
