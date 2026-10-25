import { type Tab, TAB_TITLE } from '../App'
import type { BudgetStatus, UsageSummary } from '../types'
import { NavIcon } from '../agents'
import { money } from '../ui'

const TABS: Tab[] = ['council', 'plan', 'data', 'hood', 'demo', 'slides', 'report']
const ICON = { council: 'council', plan: 'plan', data: 'data', hood: 'safety', demo: 'demo', slides: 'slides', report: 'report' } as const

export function TopBar({ tab, setTab, usage, budget }: {
  tab: Tab; setTab: (t: Tab) => void; usage: UsageSummary | null; budget: BudgetStatus | null
}) {
  const spent = usage?.session.cost_usd ?? 0
  const cap = budget?.caps.per_session_usd ?? 0.5
  return (
    <header className="topbar">
      <a className="wordmark" href="#council" onClick={(e) => { e.preventDefault(); setTab('council') }}>
        <img className="brand-mark" src="/pacekit-png/brand/pacelab-mark.png" alt="" />
        <span>PaceLab</span>
        <small className="wordmark-tag">AI running coach</small>
      </a>
      <nav className="tabs" role="tablist" aria-label="PaceLab sections">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className="tab" onClick={() => setTab(t)}><NavIcon name={ICON[t]} />{TAB_TITLE[t]}</button>
        ))}
      </nav>
      <button className="icon-btn" onClick={() => setTab('council')} aria-label="How PaceLab works" title="How PaceLab works"><img className="help-art" src="/pacekit-png/new-icons/help.png" alt="" /></button>
      <button className="token-pill" onClick={() => setTab('hood')} title="AI spend this session vs the session cap">
        <span className="pill-fill" style={{ width: `${Math.min(100, (spent / cap) * 100)}%` }} />
        <span className="pill-text">{money(spent)} of {money(cap)}</span>
      </button>
    </header>
  )
}
