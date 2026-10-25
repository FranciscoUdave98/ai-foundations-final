import type { Tab } from '../App'
import type { BudgetStatus, UsageSummary } from '../types'

const TABS: { id: Tab; label: string }[] = [
  { id: 'council', label: 'Council' },
  { id: 'data', label: 'My Data' },
  { id: 'hood', label: 'Under the hood' },
]

export function TopBar({ tab, setTab, usage, budget }: {
  tab: Tab; setTab: (t: Tab) => void; usage: UsageSummary | null; budget: BudgetStatus | null
}) {
  const spent = usage?.session.cost_usd ?? 0
  const cap = budget?.caps.per_session_usd ?? 0.5
  return (
    <header className="topbar">
      <a className="wordmark" href="#council" onClick={(e) => { e.preventDefault(); setTab('council') }}>
        <svg aria-hidden="true"><use href="#pl-logo" /></svg>
        <span>PaceLab</span>
      </a>
      <nav className="tabs" role="tablist" aria-label="PaceLab sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="tab" onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      <button className="token-pill" onClick={() => setTab('hood')} title="Real token cost this session vs the session cap. Open Under the hood for the receipt.">
        <span className="pill-fill" style={{ width: `${Math.min(100, (spent / cap) * 100)}%` }} />
        <span className="pill-text">Session ${spent.toFixed(4)} / ${cap.toFixed(2)}</span>
      </button>
    </header>
  )
}
