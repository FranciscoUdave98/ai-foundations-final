import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { ChatPanel } from './components/ChatPanel'
import { CouncilHome } from './components/CouncilHome'
import { HoodTab } from './components/HoodTab'
import { MyDataTab } from './components/MyDataTab'
import { LoadingScreen } from './components/LoadingScreen'
import { MyPlanTab } from './components/MyPlanTab'
import { TopBar } from './components/TopBar'
import type { AppState, BudgetStatus, Dashboard, Persona, PlanView, UiAction, UsageSummary, Voices } from './types'
import { Toasts, useTitle } from './ui'
import { useChat } from './useChat'
import { useCouncil } from './useCouncil'

export type Tab = 'council' | 'plan' | 'data' | 'hood' | 'demo' | 'slides' | 'report'
export const TAB_TITLE: Record<Tab, string> = { council: 'Home', plan: 'My Plan', data: 'My Data', hood: 'Cost & Safety', demo: 'Demo', slides: 'Slides', report: 'Report' }

// Old links from earlier layouts still land somewhere sensible.
const REDIRECT: Record<string, Tab> = {
  demo: 'demo', video: 'demo', slides: 'slides', report: 'report',
  council: 'council', races: 'council', plan: 'plan', checkin: 'plan', data: 'data', start: 'data', dashboard: 'data', hood: 'hood',
}
function parseHash(): Tab {
  return REDIRECT[window.location.hash.slice(1).split('/')[0]] ?? 'council'
}
/** Home's step: #council is the welcome page, #council/1 … #council/5 the guided steps. */
function parseStep(): number {
  const [head, n] = window.location.hash.slice(1).split('/')
  const step = Number(n)
  return (head === 'council' || head === '') && step >= 1 && step <= 5 ? step : 0
}

// Where each chat highlight target lives.
const HIGHLIGHT_HOME: Record<string, Tab> = {
  load_ratio: 'data', predictions: 'data', weekly_km: 'data', fun_stats: 'data',
  calendar: 'plan', preferences: 'council', agent_tree: 'council',
  cost_table: 'hood', budget_caps: 'hood', safety_log: 'hood',
}
// The chat's go_to_step(n): the five parts of the flow.
const STEP_TARGET: Record<number, string> = { 1: '#card-runs', 2: '#card-race', 3: '#card-prefs', 4: '#council-board', 5: '#plan-summary' }

/** Wait for an element to render (a tab switch takes a frame or two), then scroll to it and flash it. */
function flashWhenReady(selector: string, tries = 30, first = true) {
  if (first) { setTimeout(() => flashWhenReady(selector, tries, false), 60); return }
  const el = document.querySelector<HTMLElement>(selector)
  if (!el) { if (tries > 0) setTimeout(() => flashWhenReady(selector, tries - 1, false), 100); return }
  el.scrollIntoView({ block: 'center' })
  el.classList.remove('flash')
  void el.offsetWidth
  el.classList.add('flash')
  setTimeout(() => el.classList.remove('flash'), 3400)
}

const wide = () => window.matchMedia('(min-width: 900px)').matches

export default function App() {
  const [tab, setTabState] = useState<Tab>(parseHash)
  const [step, setStep] = useState(parseStep)
  const [state, setState] = useState<AppState | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [planView, setPlanView] = useState<PlanView | null>(null)
  const [voices, setVoices] = useState<Voices | null>(null)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [budget, setBudget] = useState<BudgetStatus | null>(null)
  const [rerunPending, setRerunPending] = useState(false)   // My Plan's "re-run" asks the Council tab to start a run
  // The splash: until the session has loaded (at least 0.7 s so it doesn't flicker), then it fades out.
  const [intro, setIntro] = useState<'on' | 'fading' | 'off'>('on')
  const [minDone, setMinDone] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMinDone(true), 700); return () => clearTimeout(t) }, [])
  useTitle(TAB_TITLE[tab])

  const refreshUsage = useCallback(() => {
    api.usage().then(setUsage).catch(() => {})
    api.budget().then(setBudget).catch(() => {})
  }, [])
  // Retries briefly, so a page that loads while the backend is still starting doesn't come up empty.
  const refreshState = useCallback(async () => {
    for (let i = 0; i < 5; i++) {
      try { setState(await api.state()); setLoaded(true); return } catch { await new Promise((r) => setTimeout(r, 1200)) }
    }
    setLoaded(true)
  }, [])
  useEffect(() => { if (intro === 'on' && minDone && loaded) setIntro('fading') }, [intro, minDone, loaded])
  useEffect(() => {
    if (intro !== 'fading') return
    const t = setTimeout(() => setIntro('off'), 500)
    return () => clearTimeout(t)
  }, [intro])
  const onPlan = useCallback((pv: PlanView) => { setPlanView(pv); refreshState() }, [refreshState])
  const council = useCouncil(voices, onPlan, refreshUsage)

  const setTab = useCallback((t: Tab) => {
    setTabState(t)
    setStep(0)
    window.history.replaceState(null, '', `#${t}`)
  }, [])
  // Steps push history, so the browser's Back button walks back through them.
  const goStep = useCallback((n: number, replace = false) => {
    setTabState('council')
    setStep(n)
    const h = n ? `#council/${n}` : '#council'
    if (replace) window.history.replaceState(null, '', h)
    else if (window.location.hash !== h) window.history.pushState(null, '', h)
    window.scrollTo({ top: 0 })
  }, [])
  useEffect(() => {
    const want = parseStep() ? `#council/${parseStep()}` : `#${parseHash()}`
    if (window.location.hash !== want) window.history.replaceState(null, '', want)
    const onHash = () => { setTabState(parseHash()); setStep(parseStep()) }
    window.addEventListener('hashchange', onHash)
    window.addEventListener('popstate', onHash)
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('popstate', onHash) }
  }, [])

  // After a reload: pick up everything the backend kept for this session.
  useEffect(() => {
    refreshState()
    // only ask for the dashboard once a runner is loaded (a first visit has none, and the 404 looked like an error)
    api.state().then((s) => { if (s.athlete) api.dashboard().then(setDashboard).catch(() => {}) }).catch(() => {})
    api.plan().then((p) => setPlanView(p.plan_view)).catch(() => {})
    api.voices().then(setVoices).catch(() => {})
    refreshUsage()
  }, [refreshState, refreshUsage])

  // Show the last council run's final state once the voices are in (instant, no tokens).
  const [replayed, setReplayed] = useState(false)
  const { replay } = council
  useEffect(() => {
    if (voices && !replayed) { setReplayed(true); replay(false).catch(() => {}) }
  }, [voices, replayed, replay])

  // The coach chat's UI actions (whitelisted in useChat).
  const [chatOpen, setChatOpen] = useState(false)
  const [openAgent, setOpenAgent] = useState<Persona | null>(null)
  const onAction = useCallback((a: UiAction) => {
    if (a.action === 'open_tab') setTab(a.arg as Tab)
    else if (a.action === 'go_to_step') { const n = Number(a.arg); if (STEP_TARGET[n]) { goStep(n); flashWhenReady(STEP_TARGET[n]) } }
    else if (a.action === 'show_plan_week') { setTab('plan'); flashWhenReady(`#plan-week-${Number(a.arg)}`) }
    else if (a.action === 'highlight') {
      const home = HIGHLIGHT_HOME[String(a.arg)]
      if (home === 'council') goStep(a.arg === 'preferences' ? 3 : 4)
      else setTab(home)
      flashWhenReady(`[data-highlight="${a.arg}"]`)
    }
    else if (a.action === 'open_agent') { goStep(4); setOpenAgent(a.arg as Persona) }
    if (!wide()) setChatOpen(false)   // on a phone the popup would cover the page
  }, [setTab, goStep])
  const agentOpened = useCallback(() => setOpenAgent(null), [])
  const chat = useChat(onAction, refreshUsage)

  const onData = useCallback((d: Dashboard) => {
    setDashboard(d)
    setPlanView(null)
    refreshState()
  }, [refreshState])

  return (
    <div className="shell">
      <TopBar tab={tab} setTab={setTab} usage={usage} budget={budget} />
      <main className="content" id="main">
        {tab === 'council' && (
          <CouncilHome step={step} goStep={goStep} state={state} loaded={loaded} planView={planView} voices={voices} council={council} refreshState={refreshState}
            onData={onData} onPlan={onPlan} onSpend={refreshUsage} goPlan={() => setTab('plan')} goData={() => setTab('data')} goHood={() => setTab('hood')}
            openChat={() => setChatOpen(true)} rerunPending={rerunPending} onRerunStarted={() => setRerunPending(false)}
            openAgent={openAgent} onAgentOpened={agentOpened}
            chat={null} />
        )}
        {tab === 'plan' && (
          <MyPlanTab view={planView} state={state} council={council} voices={voices} onPlan={onPlan} onSpend={refreshUsage}
            goCouncil={() => goStep(state?.athlete ? 4 : 0)} rerun={() => { setRerunPending(true); goStep(4) }} />
        )}
        {tab === 'data' && <MyDataTab dashboard={dashboard} state={state} onData={onData} planKey={planView?.run_id} />}
        {tab === 'hood' && <HoodTab view={planView} onSpend={refreshUsage} />}
        {tab === 'demo' && (
          <div className="doc-view demo-view">
            <div className="doc-bar">
              <span>Demo video · the guided demo start to finish, with a live AI plan build (3 min)</span>
              <a className="btn btn-outline btn-sm" href="/demo/pacelab-demo.webm" target="_blank" rel="noreferrer">Open full screen</a>
            </div>
            <video className="demo-video" src="/demo/pacelab-demo.webm" poster="/demo/poster.jpg" controls playsInline preload="metadata" />
          </div>
        )}
        {(tab === 'slides' || tab === 'report') && (
          <div className="doc-view">
            <div className="doc-bar">
              <span>{tab === 'slides' ? 'Final presentation · use the arrow keys' : 'Final report'}</span>
              <a className="btn btn-outline btn-sm" href={`/docs/${tab}.html`} target="_blank" rel="noreferrer">Open full screen</a>
            </div>
            <iframe key={tab} className="doc-frame" src={`/docs/${tab}.html`} title={TAB_TITLE[tab]} />
          </div>
        )}
      </main>
      {!(tab === 'council' && step > 0) && tab !== 'demo' && tab !== 'slides' && tab !== 'report' && <footer className="footer">
        <span>PaceLab · MGT 409</span>
        <a href="#hood" onClick={(e) => { e.preventDefault(); setTab('hood') }}>Under the hood</a>
        <a href="https://github.com/FranciscoUdave98/ai-foundations-final" target="_blank" rel="noreferrer">GitHub</a>
      </footer>}
      {tab !== 'demo' && tab !== 'slides' && tab !== 'report' && <ChatPanel chat={chat} voices={voices} mode="popup" open={chatOpen} setOpen={setChatOpen} />}
      <Toasts />
      {intro !== 'off' && <LoadingScreen fading={intro === 'fading'} />}
    </div>
  )
}
