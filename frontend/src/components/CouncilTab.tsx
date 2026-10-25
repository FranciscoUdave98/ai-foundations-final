import { useEffect, useRef, useState } from 'react'
import { api, streamCouncil } from '../api'
import { fmtDay } from '../format'
import type { CouncilEvent, Persona, PhysioReview, PlanView, RaceHit, Split, Voices } from '../types'
import { eventVars, quoteText, renderQuotes, scriptedLine } from '../voices'

interface Props {
  target: RaceHit | null
  voices: Voices | null
  onPlan: (p: PlanView) => void
  onSpend: () => void
  goRaces: () => void
  goPlan: () => void
}

type Status = 'idle' | 'waiting' | 'thinking' | 'done' | 'veto' | 'approved' | 'pass' | 'fail' | 'stopped'

interface Card {
  status: Status
  line: string | null           // latest line (scripted or live)
  live: boolean                 // true once the agent's own voice_line arrived
  cost: number
  tokens: number
  cached: number
  calls: number
  detail: Record<string, unknown>
}

interface FeedItem { persona: Persona; text: string; live: boolean; t: number; kind: string }

const ORDER: Persona[] = ['wallbreaker', 'taper', 'guru', 'kickstarter']
const STATUS_TEXT: Record<Status, string> = {
  idle: 'Waiting', waiting: 'Waiting', thinking: 'Thinking…', done: 'Done', veto: 'VETO', approved: 'Approved',
  pass: 'Checker pass', fail: 'Checker fail', stopped: 'Stopped',
}

const blank = (): Card => ({ status: 'idle', line: null, live: false, cost: 0, tokens: 0, cached: 0, calls: 0, detail: {} })
const initialCards = (): Record<Persona, Card> => ({
  monk: blank(), wallbreaker: blank(), taper: blank(), guru: blank(), kickstarter: blank(), whisperer: blank(), marshal: blank(),
})

export function CouncilTab({ target, voices, onPlan, onSpend, goRaces, goPlan }: Props) {
  const [goal, setGoal] = useState('')
  const [mode, setMode] = useState<'lean' | 'full'>('lean')
  const [distKm, setDistKm] = useState<number | null>(null)
  const [cards, setCards] = useState(initialCards)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PlanView | null>(null)
  const [total, setTotal] = useState(0)
  const [quote, setQuote] = useState<string | null>(null)
  const vars = useRef<Record<string, unknown>>({})
  const abort = useRef<AbortController | null>(null)
  const feedBox = useRef<HTMLElement>(null)

  useEffect(() => () => abort.current?.abort(), [])
  // Reopening the tab (or reloading the page) replays the last run instantly, at no token cost.
  const replayed = useRef(false)
  useEffect(() => {
    if (!voices || replayed.current) return
    replayed.current = true
    api.lastCouncil().then(({ events }) => { if (events.length && !abort.current) events.forEach(handle) }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voices])
  // Keep the newest line in view by scrolling the feed box only (never the whole page).
  useEffect(() => { const el = feedBox.current; if (el) el.scrollTop = el.scrollHeight }, [feed])

  const persona = (id: Persona) => voices?.personas.find((p) => p.id === id)

  function update(id: Persona, patch: Partial<Card> | ((c: Card) => Partial<Card>)) {
    setCards((old) => ({ ...old, [id]: { ...old[id], ...(typeof patch === 'function' ? patch(old[id]) : patch) } }))
  }
  function say(id: Persona, text: string | null | undefined, live: boolean, kind: string, t: number) {
    if (!text) return
    const shown = renderQuotes(voices, text)
    setFeed((f) => [...f, { persona: id, text: shown, live, t, kind }])
    update(id, (c) => (c.live && !live ? {} : { line: shown, live }))
  }

  function handle(e: CouncilEvent) {
    const v = eventVars(vars.current, e)
    const scripted = (who: Persona = e.persona) => scriptedLine(voices, who, e.type, v)
    switch (e.type) {
      case 'run_started':
        vars.current = { ...(e.vars ?? {}) }
        update('monk', { status: 'thinking' })
        ORDER.forEach((p) => update(p, { status: 'waiting' }))
        say('monk', scriptedLine(voices, 'monk', 'agent_started', vars.current), false, e.type, e.t_ms)
        break
      case 'goal_check':
        say('monk', scripted('monk'), false, e.type, e.t_ms)
        break
      case 'agent_started':
        update(e.persona, { status: 'thinking' })
        if (e.persona !== 'monk') say(e.persona, scripted(), false, e.type, e.t_ms)
        break
      case 'agent_thinking':
        if (e.persona === 'monk') update('monk', (c) => ({ detail: { ...c.detail, tools: [...((c.detail.tools as string[]) ?? []), ...((e.tools as string[]) ?? [])] } }))
        break
      case 'delegate':
        say('monk', scriptedLine(voices, 'monk', 'delegate', v, e.target as Persona), false, e.type, e.t_ms)
        update(e.target as Persona, { status: 'thinking' })
        break
      case 'veto_reaction':
        say('wallbreaker', scripted('wallbreaker'), false, e.type, e.t_ms)
        break
      case 'agent_done':
        update(e.persona, (c) => ({ status: 'done', detail: { ...c.detail, ...e } }))
        say(e.persona, e.voice_line ?? scripted(), !!e.voice_line, e.type, e.t_ms)
        break
      case 'physio_veto':
      case 'approve':
        update('taper', (c) => ({
          status: e.type === 'physio_veto' ? 'veto' : 'approved',
          detail: { ...c.detail, reviews: [...((c.detail.reviews as PhysioReview[]) ?? []), { decision: e.decision, triggers: e.triggers, fixes: e.fixes, voice_line: e.voice_line } as PhysioReview] },
        }))
        say('taper', e.voice_line ?? scripted('taper'), !!e.voice_line, e.type, e.t_ms)
        break
      case 'checker_pass':
      case 'checker_fail':
        update('marshal', (c) => ({ status: e.type === 'checker_pass' ? 'pass' : 'fail', detail: { ...c.detail, violations: e.violations } }))
        say('marshal', e.type === 'checker_pass' ? 'Plan checker: every hard rule holds. Stay on the course.'
          : `Plan checker: ${(e.violations as unknown[]).length} rule(s) broken. Back to the drawing board.`, false, e.type, e.t_ms)
        break
      case 'fix': {
        // Code repaired the plan: report the real changes (a scripted line could name the wrong fix).
        const changes = (e.changes as string[]) ?? []
        update('marshal', (c) => ({ status: e.passed ? 'pass' : 'fail', detail: { ...c.detail, changes } }))
        say('marshal', `Safest version applied${changes.length ? `: ${changes.slice(0, 2).join('; ')}${changes.length > 2 ? '…' : ''}` : ''}. ${e.passed ? 'Every rule holds now.' : ''}`,
          false, e.type, e.t_ms)
        break
      }
      case 'spend':
        update(e.persona, (c) => ({
          cost: c.cost + (e.cost_usd as number), tokens: c.tokens + (e.tokens as number),
          cached: c.cached + (e.cached as number), calls: c.calls + (e.calls as number),
        }))
        setTotal(e.run_total_usd as number)
        onSpend()
        break
      case 'ruling':
        update('monk', (c) => ({ status: 'done', detail: { ...c.detail, ruling: e.ruling, goal_note: e.goal_note, message: e.message } }))
        say('monk', e.voice_line as string, true, e.type, e.t_ms)
        break
      case 'budget_stop':
        update('marshal', { status: 'stopped', detail: { stop: e } })
        say('marshal', scripted('marshal') ?? 'Budget cap reached. Race stopped at the aid station.', false, e.type, e.t_ms)
        break
      case 'error':
        update('marshal', (c) => ({ detail: { ...c.detail, error: e.message } }))
        say('marshal', `Something went wrong: ${String(e.message).slice(0, 120)}`, false, e.type, e.t_ms)
        break
      case 'plan_ready': {
        const pv = e.plan_view as PlanView
        setResult(pv)
        onPlan(pv)
        break
      }
      case 'done': {
        setRunning(false)
        ORDER.forEach((p) => update(p, (c) => (c.status === 'thinking' || c.status === 'waiting' ? { status: 'idle' } : {})))
        if (voices?.quote_card_pool.length) {
          const id = voices.quote_card_pool[Math.floor(Math.random() * voices.quote_card_pool.length)]
          const q = voices.quotes.find((x) => x.id === id)
          if (q) setQuote(`${quoteText(voices, id)} — ${q.author}`)
        }
        break
      }
    }
  }

  async function convene() {
    setCards(initialCards())
    setFeed([])
    setResult(null)
    setError(null)
    setTotal(0)
    setQuote(null)
    setRunning(true)
    abort.current = new AbortController()
    try {
      await streamCouncil({ goal_time: goal.trim() || null, mode, distance_km: distKm ?? target?.target_km ?? null }, handle, abort.current.signal)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
      onSpend()
    }
  }

  if (!target) {
    return (
      <div className="card soon">
        <span className="badge">Coaching Council</span>
        <h2>Pick a race first</h2>
        <p>The council builds a plan toward one race. Find one and click “Train for this”.</p>
        <button className="btn btn-primary" onClick={goRaces}>Open Race Finder</button>
      </div>
    )
  }

  const monk = cards.monk
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Coaching Council</h1>
          <p>Five coaches build your plan for <strong>{target.name}</strong> ({fmtDay(target.date, true)}, {target.weeks_until} weeks away). Watch them work.</p>
        </div>
      </div>

      <div className="card council-form">
        {target.distance_km.length > 1 && (
          <label>Distance
            <select value={distKm ?? target.target_km ?? ''} onChange={(e) => setDistKm(Number(e.target.value))} disabled={running}>
              {target.distance_km.map((km, i) => <option key={km} value={km}>{target.distances[i] ?? `${km} km`}</option>)}
            </select>
          </label>
        )}
        <label>Goal time <span className="muted">(optional)</span>
          <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. 1:30:00" maxLength={10} disabled={running} />
        </label>
        <label>Context sent to agents
          <select value={mode} onChange={(e) => setMode(e.target.value as 'lean' | 'full')} disabled={running}>
            <option value="lean">Lean: profile summary (default)</option>
            <option value="full">Full: + 90 days of raw runs (A/B test)</option>
          </select>
        </label>
        <button className="btn btn-primary btn-big" onClick={convene} disabled={running}>
          {running ? 'Council in session…' : result ? 'Convene again' : 'Convene the council'}
        </button>
        <div className="council-meter" title="Real token cost of this run so far">
          <span>This run</span><strong>${total.toFixed(5)}</strong>
        </div>
      </div>

      {error && <div className="error" role="alert" style={{ marginTop: 12 }}>{error}</div>}

      <div className="council-layout">
        <div className="council-cards">
          <AgentCard id="monk" card={monk} meta={persona('monk')} wide>
            {Boolean(monk.detail.tools) && <p className="tools">Called: {(monk.detail.tools as string[]).join(' → ')}</p>}
            {Boolean(monk.detail.ruling) && <p><strong>Ruling:</strong> {String(monk.detail.ruling)}</p>}
            {Boolean(monk.detail.goal_note) && <p><strong>Goal:</strong> {String(monk.detail.goal_note)}</p>}
          </AgentCard>
          <div className="council-grid">
            {ORDER.map((id) => (
              <AgentCard key={id} id={id} card={cards[id]} meta={persona(id)}>
                <Detail id={id} card={cards[id]} />
              </AgentCard>
            ))}
          </div>
          <AgentCard id="marshal" card={cards.marshal} meta={persona('marshal')} wide code>
            <MarshalDetail card={cards.marshal} />
          </AgentCard>
        </div>

        <aside ref={feedBox} className="card feed" aria-label="Council debate feed" aria-live="polite">
          <h2>The debate</h2>
          {feed.length === 0 && <p className="muted">{running ? (voices?.loading[0] ?? 'Lacing up the agents…') : 'Press “Convene the council” to start.'}</p>}
          {feed.map((f, i) => (
            <div key={i} className={`feed-item${f.live ? ' live' : ''}`}>
              <span className="feed-who" aria-hidden="true">{persona(f.persona)?.emoji ?? '•'}</span>
              <div>
                <div className="feed-name">{persona(f.persona)?.name ?? f.persona} <span className="muted">{(f.t / 1000).toFixed(0)}s</span></div>
                <div>{f.text}</div>
              </div>
            </div>
          ))}
        </aside>
      </div>

      {result && (
        <section className="card ruling-box">
          <div className="ruling-head">
            <span className="ruling-emoji" aria-hidden="true">{persona('monk')?.emoji}</span>
            <div>
              <h2>The Head Coach rules</h2>
              <p className="muted">{result.plan.weeks.length} weeks · checker {result.check.passed ? 'passed ✓' : 'failed ✕'}
                {result.safest_version_used ? ' · safest version used' : ''} · ${result.receipt?.total_cost_usd.toFixed(5)} · {result.receipt?.seconds.toFixed(0)}s</p>
            </div>
            <button className="btn btn-primary" onClick={goPlan}>Open My Plan →</button>
          </div>
          {result.ruling ? <p className="ruling-msg">{renderQuotes(voices, result.ruling.message)}</p>
            : <p className="ruling-msg">{result.stopped_by_budget ? 'The budget cap stopped the council early. Here is the safest version of what it finished.' : 'The council finished without a final ruling. Here is the safest version of its draft.'}</p>}
          {quote && <blockquote className="quote-card">Quote of the run: {quote}</blockquote>}
        </section>
      )}
    </div>
  )
}

function AgentCard({ id, card, meta, wide, code, children }: {
  id: Persona; card: Card; meta?: { name: string; role: string; emoji: string; catchphrase: string }
  wide?: boolean; code?: boolean; children?: React.ReactNode
}) {
  return (
    <article className={`card agent-card status-${card.status}${wide ? ' wide' : ''}`} data-persona={id}>
      <div className="agent-head">
        <span className="agent-emoji" aria-hidden="true">{meta?.emoji}</span>
        <div className="agent-title">
          <h3>{meta?.name ?? id}</h3>
          <span>{meta?.role}{code ? '' : ' · gpt-6-luna'}</span>
        </div>
        <span className={`pill pill-${card.status}`}>{STATUS_TEXT[card.status]}</span>
      </div>
      <p className={`agent-line${card.live ? ' live' : ''}`}>{card.line ?? meta?.catchphrase ?? ''}</p>
      {(card.calls > 0) && (
        <div className="agent-cost">{card.calls} call{card.calls === 1 ? '' : 's'} · {card.tokens.toLocaleString()} tokens
          {card.cached ? ` (${card.cached.toLocaleString()} cached)` : ''} · ${card.cost.toFixed(5)}</div>
      )}
      {children && <details className="agent-detail" open={card.status === 'veto' || card.status === 'fail'}><summary>Details</summary>{children}</details>}
    </article>
  )
}

function Detail({ id, card }: { id: Persona; card: Card }) {
  const d = card.detail
  if (id === 'wallbreaker' && d.table) {
    return (<><p>{String(d.summary ?? '')}</p>{Number(d.revision) > 0 && <p className="muted">Revision {String(d.revision)}</p>}<pre className="table-pre">{String(d.table)}</pre></>)
  }
  if (id === 'taper' && d.reviews) {
    return (<>{(d.reviews as PhysioReview[]).map((r, i) => (
      <div key={i} className="review">
        <strong>Review {i + 1}: {r.decision === 'veto' ? 'VETO' : 'approved'}</strong>
        {r.triggers?.length > 0 && <ul>{r.triggers.map((t) => <li key={t}>{t}</li>)}</ul>}
        {r.fixes?.length > 0 && <><em>Fixes</em><ul>{r.fixes.map((t) => <li key={t}>{t}</li>)}</ul></>}
      </div>))}</>)
  }
  if (id === 'guru' && d.days) {
    return (<><p><strong>Gym days:</strong> {(d.days as string[]).join(', ')}</p><p>{String(d.mobility ?? '')}</p></>)
  }
  if (id === 'kickstarter' && d.wrist_card) {
    const w = d.wrist_card as { strategy: string; splits: Split[] }
    return (<><p>{w.strategy}</p><table className="data"><tbody>{w.splits.map((s) => <tr key={s.segment}><td>{s.segment}</td><td className="num">{s.pace}</td><td>{s.note}</td></tr>)}</tbody></table></>)
  }
  return null
}

function MarshalDetail({ card }: { card: Card }) {
  const d = card.detail
  const violations = (d.violations as { rule: string; week: number | null; detail: string }[] | undefined) ?? []
  const changes = (d.changes as string[] | undefined) ?? []
  return (
    <>
      <p className="muted">Plain code: Guardian, plan checker and budget controller. Not an AI.</p>
      {violations.length > 0 && <ul>{violations.map((v, i) => <li key={i}><code>{v.rule}</code> week {v.week}: {v.detail}</li>)}</ul>}
      {changes.length > 0 && <><strong>Safest version applied:</strong><ul>{changes.map((c) => <li key={c}>{c}</li>)}</ul></>}
      {Boolean(d.stop) && <p><strong>Budget stop:</strong> {JSON.stringify((d.stop as { vars?: unknown }).vars)}</p>}
      {Boolean(d.error) && <p className="error">{String(d.error)}</p>}
    </>
  )
}
