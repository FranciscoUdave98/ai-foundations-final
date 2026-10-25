import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { ChatRail } from './components/ChatRail'
import { ContextBar } from './components/ContextBar'
import { CouncilHome } from './components/CouncilHome'
import { HoodTab } from './components/HoodTab'
import { MyDataTab } from './components/MyDataTab'
import { TopBar } from './components/TopBar'
import type { AppState, BudgetStatus, Dashboard, Persona, PlanView, UiAction, UsageSummary, Voices } from './types'
import { useCouncil } from './useCouncil'

export type Tab = 'council' | 'data' | 'hood'
export type Step = 1 | 2 | 3 | 4 | 5

// Old hashes from the 7-tab app still work.
const REDIRECT: Record<string, [Tab, Step | null]> = {
  start: ['data', null], dashboard: ['data', null], data: ['data', null], hood: ['hood', null],
  races: ['council', 2], plan: ['council', 5], council: ['council', null], checkin: ['council', 5],
}

// Where each chat highlight target lives.
const HIGHLIGHT_HOME: Record<string, [Tab, Step | null]> = {
  load_ratio: ['data', null], predictions: ['data', null], weekly_km: ['data', null], fun_stats: ['data', null],
  calendar: ['council', 5], preferences: ['council', 3], agent_tree: ['council', 4],
  cost_table: ['hood', null], budget_caps: ['hood', null], safety_log: ['hood', null],
}

/** Wait for an element to render (a tab switch takes a frame or two), then scroll to it and flash it. */
function flashWhenReady(selector: string, tries = 30) {
  const el = document.querySelector<HTMLElement>(selector)
  if (!el) { if (tries > 0) setTimeout(() => flashWhenReady(selector, tries - 1), 100); return }
  el.scrollIntoView({ block: 'center' })
  el.classList.remove('flash')
  void el.offsetWidth
  el.classList.add('flash')
  setTimeout(() => el.classList.remove('flash'), 3400)
}

function parseHash(): [Tab, Step | null] {
  const [name, step] = window.location.hash.slice(1).split('/')
  const hit = REDIRECT[name] ?? ['council', null]
  const n = Number(step)
  return [hit[0], n >= 1 && n <= 5 ? (n as Step) : hit[1]]
}

export default function App() {
  const [initial] = useState(parseHash)
  const [tab, setTabState] = useState<Tab>(initial[0])
  const [stepOverride, setStepOverride] = useState<Step | null>(initial[1])
  const [state, setState] = useState<AppState | null>(null)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [planView, setPlanView] = useState<PlanView | null>(null)
  const [voices, setVoices] = useState<Voices | null>(null)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [budget, setBudget] = useState<BudgetStatus | null>(null)

  const refreshUsage = useCallback(() => {
    api.usage().then(setUsage).catch(() => {})
    api.budget().then(setBudget).catch(() => {})
  }, [])
  // Retries briefly, so a page that loads while the backend is still starting doesn't come up empty.
  const refreshState = useCallback(async () => {
    for (let i = 0; i < 5; i++) {
      try { setState(await api.state()); return } catch { await new Promise((r) => setTimeout(r, 1200)) }
    }
  }, [])
  const onPlan = useCallback((pv: PlanView) => { setPlanView(pv); refreshState() }, [refreshState])
  const council = useCouncil(voices, onPlan, refreshUsage)

  const setTab = useCallback((t: Tab, step: Step | null = null) => {
    setTabState(t)
    if (step) setStepOverride(step)
    window.history.replaceState(null, '', `#${t}${t === 'council' && step ? `/${step}` : ''}`)
  }, [])

  useEffect(() => {
    const onHash = () => { const [t, s] = parseHash(); setTabState(t); if (s) setStepOverride(s) }
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

  // Replay the last council run once the voices are in, so the Debate step isn't empty after a reload.
  const [replayed, setReplayed] = useState(false)
  const { replay } = council
  useEffect(() => {
    if (voices && !replayed) { setReplayed(true); replay().catch(() => {}) }
  }, [voices, replayed, replay])

  // The coach chat's UI actions (already whitelisted in ChatRail).
  const [chatOpen, setChatOpen] = useState(false)
  const [openAgent, setOpenAgent] = useState<Persona | null>(null)
  const onAction = useCallback((a: UiAction) => {
    if (a.action === 'open_tab') setTab(a.arg as Tab)
    else if (a.action === 'go_to_step') setTab('council', Number(a.arg) as Step)
    else if (a.action === 'show_plan_week') { setTab('council', 5); flashWhenReady(`#plan-week-${Number(a.arg)}`) }
    else if (a.action === 'highlight') {
      const [t, s] = HIGHLIGHT_HOME[String(a.arg)]
      setTab(t, s)
      flashWhenReady(`[data-highlight="${a.arg}"]`)
    } else if (a.action === 'open_agent') { setTab('council', 4); setOpenAgent(a.arg as Persona) }
    if (window.matchMedia('(max-width: 1100px)').matches) setChatOpen(false)   // the floating panel would cover the page
  }, [setTab])
  const agentOpened = useCallback(() => setOpenAgent(null), [])

  const onData = useCallback((d: Dashboard) => {
    setDashboard(d)
    setPlanView(null)
    refreshState()
  }, [refreshState])

  return (
    <div className="shell">
      <TopBar tab={tab} setTab={(t) => setTab(t)} usage={usage} budget={budget} />
      <ContextBar state={state} onAthlete={() => setTab('data')} onTarget={() => setTab('council', 2)} onPlan={() => setTab('council', 5)} />
      <div className="layout with-chat">
        <main className="content" id="main">
          {tab === 'council' && (
            <CouncilHome state={state} planView={planView} voices={voices} council={council} stepOverride={stepOverride}
              setStep={(s) => setTab('council', s)} refreshState={refreshState} onData={onData} onPlan={onPlan}
              onSpend={refreshUsage} goData={() => setTab('data')} openAgent={openAgent} onAgentOpened={agentOpened} />
          )}
          {tab === 'data' && <MyDataTab dashboard={dashboard} state={state} onData={onData} planKey={planView?.run_id} />}
          {tab === 'hood' && <HoodTab view={planView} onSpend={refreshUsage} />}
        </main>
        <ChatRail voices={voices} onAction={onAction} onSpend={refreshUsage} open={chatOpen} setOpen={setChatOpen} />
      </div>
    </div>
  )
}
