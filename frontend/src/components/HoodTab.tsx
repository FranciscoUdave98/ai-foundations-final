import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { api } from '../api'
import { Info } from '../glossary'
import { CoachSays } from './CoachSays'
import { AgentIcon } from '../agents'
import type { Persona } from '../types'

const CAP_NOTE = 'A chat message also has its own $0.002 cap, which counts toward the session. A hit stops the run politely and keeps what it finished.'
import type {
  AbResult, BudgetStatus, HoodRun, HoodRunDetail, HoodSummary, PlanView, ReceiptsSummary, SafetyDemo, SafetyGroup,
} from '../types'

const AGENT_LABEL: Record<string, string> = {
  head_coach: 'Head Coach', plan_builder: 'Plan Builder', physio: 'Injury Guard', strength: 'Strength Coach',
  race_day: 'Race-Day Planner', race_scout: 'Race Scout', coach_chat: 'Coach chat',
  checkin_intake: 'Check-in intake', checkin_physio: 'Check-in: Injury Guard', checkin_coach: 'Check-in: Head Coach',
}
const TYPE_LABEL: Record<string, string> = {
  plan_build: 'Build a plan (full council)', check_in: 'Weekly check-in', race_search: 'Race search', chat: 'Coach chat message',
}
const usd = (n: number | null | undefined, d = 4) => (n == null ? '—' : `$${n.toFixed(d)}`)

/** Under the hood: what it costs, what stops it, and what every agent actually said. */
export function HoodTab({ view, onSpend }: { view: PlanView | null; onSpend: () => void }) {
  const [summary, setSummary] = useState<HoodSummary | null>(null)
  const [receipts, setReceipts] = useState<ReceiptsSummary | null>(null)
  const [budget, setBudget] = useState<BudgetStatus | null>(null)
  const [caps, setCaps] = useState<BudgetStatus['caps'] | null>(null)
  const [ab, setAb] = useState<AbResult | null>(null)
  const [runs, setRuns] = useState<HoodRun[]>([])
  const [groups, setGroups] = useState<SafetyGroup[]>([])
  const [saved, setSaved] = useState('')

  const load = useCallback(() => {
    api.hoodSummary().then(setSummary).catch(() => {})
    api.receipts().then(setReceipts).catch(() => {})
    api.budget().then((b) => { setBudget(b); setCaps(b.caps) }).catch(() => {})
    api.ab().then((r) => setAb(r.ab)).catch(() => {})
    api.hoodRuns().then((r) => setRuns(r.runs)).catch(() => {})
    api.safetyGrouped().then((r) => setGroups(r.groups)).catch(() => {})
  }, [])
  useEffect(load, [load])

  async function save(next: BudgetStatus['caps']) {
    const b = await api.setBudget(next)
    setBudget(b)
    setCaps(b.caps)
    setSaved('Saved')
    setTimeout(() => setSaved(''), 1500)
    onSpend()
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Cost &amp; Safety</h1>
          <p>What it costs to run PaceLab, and how it stays safe</p>
        </div>
        <button className="btn btn-outline" onClick={load}><RefreshCw size={16} aria-hidden="true" /> Refresh</button>
      </div>

      <CoachSays id="marshal">I'm the Safety Checker. Every AI call is counted and capped, and every race listing is cleaned before an AI reads it.</CoachSays>

      {summary && (
        <div className="hood-hero">
          <div className="card hh">
            <img src="/pacekit-png/features/low-cost.png" alt="" />
            <span className="hh-big">{usd(summary.cost.per_plan_usd, 3)}</span>
            <strong>per training plan</strong>
            <span>{usd(summary.cost.users_100_month_usd, 2)}/month for 100 users</span>
          </div>
          <div className="card hh">
            <img src="/pacekit-png/features/stopwatch.png" alt="" />
            <span className="hh-big">{view?.receipt ? `${Math.round(view.receipt.seconds)} s` : '~1 min'}</span>
            <strong>to build a plan</strong>
            <span>{view?.receipt ? `${view.receipt.agents.reduce((n, a) => n + a.calls, 0)} AI calls, all live` : 'Every coach works live while you watch'}</span>
          </div>
          <div className="card hh">
            <img src="/pacekit-png/icons/council.png" alt="" />
            <span className="hh-big">{summary.agents.ai.length + 1}</span>
            <strong>AI agents at work</strong>
            <span>+ {summary.agents.code.length} safety checks in code</span>
          </div>
          <div className="card hh">
            <img src="/pacekit-png/icons/safety.png" alt="" />
            <span className="hh-big">{summary.safety.cleaned}</span>
            <strong>attacks stopped</strong>
            <span>{summary.safety.trap_calls === 0 ? '0 got through to an agent' : `${summary.safety.trap_calls} trap calls caught`}</span>
          </div>
        </div>
      )}

      <div className="row-2b">
        <section className="card" data-highlight="cost_table">
          <h2 className="hood-h2"><img className="dash-ic" src="/pacekit-png/icons/data.png" alt="" />Where the money goes <Info term="token_cost" /></h2>
          <p className="card-sub">One user, one month: 1 plan, 4 check-ins, 2 race searches, 20 chat messages</p>
          {receipts ? (() => {
            const rows = Object.entries(receipts.monthly_mix).map(([k, n]) => ({ k, cost: (receipts.avg_cost_by_type[k] ?? 0) * n, n }))
            const max = Math.max(...rows.map((r) => r.cost), 1e-9)
            return (
              <>
                <div className="money-bars">
                  {rows.map((r) => (
                    <div key={r.k} className="mb-row">
                      <span className="mb-label">{TYPE_LABEL[r.k] ?? r.k} <small>×{r.n}</small></span>
                      <span className="mb-track"><span style={{ width: `${(r.cost / max) * 100}%` }} /></span>
                      <span className="mb-val">{usd(r.cost, 4)}</span>
                    </div>
                  ))}
                </div>
                <div className="scale">
                  <div><span>1 user / month</span><strong>{usd(receipts.cost_per_user_month, 3)}</strong></div>
                  <div><span>100 users</span><strong>{usd(receipts.scale['100_users'], 2)}</strong></div>
                  <div><span>10,000 users</span><strong>{usd(receipts.scale['10000_users'], 0)}</strong></div>
                </div>
              </>
            )
          })() : <p className="muted">Loading…</p>}
        </section>

        <section className="card" data-highlight="budget_caps">
          <h2 className="hood-h2"><img className="dash-ic" src="/pacekit-png/new-icons/budget-remaining.png" alt="" />Spending limits</h2>
          <p className="card-sub">Checked before and after every AI call. Hitting one stops the run politely.</p>
          {budget && caps && (
            <>
              <div className="caps">
                <div><span>Per plan</span><strong>{usd(caps.per_run_usd, 2)}</strong></div>
                <div><span>Per visit</span><strong>{usd(caps.per_session_usd, 2)}</strong></div>
                <div><span>Per day</span><strong>{usd(caps.per_day_usd, 2)}</strong></div>
              </div>
              <p className="caps-spent">Spent so far: <b>{usd(budget.spent.session_usd, 3)}</b> this visit · <b>{usd(budget.spent.today_usd, 3)}</b> today</p>
              <div className="budget-actions">
                <button className="btn btn-outline" onClick={() => save({ ...caps, per_run_usd: 0.001 })} title="Then build a plan and watch the hard stop">Try it: set the plan limit to $0.001</button>
                <button className="btn-text" onClick={() => save({ per_run_usd: 0.05, per_session_usd: 0.5, per_day_usd: 2, max_requests_per_run: 40 })}>Reset limits</button>
                {saved && <span className="muted">{saved}</span>}
              </div>
              <details className="caps-edit">
                <summary>Edit the limits</summary>
                <div className="budget-form">
                  {(['per_run_usd', 'per_session_usd', 'per_day_usd'] as const).map((k) => (
                    <label key={k}>{k.replace('per_', 'Per ').replace('_usd', '')}
                      <input type="number" step="0.001" min="0.0001" value={caps[k]} onChange={(e) => setCaps({ ...caps, [k]: Number(e.target.value) })} />
                    </label>
                  ))}
                  <button className="btn btn-sm" onClick={() => save(caps)}>Save</button>
                </div>
                <p className="card-sub">{CAP_NOTE}</p>
              </details>
            </>
          )}
        </section>
      </div>

      <AbTable ab={ab} />
      <RunInspector runs={runs} lastPlan={view?.run_id ?? null} />
      <SafetyLog groups={groups} />
    </div>
  )
}

function AbTable({ ab }: { ab: AbResult | null }) {
  return (
    <section className="card hood-section">
      <h2 className="hood-h2"><img className="dash-ic" src="/pacekit-png/project/compare-plans.png" alt="" />Do the coaches need all your raw runs?</h2>
      <p className="card-sub">We tested it: the same plans built two ways. "Lean" sends a one-page summary of your running; "Full" also sends 90 days of raw runs.</p>
      {ab?.totals.lean && ab.totals.full && (
        <div className="ab-hero">
          <div><span>Extra tokens with Full</span><strong>{(ab.totals.full.input_tokens / Math.max(1, ab.totals.lean.input_tokens)).toFixed(1)}×</strong></div>
          <div><span>Extra cost with Full</span><strong>+{Math.round((ab.totals.full.cost_usd / ab.totals.lean.cost_usd - 1) * 100)}%</strong></div>
          <div><span>Safer plans with Full</span><strong>No</strong></div>
          <div className="win"><span>So PaceLab uses</span><strong>Lean</strong></div>
        </div>
      )}
      {!ab && <p className="muted">Not run yet. Run <code>python scripts/ab_test.py</code> (about $0.05).</p>}
    </section>
  )
}

const AGENT_ID: Record<string, Persona> = {
  head_coach: 'monk', plan_builder: 'wallbreaker', physio: 'taper', strength: 'guru', race_day: 'kickstarter', race_scout: 'whisperer',
  checkin_physio: 'taper', checkin_coach: 'monk', checkin_intake: 'monk', coach_chat: 'monk',
}

/** The last plan's bill, one bar per coach. */
function RunInspector({ runs, lastPlan }: { runs: HoodRun[]; lastPlan: string | null }) {
  const [detail, setDetail] = useState<HoodRunDetail | null>(null)
  const id = lastPlan ?? runs.find((r) => r.type === 'plan_build')?.run_id ?? runs[0]?.run_id ?? null
  useEffect(() => { if (id) api.hoodRun(id).then(setDetail).catch(() => setDetail(null)) }, [id])
  if (!detail) return null
  const agents = Object.entries(detail.agents).sort((a, b) => b[1].cost_usd - a[1].cost_usd)
  const max = Math.max(...agents.map(([, a]) => a.cost_usd), 1e-9)
  const calls = agents.reduce((n, [, a]) => n + a.calls, 0)
  return (
    <section className="card hood-section">
      <h2 className="hood-h2"><img className="dash-ic" src="/pacekit-png/icons/council.png" alt="" />Who spent what on your last plan</h2>
      <p className="card-sub">{calls} AI calls in total, {usd(detail.cost_usd, 4)} for the whole plan</p>
      <div className="spend-list">
        {agents.map(([name, a]) => (
          <div key={name} className="sp-row">
            {AGENT_ID[name] ? <AgentIcon id={AGENT_ID[name]} /> : <span className="sp-dot" />}
            <span className="sp-name">{AGENT_LABEL[name] ?? name}<small>{a.calls} call{a.calls === 1 ? '' : 's'}</small></span>
            <span className="sp-track"><span style={{ width: `${(a.cost_usd / max) * 100}%`, background: AGENT_ID[name] ? `var(--agent-${AGENT_ID[name]})` : undefined }} /></span>
            <span className="sp-val">{usd(a.cost_usd, 4)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function SafetyLog({ groups }: { groups: SafetyGroup[] }) {
  const [demo, setDemo] = useState<SafetyDemo | null>(null)
  const runDemo = async () => setDemo(await api.safetyDemo(demo ? demo.n + 1 : 0))
  return (
    <section className="card hood-section" data-highlight="safety_log">
      <div className="card-head">
        <div><h2 className="hood-h2"><img className="dash-ic" src="/pacekit-png/slides/code-rules.png" alt="" />See an attack get stopped</h2><div className="card-sub">Fake race listings hide instructions for the AI. Watch the cleaner remove them before any agent reads the text.</div></div>
        <button className="btn btn-primary" onClick={runDemo}>{demo ? 'Next attack' : 'Show me an attack'}</button>
      </div>

      {demo && (
        <div className="safety-demo">
          <div className="muted small">Planted attack {demo.n + 1} of {demo.total} ({demo.id}) · {demo.attack}. Code only, no AI call.</div>
          <div className="demo-cols">
            <div><h3>Raw listing (what the page contains)</h3><pre className="raw">{demo.raw}</pre></div>
            <div><h3>What the Race Scout reads</h3><pre className="cleaned">{demo.cleaned || '(nothing: the whole field was withheld)'}</pre></div>
          </div>
          {demo.removed.length > 0 && (
            <ul className="removed">
              {demo.removed.map((r, i) => <li key={i}><span className="chip layer-code">{r.why}</span> {r.text}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="safety-counts">
        {[
          ['project/race-search', 'Race listings cleaned', groups.filter((g) => g.label.startsWith('Race')).reduce((n, g) => n + g.count, 0), 'Hidden instructions removed before the Race Scout read them'],
          ['icons/chat', 'Chat messages refused', groups.filter((g) => g.label.startsWith('Coach chat')).reduce((n, g) => n + g.count, 0), 'Off-limits requests, like signing you up for a race'],
          ['project/weekly-checkin', 'Check-ins flagged', groups.filter((g) => g.label.startsWith('Weekly')).reduce((n, g) => n + g.count, 0), 'Pain or illness: see a doctor first, plan paused'],
        ].map(([img, t, n, sub]) => (
          <div key={t as string}><img src={`/pacekit-png/${img}.png`} alt="" /><strong>{n}</strong><span>{t}</span><small>{sub}</small></div>
        ))}
      </div>
    </section>
  )
}
