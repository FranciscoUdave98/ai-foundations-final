import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { api } from '../api'
import { Info } from '../glossary'
import { Info as InfoIcon } from 'lucide-react'

const MIX_NOTE = 'A typical month per user. Prices per 1M tokens (gpt-6-luna): input $0.10, cached $0.01, cache write $0.125, output $0.50.'
const CAP_NOTE = 'A chat message also has its own $0.002 cap, which counts toward the session. A hit stops the run politely and keeps what it finished.'
import type {
  AbResult, BudgetStatus, HoodRun, HoodRunDetail, HoodSummary, PlanView, ReceiptsSummary, SafetyDemo, SafetyGroup,
} from '../types'

const AGENT_LABEL: Record<string, string> = {
  head_coach: '🧘 Marathon Monk', plan_builder: '🪖 Sgt. Wall-Breaker', physio: '🩺 Dr. Taper', strength: '🏋️ Glute Guru',
  race_day: '⚡ Kickstarter', race_scout: '🗺️ Course Whisperer', coach_chat: '💬 Coach chat',
  checkin_intake: '📝 Check-in intake', checkin_physio: '🩺 Check-in physio', checkin_coach: '🧘 Check-in coach',
}
const OUTPUT_LABEL: Record<string, string> = { ...AGENT_LABEL, check_in: '📝 Check-in', note: 'Note' }
const TYPE_LABEL: Record<string, string> = {
  plan_build: 'Build a plan (full council)', check_in: 'Weekly check-in', race_search: 'Race search', chat: 'Coach chat message',
}
const ATHLETE: Record<string, string> = { athlete_a: 'Athlete A', athlete_b: 'Athlete B', athlete_c: 'Athlete C' }
const usd = (n: number | null | undefined, d = 4) => (n == null ? '—' : `$${n.toFixed(d)}`)
const when = (t: string | null) => (t ? t.slice(5, 16).replace('T', ' ') : '—')

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
          <p>What every AI call cost, and what the defenses caught</p>
        </div>
        <button className="btn btn-outline" onClick={load}><RefreshCw size={16} aria-hidden="true" /> Refresh</button>
      </div>

      {summary && (
        <div className="hood-tiles">
          <div className="card stat" title={[...summary.agents.ai, summary.agents.chat, ...summary.agents.code].join('\n')}>
            <span>The team</span>
            <strong>{summary.agents.ai.length} AI agents + chat</strong>
            <small>{summary.agents.code.length} code components: {summary.agents.code.map((c) => c.split(' (')[0]).join(', ')}</small>
          </div>
          <div className="card stat">
            <span>Cost <Info term="token_cost" /></span>
            <strong>{usd(summary.cost.per_plan_usd, 3)} per plan</strong>
            <small>about {usd(summary.cost.users_100_month_usd, 2)} a month for 100 users</small>
          </div>
          <div className="card stat">
            <span>Safety</span>
            <strong>{summary.safety.cleaned} injection attempts cleaned</strong>
            <small>{summary.safety.trap_calls} trap calls · {summary.safety.events} safety events logged</small>
          </div>
        </div>
      )}

      <div className="row-2b">
        <section className="card" data-highlight="cost_table">
          <div className="card-head"><div><h2>Cost per user <Info term="token_cost" /></h2><div className="card-sub">Per month, from real runs</div></div></div>
          {receipts ? (
            <>
              <table className="data">
                <thead><tr><th>Run type</th><th className="num">Measured runs</th><th className="num">Avg cost</th><th className="num">Per month</th><th className="num">Monthly cost</th></tr></thead>
                <tbody>
                  {Object.entries(receipts.monthly_mix).map(([k, n]) => (
                    <tr key={k}><td>{TYPE_LABEL[k] ?? k}</td><td className="num">{receipts.runs_by_type[k] ?? 0}</td>
                      <td className="num">{receipts.avg_cost_by_type[k] != null ? usd(receipts.avg_cost_by_type[k], 5) : 'not measured yet'}</td>
                      <td className="num">{n}×</td><td className="num">{usd((receipts.avg_cost_by_type[k] ?? 0) * n, 5)}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="scale">
                <div><span>1 user / month</span><strong>{usd(receipts.cost_per_user_month)}</strong></div>
                <div><span>100 users</span><strong>{usd(receipts.scale['100_users'], 2)}</strong></div>
                <div><span>10,000 users</span><strong>{usd(receipts.scale['10000_users'], 2)}</strong></div>
              </div>
              <p className="card-sub">1 plan, 4 check-ins, 2 race searches, 20 chats {<span className="info" tabIndex={0} role="note" aria-label={MIX_NOTE}><InfoIcon size={13} aria-hidden="true" /><span className="info-tip" role="tooltip">{MIX_NOTE}</span></span>}</p>
            </>
          ) : <p className="muted">Loading…</p>}
        </section>

        <section className="card" data-highlight="budget_caps">
          <div className="card-head"><div><h2>Budget caps</h2><div className="card-sub">Checked before and after every AI call</div></div>{saved && <span className="muted">{saved}</span>}</div>
          {budget && caps && (
            <>
              <div className="budget-form">
                {(['per_run_usd', 'per_session_usd', 'per_day_usd'] as const).map((k) => (
                  <label key={k}>{k.replace('per_', 'Per ').replace('_usd', '')}
                    <input type="number" step="0.001" min="0.0001" value={caps[k]} onChange={(e) => setCaps({ ...caps, [k]: Number(e.target.value) })} />
                  </label>
                ))}
              </div>
              <div className="budget-actions">
                <button className="btn btn-primary" onClick={() => save(caps)}>Save caps</button>
                <button className="btn btn-outline" onClick={() => save({ ...caps, per_run_usd: 0.001 })} title="Then build a plan and watch the hard stop">Demo: run cap $0.001</button>
                <button className="btn-text" onClick={() => save({ per_run_usd: 0.05, per_session_usd: 0.5, per_day_usd: 2, max_requests_per_run: 40 })}>Reset</button>
              </div>
              <p className="card-sub">Spent {usd(budget.spent.session_usd, 4)} this session · {usd(budget.spent.today_usd, 4)} today {<span className="info" tabIndex={0} role="note" aria-label={CAP_NOTE}><InfoIcon size={13} aria-hidden="true" /><span className="info-tip" role="tooltip">{CAP_NOTE}</span></span>}</p>
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
      <div className="card-head">
        <div><h2>Lean vs Full test</h2>
          <div className="card-sub">Same council and race, two context sizes</div></div>
      </div>
      {!ab ? <p className="muted">Not run yet. Run <code>python scripts/ab_test.py</code> (about $0.05).</p> : (
        <>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Athlete</th><th>Race</th><th>Context</th><th className="num">Input tokens</th><th className="num">Calls</th><th className="num">Cost</th>
                <th className="num">Seconds</th><th className="num">Vetoes</th><th className="num">Week 1 km</th><th className="num">Peak km</th><th>Safety rules</th></tr></thead>
              <tbody>
                {ab.rows.map((r) => (
                  <tr key={r.run_id ?? `${r.athlete}-${r.mode}`} className={r.mode === 'full' ? 'ab-full' : undefined}>
                    <td>{ATHLETE[r.athlete] ?? r.athlete}</td><td>{r.race}</td><td>{r.mode === 'lean' ? 'Lean' : 'Full'}</td>
                    <td className="num">{r.input_tokens?.toLocaleString()}</td><td className="num">{r.calls}</td><td className="num">{usd(r.cost_usd)}</td>
                    <td className="num">{r.seconds?.toFixed(0)}</td><td className="num">{r.vetoes}</td><td className="num">{r.week1_km}</td><td className="num">{r.peak_km}</td>
                    <td>{r.error ?? (r.checker_passed ? '✓ pass' : '✕ fail')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ab.totals.lean && ab.totals.full && (
            <p className="plain">
              Full cost {Math.round((ab.totals.full.cost_usd / ab.totals.lean.cost_usd - 1) * 100)}% more, no safer plans: PaceLab ships Lean
              {' '}<span className="info" tabIndex={0} role="note" aria-label="Lean sends the compact profile (about 1-2K tokens). Full also sends the last 90 days of raw runs.">
                <InfoIcon size={13} aria-hidden="true" /><span className="info-tip" role="tooltip">Lean sends the compact profile (about 1-2K tokens). Full also sends the last 90 days of raw runs. Full used {(ab.totals.full.input_tokens / Math.max(1, ab.totals.lean.input_tokens)).toFixed(1)}× the input tokens; safety rules passed in {ab.totals.full.passed} of {ab.totals.full.n} (Full) and {ab.totals.lean.passed} of {ab.totals.lean.n} (Lean).</span></span>
            </p>
          )}
          <p className="card-sub">Run {when(ab.created)} · scripts/ab_test.py</p>
        </>
      )}
    </section>
  )
}

function RunInspector({ runs, lastPlan }: { runs: HoodRun[]; lastPlan: string | null }) {
  const [pick, setPick] = useState<string | null>(null)
  const [detail, setDetail] = useState<HoodRunDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const id = pick ?? lastPlan ?? runs[0]?.run_id ?? null

  useEffect(() => {
    if (!id) return
    setError(null)
    api.hoodRun(id).then(setDetail).catch((e) => { setDetail(null); setError(String(e.message ?? e)) })
  }, [id])

  const agents = detail ? Object.entries(detail.agents) : []
  return (
    <section className="card hood-section">
      <div className="card-head">
        <div><h2>Run inspector</h2><div className="card-sub">Each agent's cost, tokens and full output</div></div>
        <select value={id ?? ''} onChange={(e) => setPick(e.target.value)} aria-label="Pick a run">
          {runs.map((r) => (
            <option key={r.run_id} value={r.run_id}>{when(r.time)} · {TYPE_LABEL[r.type] ?? r.type}{r.mode ? ` (${r.mode})` : ''} · {usd(r.cost_usd)}</option>
          ))}
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      {detail && (
        <>
          <table className="data">
            <thead><tr><th>Agent</th><th className="num">Calls</th><th className="num">Input</th><th className="num">Cached</th><th className="num">Output</th><th className="num">Seconds</th><th className="num">Cost</th></tr></thead>
            <tbody>
              {agents.map(([name, a]) => (
                <tr key={name}><td>{AGENT_LABEL[name] ?? name}</td><td className="num">{a.calls}</td><td className="num">{a.input.toLocaleString()}</td>
                  <td className="num">{a.cached.toLocaleString()}</td><td className="num">{a.output.toLocaleString()}</td><td className="num">{a.seconds.toFixed(1)}</td>
                  <td className="num">{usd(a.cost_usd, 5)}</td></tr>
              ))}
              <tr className="total-row"><td>Total</td><td className="num">{agents.reduce((s, [, a]) => s + a.calls, 0)}</td>
                <td className="num">{agents.reduce((s, [, a]) => s + a.input, 0).toLocaleString()}</td>
                <td className="num">{agents.reduce((s, [, a]) => s + a.cached, 0).toLocaleString()}</td>
                <td className="num">{agents.reduce((s, [, a]) => s + a.output, 0).toLocaleString()}</td>
                <td className="num">{agents.reduce((s, [, a]) => s + a.seconds, 0).toFixed(1)}</td><td className="num">{usd(detail.cost_usd, 5)}</td></tr>
            </tbody>
          </table>
          <div className="outputs">
            {Object.entries(detail.outputs).filter(([, v]) => v != null).map(([name, v]) => (
              <details key={name}>
                <summary>{OUTPUT_LABEL[name] ?? name}: full output</summary>
                <pre>{typeof v === 'string' ? v : JSON.stringify(v, null, 2)}</pre>
              </details>
            ))}
            {Object.keys(detail.outputs).length === 0 && <p className="muted small">No stored output for this run.</p>}
          </div>
        </>
      )}
    </section>
  )
}

function SafetyLog({ groups }: { groups: SafetyGroup[] }) {
  const [demo, setDemo] = useState<SafetyDemo | null>(null)
  const runDemo = async () => setDemo(await api.safetyDemo(demo ? demo.n + 1 : 0))
  const total = groups.reduce((s, g) => s + g.count, 0)
  return (
    <section className="card hood-section" data-highlight="safety_log">
      <div className="card-head">
        <div><h2>Safety log</h2><div className="card-sub">{total} events in {groups.length} runs, newest first</div></div>
        <button className="btn" onClick={runDemo}>{demo ? 'Next attack' : 'Run safety demo'}</button>
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

      {groups.length === 0 ? <p className="muted">Nothing blocked yet.</p> : groups.map((g) => (
        <details key={`${g.key}-${g.start}`} className="safety-group">
          <summary><strong>{g.label}</strong> <span className="muted small">{when(g.start)} · {g.count} event{g.count === 1 ? '' : 's'}</span></summary>
          <table className="data">
            <thead><tr><th>Time</th><th>Layer</th><th>What</th><th>Where</th><th>Detail</th><th>Action</th></tr></thead>
            <tbody>
              {g.events.map((e, i) => (
                <tr key={i}><td>{e.time.slice(11, 19)}</td><td><span className={`chip layer-${e.layer}`}>{e.layer}</span></td>
                  <td>{e.kind.replace(/_/g, ' ')}</td><td>{e.source}</td><td>{e.detail}</td><td>{e.action}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </section>
  )
}
