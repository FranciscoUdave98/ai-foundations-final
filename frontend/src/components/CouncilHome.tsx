import { Play, RefreshCw } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { api, SESSION_ID } from '../api'
import { lastSetup, rememberSetup, savePrefs, setupSig } from '../prefs'
import type { AppState, Dashboard, Persona, PlanView, Voices } from '../types'
import { toast } from '../ui'
import type { useCouncil } from '../useCouncil'
import { CouncilBoard } from './council/CouncilBoard'
import { Landing } from './council/Landing'
import { PrefsCard, usePrefs } from './council/PrefsCard'
import { RaceCard } from './council/RaceCard'
import { RaceHome } from './council/RaceHome'
import { LoadingScreen } from './LoadingScreen'
import { RunsCard } from './council/RunsCard'
import { DIST_KM, defaultQuery } from './council/setup'

type Council = ReturnType<typeof useCouncil>

/** Council home: setup row, the council (org chart + docked chat), result strip. One screen, nothing collapses. */
export function CouncilHome(p: {
  state: AppState | null; loaded: boolean; planView: PlanView | null; voices: Voices | null; council: Council
  refreshState: () => Promise<void> | void; onData: (d: Dashboard) => void; onPlan: (pv: PlanView) => void; onSpend: () => void
  goPlan: () => void; rerunPending: boolean; onRerunStarted: () => void; openAgent: Persona | null; onAgentOpened: () => void; chat: ReactNode
}) {
  const { state, planView, council } = p
  const prefs = usePrefs(state)
  const [demo, setDemo] = useState<string | null>(null)
  const running = council.state.running
  const target = state?.target ?? null

  const sig = setupSig(target, prefs.prefs, prefs.goal)
  const saved = lastSetup(SESSION_ID)
  const changed = !!planView && !!saved && !!sig && saved !== sig

  async function convene(body?: Parameters<Council['start']>[0], race: { id: string; target_km?: number | null } | null = target) {
    const b = body ?? { goal_time: prefs.goal.trim() || null, mode: 'lean' as const, distance_km: target?.target_km ?? null, preferences: prefs.prefs }
    if (!b.preferences) return
    rememberSetup(setupSig(race, b.preferences, b.goal_time ?? ''), SESSION_ID)
    await council.start(b)
  }

  // My Plan's "Re-run with new settings" lands here and starts the run.
  useEffect(() => {
    if (!p.rerunPending || !prefs.prefs || !target || running) return
    p.onRerunStarted()
    convene()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.rerunPending, prefs.prefs, target, running])

  /** "Run the full demo": Athlete A → the Scout's top pick → default preferences → council. Never leaves the page. */
  async function runDemo() {
    try {
      setDemo('Loading Athlete A')
      p.onData(await api.useSample('athlete_a'))
      const st = await api.state()
      setDemo('The Scout is reading race listings')
      const q = defaultQuery(st)
      await api.searchRaces(q)
      const scout = await api.scoutRaces(q)
      p.onSpend()
      const pick = scout.cards.find((c) => c.id === scout.top_pick) ?? scout.cards[0]
      if (!pick) throw new Error('no race')
      const km = DIST_KM[q.distance] ?? st.athlete?.goal_km ?? null
      const sel = await api.selectRace(pick.id, pick.miles_away, km)
      await p.refreshState()
      toast(`Race set: ${pick.name.split(' (')[0]}`)
      setDemo('Setting preferences from your runs')
      const d = await api.prefDefaults()
      const id = `${st.athlete?.id}-${st.athlete?.runs}`
      savePrefs(id, d.defaults, '')
      prefs.reset(d.defaults)
      setDemo(null)
      await convene({ goal_time: null, mode: 'lean', distance_km: sel.selected.target_km ?? km, preferences: d.defaults }, sel.selected)
    } catch {
      toast("The demo couldn't finish. Check the backend is running, then retry.", 'error')
    } finally {
      setDemo(null)
    }
  }

  const why = !state?.athlete ? 'Load your runs first' : !target ? 'Pick a race first' : running ? 'The council is already running' : !prefs.prefs ? 'Loading your preferences' : undefined
  const label = !planView ? 'Build my plan' : changed ? 'Re-run with new settings' : 'Rebuild my plan'
  const sub = !planView ? '5 coaches debate it live · about $0.006' : changed ? 'Setup changed since this plan' : 'Same settings, a fresh debate'

  const a = state?.athlete
  const mainButton = (
    <span className="action-wrap" title={why}>
      <button className={`btn btn-main${changed ? ' btn-amber' : !a ? ' btn-primary' : planView || why ? ' btn-outline' : ' btn-primary'}`}
        onClick={() => (a ? convene() : runDemo())} disabled={a ? !!why || !!demo : !!demo || running}>
        {planView ? <RefreshCw size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        <span><strong>{a ? label : 'Run the full demo'}</strong><small>{a ? sub : 'About $0.007 · 1 minute'}</small></span>
      </button>
    </span>
  )

  const LOAD_STEPS = ['Reading your runs', 'Finding a race near you', 'Setting your preferences']
  const step = demo?.startsWith('Loading') ? 0 : demo?.startsWith('The Scout') ? 1 : demo ? 2 : -1
  const overlay = demo ? <LoadingScreen title="Getting your plan ready" steps={LOAD_STEPS} current={step} tip="Next: 5 coaches debate your plan live." /> : null
  const watch = () => document.getElementById('council-board')?.scrollIntoView({ block: 'start', behavior: 'smooth' })

  if (!p.loaded) return <div className="landing" aria-busy="true" />
  if (!a) return <>{overlay}<Landing voices={p.voices} onDemo={runDemo} onData={p.onData} busy={demo} /></>

  return (
    <div className="council-home">
      {overlay}
      <RaceHome state={state} view={planView} running={running} round={council.state.round} goPlan={p.goPlan} watch={watch} action={mainButton} />

      <div className="section-title"><h2>How your coaches decided</h2><span>Click a coach to see why</span></div>
      <div className={`council-row${p.chat ? '' : ' no-chat'}`}>
        <CouncilBoard council={council} voices={p.voices} state={state} openAgent={p.openAgent} onOpened={p.onAgentOpened} />
        {p.chat}
      </div>

      <div className="section-title"><h2>Settings</h2><span>Change anything, then re-run</span></div>
      <div className="setup-row" data-tip="setup">
        <RunsCard state={state} loaded={p.loaded} onData={p.onData} onDemo={runDemo} busy={!!demo || running} />
        <RaceCard state={state} refreshState={p.refreshState} onSpend={p.onSpend} demo={!!demo} />
        <PrefsCard state={state} p={prefs} disabled={running} />
      </div>
    </div>
  )
}
