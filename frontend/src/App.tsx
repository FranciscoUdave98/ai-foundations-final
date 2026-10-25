import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { api } from './api'
import { ChatPanel } from './components/ChatPanel'
import { ContextBar } from './components/ContextBar'
import { CouncilHome } from './components/CouncilHome'
import { HoodTab } from './components/HoodTab'
import { MyDataTab } from './components/MyDataTab'
import { MyPlanTab } from './components/MyPlanTab'
import { TopBar } from './components/TopBar'
import type { AppState, BudgetStatus, Dashboard, Persona, PlanView, UiAction, UsageSummary, Voices } from './types'
import { CoachMarks, Toasts, useTitle } from './ui'
import { useChat } from './useChat'
import { useCouncil } from './useCouncil'

export type Tab = 'council' | 'plan' | 'data' | 'hood'
export const TAB_TITLE: Record<Tab, string> = { council: 'Council', plan: 'My Plan', data: 'My Data', hood: 'Cost & Safety' }

// Old links from earlier layouts still land somewhere sensible.
const REDIRECT: Record<string, Tab> = {
  council: 'council', races: 'council', plan: 'plan', checkin: 'plan', data: 'data', start: 'data', dashboard: 'data', hood: 'hood',
}
function parseHash(): Tab {
  return REDIRECT[window.location.hash.slice(1).split('/')[0]] ?? 'council'
}

// Where each chat highlight target lives.
const HIGHLIGHT_HOME: Record<string, Tab> = {
  load_ratio: 'data', predictions: 'data', weekly_km: 'data', fun_stats: 'data',
  calendar: 'plan', preferences: 'council', agent_tree: 'council',
  cost_table: 'hood', budget_caps: 'hood', safety_log: 'hood',
}
// The chat's go_to_step(n): the five parts of the flow.
const STEP_TARGET: Record<number, [Tab, string]> = {
  1: ['council', '#card-runs'], 2: ['council', '#card-race'], 3: ['council', '#card-prefs'], 4: ['council', '#council-board'], 5: ['plan', '#plan-top'],
}

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
function useWide(): boolean {
  return useSyncExternalStore((l) => { const m = window.matchMedia('(min-width: 900px)'); m.addEventListener('change', l); return () => m.removeEventListener('change', l) }, wide)
}

export default function App() {
  const [tab, setTabState] = useState<Tab>(parseHash)
  const [state, setState] = useState<AppState | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [planView, setPlanView] = useState<PlanView | null>(null)
  const [voices, setVoices] = useState<Voices | null>(null)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [budget, setBudget] = useState<BudgetStatus | null>(null)
  const [rerunPending, setRerunPending] = useState(false)   // My Plan's "re-run" asks the Council tab to start a run
  const isWide = useWide()
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
  const onPlan = useCallback((pv: PlanView) => { setPlanView(pv); refreshState() }, [refreshState])
  const council = useCouncil(voices, onPlan, refreshUsage)

  const setTab = useCallback((t: Tab) => {
    setTabState(t)
    window.history.replaceState(null, '', `#${t}`)
  }, [])
  useEffect(() => {
    if (window.location.hash !== `#${parseHash()}`) window.history.replaceState(null, '', `#${parseHash()}`)
    const onHash = () => setTabState(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // After a reload: pick up everything the backend kept for this session.
  useEffect(() => {
    refreshState()
    api.dashboard().then(setDashboard).catch(() => {})
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
    else if (a.action === 'go_to_step') { const [t, sel] = STEP_TARGET[Number(a.arg)]; setTab(t); flashWhenReady(sel) }
    else if (a.action === 'show_plan_week') { setTab('plan'); flashWhenReady(`#plan-week-${Number(a.arg)}`) }
    else if (a.action === 'highlight') { setTab(HIGHLIGHT_HOME[String(a.arg)]); flashWhenReady(`[data-highlight="${a.arg}"]`) }
    else if (a.action === 'open_agent') { setTab('council'); setOpenAgent(a.arg as Persona) }
    if (!wide()) setChatOpen(false)   // on a phone the popup would cover the page
  }, [setTab])
  const agentOpened = useCallback(() => setOpenAgent(null), [])
  const chat = useChat(onAction, refreshUsage)
  const docked = tab === 'council' && isWide

  const onData = useCallback((d: Dashboard) => {
    setDashboard(d)
    setPlanView(null)
    refreshState()
  }, [refreshState])

  return (
    <div className="shell">
      <TopBar tab={tab} setTab={setTab} usage={usage} budget={budget} />
      <ContextBar state={state} onAthlete={() => setTab('data')} onTarget={() => setTab('council')} onPlan={() => setTab('plan')} />
      <main className="content" id="main">
        {tab === 'council' && (
          <CouncilHome state={state} loaded={loaded} planView={planView} voices={voices} council={council} refreshState={refreshState}
            onData={onData} onPlan={onPlan} onSpend={refreshUsage} goPlan={() => setTab('plan')} rerunPending={rerunPending} onRerunStarted={() => setRerunPending(false)}
            openAgent={openAgent} onAgentOpened={agentOpened}
            chat={docked ? <ChatPanel chat={chat} voices={voices} mode="docked" /> : null} />
        )}
        {tab === 'plan' && (
          <MyPlanTab view={planView} state={state} council={council} voices={voices} onPlan={onPlan} onSpend={refreshUsage}
            goCouncil={() => setTab('council')} rerun={() => { setRerunPending(true); setTab('council') }} />
        )}
        {tab === 'data' && <MyDataTab dashboard={dashboard} state={state} onData={onData} planKey={planView?.run_id} />}
        {tab === 'hood' && <HoodTab view={planView} onSpend={refreshUsage} />}
      </main>
      <footer className="footer">
        <span>PaceLab · MGT 409</span>
        <a href="https://github.com/" target="_blank" rel="noreferrer" onClick={(e) => { e.preventDefault(); setTab('hood') }}>How it works</a>
        <a href="https://github.com/" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
      {!docked && <ChatPanel chat={chat} voices={voices} mode="popup" open={chatOpen} setOpen={setChatOpen} />}
      <CoachMarks active={tab === 'council'} />
      <Toasts />
    </div>
  )
}
