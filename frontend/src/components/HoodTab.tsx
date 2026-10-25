import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import type { BudgetStatus, PlanView, ReceiptsSummary, SafetyLog } from '../types'

const AGENT_LABEL: Record<string, string> = {
  head_coach: '🧘 Head Coach', plan_builder: '🪖 Plan Builder', physio: '🩺 Physio', strength: '🏋️ Strength',
  race_day: '⚡ Race-Day', race_scout: '🗺️ Race Scout',
}
const TYPE_LABEL: Record<string, string> = { plan_build: 'Build a plan (full council)', check_in: 'Weekly check-in', race_search: 'Race search' }

export function HoodTab({ view, onSpend }: { view: PlanView | null; onSpend: () => void }) {
  const [receipts, setReceipts] = useState<ReceiptsSummary | null>(null)
  const [budget, setBudget] = useState<BudgetStatus | null>(null)
  const [caps, setCaps] = useState<BudgetStatus['caps'] | null>(null)
  const [safety, setSafety] = useState<SafetyLog | null>(null)
  const [saved, setSaved] = useState('')

  const load = useCallback(() => {
    api.receipts().then(setReceipts).catch(() => {})
    api.budget().then((b) => { setBudget(b); setCaps(b.caps) }).catch(() => {})
    api.safety().then(setSafety).catch(() => {})
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

  const r = view?.receipt
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Under the hood</h1>
          <p>Real token counts for every AI call, the budget caps, and the safety log.</p>
        </div>
        <button className="btn" onClick={load}>Refresh</button>
      </div>

      {r && (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div><h2>Token receipt: last plan build</h2><div className="card-sub">{r.run_id} · {r.mode} context · {r.seconds.toFixed(0)} s</div></div>
            <div className="receipt-total"><strong>${r.total_cost_usd.toFixed(5)}</strong><span className="muted"> gpt-6-astra: ${r.what_if_astra_usd.toFixed(3)}</span></div>
          </div>
          <table className="data">
            <thead><tr><th>Agent</th><th className="num">Calls</th><th className="num">Input</th><th className="num">Cached</th><th className="num">Output</th><th className="num">Seconds</th><th className="num">Cost</th></tr></thead>
            <tbody>
              {r.agents.map((a) => (
                <tr key={a.agent}><td>{AGENT_LABEL[a.agent] ?? a.agent}</td><td className="num">{a.calls}</td>
                  <td className="num">{a.input_tokens.toLocaleString()}</td><td className="num">{a.cached_input_tokens.toLocaleString()}</td>
                  <td className="num">{a.output_tokens.toLocaleString()}</td><td className="num">{a.seconds.toFixed(1)}</td><td className="num">${a.cost_usd.toFixed(5)}</td></tr>
              ))}
              <tr className="total-row"><td>Total</td><td className="num">{r.agents.reduce((s, a) => s + a.calls, 0)}</td>
                <td className="num">{r.agents.reduce((s, a) => s + a.input_tokens, 0).toLocaleString()}</td>
                <td className="num">{r.agents.reduce((s, a) => s + a.cached_input_tokens, 0).toLocaleString()}</td>
                <td className="num">{r.agents.reduce((s, a) => s + a.output_tokens, 0).toLocaleString()}</td><td className="num">{r.seconds.toFixed(0)}</td>
                <td className="num">${r.total_cost_usd.toFixed(5)}</td></tr>
            </tbody>
          </table>
          <p className="card-sub">Prices per 1M tokens (gpt-6-luna): input $0.10, cached $0.01, cache write $0.125, output $0.50. The astra line uses the same token counts at astra prices; astra is never called.</p>
        </section>
      )}

      <div className="row-2b">
        <section className="card">
          <div className="card-head"><h2>Cost per user per month</h2></div>
          {receipts ? (
            <>
              <table className="data">
                <thead><tr><th>Run type</th><th className="num">Measured runs</th><th className="num">Avg cost</th><th className="num">Per month</th></tr></thead>
                <tbody>
                  {Object.entries(receipts.monthly_mix).map(([k, n]) => (
                    <tr key={k}><td>{TYPE_LABEL[k] ?? k}</td><td className="num">{receipts.runs_by_type[k] ?? 0}</td>
                      <td className="num">{receipts.avg_cost_by_type[k] != null ? `$${receipts.avg_cost_by_type[k].toFixed(5)}` : 'not measured yet'}</td>
                      <td className="num">{n}×</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="scale">
                <div><span>1 user / month</span><strong>${receipts.cost_per_user_month.toFixed(4)}</strong></div>
                <div><span>100 users</span><strong>${receipts.scale['100_users'].toFixed(2)}</strong></div>
                <div><span>10,000 users</span><strong>${receipts.scale['10000_users'].toFixed(2)}</strong></div>
              </div>
              <p className="card-sub">Assumes 1 plan build, 4 check-ins and 2 race searches per user per month, priced from the averages of real runs in logs/usage.jsonl.
                {receipts.measured_types.length < 3 && ' Check-ins arrive in Part 5, so they count as $0 until measured.'}</p>
            </>
          ) : <p className="muted">Loading…</p>}
        </section>

        <section className="card">
          <div className="card-head"><h2>Budget caps (USD)</h2>{saved && <span className="muted">{saved}</span>}</div>
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
                <button className="btn" onClick={() => save({ ...caps, per_run_usd: 0.001 })} title="Then convene the council and watch the hard stop">Demo: run cap $0.001</button>
                <button className="btn" onClick={() => save({ per_run_usd: 0.05, per_session_usd: 0.5, per_day_usd: 2, max_requests_per_run: 40 })}>Reset</button>
              </div>
              <p className="card-sub">Spent this session ${budget.spent.session_usd.toFixed(5)} · today ${budget.spent.today_usd.toFixed(5)}. Caps are checked before a run and after every model reply; a hit stops the run with a friendly message and keeps what it finished.</p>
            </>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div><h2>Safety log</h2><div className="card-sub">{safety?.total ?? 0} events · {safety?.trap_calls.length ?? 0} trap tool calls</div></div>
        </div>
        {safety && safety.events.length > 0 ? (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Time</th><th>Layer</th><th>What</th><th>Where</th><th>Detail</th><th>Action</th></tr></thead>
              <tbody>
                {safety.events.map((e, i) => (
                  <tr key={i}><td>{e.time.slice(5, 16).replace('T', ' ')}</td><td><span className={`chip layer-${e.layer}`}>{e.layer}</span></td>
                    <td>{e.kind.replace(/_/g, ' ')}</td><td>{e.source}</td><td>{e.detail}</td><td>{e.action}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">Nothing blocked yet. Try the Safety demo in Race Finder.</p>}
      </section>

      {receipts && receipts.runs.length > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><h2>All AI runs</h2></div>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Time</th><th>Type</th><th>Agents</th><th className="num">Calls</th><th className="num">Tokens</th><th className="num">Cached</th><th className="num">Cost</th></tr></thead>
              <tbody>
                {receipts.runs.map((run) => (
                  <tr key={run.run_id}><td>{run.time.slice(5, 16).replace('T', ' ')}</td><td>{TYPE_LABEL[run.type] ?? run.type}</td>
                    <td>{Object.keys(run.agents).map((a) => AGENT_LABEL[a]?.split(' ')[0] ?? a).join(' ')}</td>
                    <td className="num">{run.calls}</td><td className="num">{run.tokens.toLocaleString()}</td>
                    <td className="num">{run.cached.toLocaleString()}</td><td className="num">${run.cost_usd.toFixed(5)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
