import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { ComingSoon } from './components/ComingSoon'
import { CheckinTab } from './components/CheckinTab'
import { CouncilTab } from './components/CouncilTab'
import { DashboardTab } from './components/DashboardTab'
import { HoodTab } from './components/HoodTab'
import { PlanTab } from './components/PlanTab'
import { RaceFinderTab } from './components/RaceFinderTab'
import { Sidebar } from './components/Sidebar'
import { StartTab } from './components/StartTab'
import type { Dashboard, PlanView, Profile, RaceHit, TabId, UsageSummary, Voices } from './types'

const TABS: { id: TabId; label: string; part?: number }[] = [
  { id: 'start', label: 'Start' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'races', label: 'Race Finder' },
  { id: 'council', label: 'Coaching Council' },
  { id: 'plan', label: 'My Plan' },
  { id: 'checkin', label: 'Check-in' },
  { id: 'hood', label: 'Under the hood' },
]

const TAB_IDS = TABS.map((t) => t.id)
const fromHash = (): TabId => {
  const h = window.location.hash.slice(1) as TabId
  return TAB_IDS.includes(h) ? h : 'start'
}

export default function App() {
  const [tab, setTabState] = useState<TabId>(fromHash)
  // Tabs live in the URL (#dashboard, #council, #plan, #hood) so links and screenshots open the right one.
  const setTab = useCallback((t: TabId) => { setTabState(t); window.history.replaceState(null, '', `#${t}`) }, [])
  useEffect(() => {
    const onHash = () => setTabState(fromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [target, setTarget] = useState<RaceHit | null>(null)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [voices, setVoices] = useState<Voices | null>(null)
  const [planView, setPlanView] = useState<PlanView | null>(null)
  const refreshUsage = useCallback(() => { api.usage().then(setUsage).catch(() => {}) }, [])

  const onLoaded = useCallback(async (d: Dashboard) => {
    setDashboard(d)
    setTarget(null)
    setPlanView(null)
    setTab('dashboard')
    setProfile(await api.profile())
  }, [setTab])

  // After a page reload, pick up data the backend already holds for this session.
  useEffect(() => {
    api.dashboard().then((d) => { setDashboard(d); return api.profile() }).then(setProfile).catch(() => {})
    api.selectedRace().then((r) => setTarget(r.selected)).catch(() => {})
    api.plan().then((p) => setPlanView(p.plan_view)).catch(() => {})
    api.voices().then(setVoices).catch(() => {})
    refreshUsage()
  }, [refreshUsage])

  return (
    <div className="app">
      <Sidebar profile={profile} source={dashboard ? `${dashboard.total_runs} runs` : null} target={target} usage={usage} />
      <div className="main">
        <nav className="tabs" role="tablist" aria-label="PaceLab sections">
          {TABS.map((t, i) => {
            const locked = t.id === 'dashboard' && !dashboard
            return (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab${t.part || locked ? ' locked' : ''}`}
                onClick={() => setTab(t.id)} title={t.part ? `Coming in Part ${t.part}` : locked ? 'Load data first' : undefined}>
                <span className="num">{i + 1}</span>{t.label}
              </button>
            )
          })}
        </nav>
        <main className="content">
          {tab === 'start' && <StartTab onLoaded={onLoaded} hasData={!!dashboard} goDashboard={() => setTab('dashboard')} />}
          {tab === 'dashboard' && (dashboard
            ? <DashboardTab initial={dashboard} planKey={planView?.run_id} />
            : <ComingSoon title="No data yet" badge="Dashboard" text="Go to Start and click Use sample data, or upload your export." />)}
          {tab === 'races' && <RaceFinderTab hasData={!!dashboard} selected={target} onSelect={setTarget} onSpend={refreshUsage} />}
          {/* The council stays mounted so a live run keeps streaming while you look at other tabs. */}
          <div hidden={tab !== 'council'}>
            <CouncilTab target={target} voices={voices} onPlan={setPlanView} onSpend={refreshUsage}
              goRaces={() => setTab('races')} goPlan={() => setTab('plan')} />
          </div>
          {tab === 'plan' && <PlanTab view={planView} voices={voices} onChange={setPlanView} goCouncil={() => setTab('council')} />}
          {tab === 'checkin' && <CheckinTab view={planView} voices={voices} onPlan={setPlanView} onSpend={refreshUsage}
            goCouncil={() => setTab('council')} goPlan={() => setTab('plan')} />}
          {tab === 'hood' && <HoodTab view={planView} onSpend={refreshUsage} />}
        </main>
      </div>
    </div>
  )
}
