// Live council state, driven by the SSE events the backend sends. Shared by the Debate step
// (org chart + feed) and the Plan step. Scripted voice-pack lines fill in until live lines arrive.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type CouncilBody, streamCouncil } from './api'
import type { CouncilEvent, PlanView, Persona, Voices } from './types'
import { eventVars, quoteText, renderQuotes, scriptedLine } from './voices'

export type NodeStatus = 'idle' | 'waiting' | 'thinking' | 'done' | 'veto' | 'veto_resolved' | 'approved' | 'pass' | 'fail' | 'stopped'
export type EdgeState = 'idle' | 'active' | 'returning' | 'done' | 'veto' | 'approved'

export interface NodeState {
  status: NodeStatus
  line: string | null
  live: boolean
  cost: number
  tokens: number
  calls: number
  why: string[]
  key: string | null
}

export interface FeedItem { persona: Persona; text: string; live: boolean; t: number; round: number }

export const SPECIALISTS: Persona[] = ['wallbreaker', 'taper', 'kickstarter', 'guru']
const ALL: Persona[] = ['monk', 'wallbreaker', 'taper', 'kickstarter', 'guru', 'whisperer', 'marshal']

const blank = (): NodeState => ({ status: 'idle', line: null, live: false, cost: 0, tokens: 0, calls: 0, why: [], key: null })
const fresh = () => Object.fromEntries(ALL.map((p) => [p, blank()])) as Record<Persona, NodeState>
const freshEdges = () => Object.fromEntries(SPECIALISTS.map((p) => [p, 'idle'])) as Record<Persona, EdgeState>

/** A "Why?" bullet: the first clause of the source text, at most 20 words, no ellipsis. */
export function words20(s: unknown): string {
  const text = String(s ?? '').replace(/\s+/g, ' ').trim()
  const w = text.split(' ')
  if (w.length <= 20) return text
  const head = w.slice(0, 20).join(' ')
  const cut = Math.max(head.lastIndexOf(';'), head.lastIndexOf(','), head.lastIndexOf(' ('), head.lastIndexOf(':'))
  return (cut > 30 ? head.slice(0, cut) : head).replace(/[,;:\s]+$/, '')
}
const sentences = (s: unknown) => String(s ?? '').split(/(?<=[.!?;])\s+/).filter(Boolean)

export interface CouncilState {
  nodes: Record<Persona, NodeState>
  edges: Record<Persona, EdgeState>
  pulse: Record<Persona, number>          // bump to replay the travelling dot on that line
  pulseDir: Record<Persona, 'down' | 'up'>
  vetoArrow: boolean
  marshalFlash: number
  round: number
  feed: FeedItem[]
  running: boolean
  error: string | null
  total: number
  result: PlanView | null
  quote: string | null
  stoppedByBudget: boolean
  startedAt: number                     // ms, while running
}

export function useCouncil(voices: Voices | null, onPlan: (p: PlanView) => void, onSpend: () => void) {
  const [nodes, setNodes] = useState(fresh)
  const [edges, setEdges] = useState(freshEdges)
  const [pulse, setPulse] = useState<Record<Persona, number>>({} as Record<Persona, number>)
  const [pulseDir, setPulseDir] = useState<Record<Persona, 'down' | 'up'>>({} as Record<Persona, 'down' | 'up'>)
  const [vetoArrow, setVetoArrow] = useState(false)
  const [marshalFlash, setMarshalFlash] = useState(0)
  const [round, setRound] = useState(0)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [result, setResult] = useState<PlanView | null>(null)
  const [quote, setQuote] = useState<string | null>(null)
  const [stoppedByBudget, setStopped] = useState(false)
  const [startedAt, setStartedAt] = useState(0)
  const vars = useRef<Record<string, unknown>>({})
  const roundRef = useRef(0)
  const abort = useRef<AbortController | null>(null)
  const voicesRef = useRef(voices)
  voicesRef.current = voices

  useEffect(() => () => abort.current?.abort(), [])

  const update = (id: Persona, patch: Partial<NodeState> | ((n: NodeState) => Partial<NodeState>)) =>
    setNodes((old) => ({ ...old, [id]: { ...old[id], ...(typeof patch === 'function' ? patch(old[id]) : patch) } }))
  const edge = (id: Persona, s: EdgeState, dot?: 'down' | 'up') => {
    setEdges((old) => ({ ...old, [id]: s }))
    if (dot) {
      setPulse((old) => ({ ...old, [id]: (old[id] ?? 0) + 1 }))
      setPulseDir((old) => ({ ...old, [id]: dot }))
    }
  }
  const say = (id: Persona, text: string | null | undefined, live: boolean, t: number) => {
    if (!text) return
    const shown = renderQuotes(voicesRef.current, text)
    setFeed((f) => [...f, { persona: id, text: shown, live, t, round: roundRef.current }])
    update(id, (n) => (n.live && !live ? {} : { line: shown, live }))
  }

  const handle = useCallback((e: CouncilEvent) => {
    const v = voicesRef.current
    const ev = eventVars(vars.current, e)
    const scripted = (who: Persona = e.persona) => scriptedLine(v, who, e.type, ev)
    const vv = (e.vars ?? {}) as Record<string, unknown>
    switch (e.type) {
      case 'run_started':
        vars.current = { ...(e.vars ?? {}) }
        roundRef.current = 0
        setRound(0)
        update('monk', { status: 'thinking' })
        SPECIALISTS.forEach((p) => update(p, { status: 'waiting' }))
        update('whisperer', { status: 'done' })
        say('monk', scriptedLine(v, 'monk', 'agent_started', vars.current), false, e.t_ms)
        break
      case 'goal_check':
        say('monk', scripted('monk'), false, e.t_ms)
        update('monk', { key: `Goal ${vv.goal_time} · data says ${vv.predicted_time}` })
        break
      case 'agent_started':
        update(e.persona, { status: 'thinking' })
        if (e.persona !== 'monk') say(e.persona, scripted(), false, e.t_ms)
        break
      case 'delegate': {
        const target = e.target as Persona
        if (target === 'wallbreaker') { roundRef.current += 1; setRound(roundRef.current) }
        say('monk', scriptedLine(v, 'monk', 'delegate', ev, target), false, e.t_ms)
        update(target, (n) => ({ status: n.status === 'veto' ? 'veto' : 'thinking' }))
        edge(target, 'active', 'down')
        if (target === 'wallbreaker') setVetoArrow((was) => was)
        break
      }
      case 'veto_reaction':
        say('wallbreaker', scripted('wallbreaker'), false, e.t_ms)
        break
      case 'agent_done': {
        const p = e.persona
        update(p, (n) => ({ status: 'done', ...whyFor(p, e, n) }))
        edge(p, 'returning', 'up')
        setTimeout(() => setEdges((old) => ({ ...old, [p]: old[p] === 'returning' ? 'done' : old[p] })), 900)
        if (p === 'wallbreaker') {
          setVetoArrow(false)
          setNodes((old) => old.taper.status === 'veto' ? { ...old, taper: { ...old.taper, status: 'veto_resolved' } } : old)
        }
        say(p, e.voice_line ?? scripted(), !!e.voice_line, e.t_ms)
        break
      }
      case 'physio_veto':
      case 'approve': {
        const veto = e.type === 'physio_veto'
        const triggers = (e.triggers as string[]) ?? []
        update('taper', {
          status: veto ? 'veto' : 'approved',
          why: (triggers.length ? triggers : (e.fixes as string[]) ?? []).slice(0, 3).map(words20),
          key: veto ? words20(triggers[0] ?? 'Veto') : 'Approved',
        })
        edge('taper', veto ? 'veto' : 'approved', 'up')
        if (veto) setVetoArrow(true)
        say('taper', e.voice_line ?? scripted('taper'), !!e.voice_line, e.t_ms)
        break
      }
      case 'checker_pass':
      case 'checker_fail': {
        const vio = (e.violations as { rule: string; week: number | null; detail: string }[]) ?? []
        update('marshal', {
          status: e.type === 'checker_pass' ? 'pass' : 'fail',
          why: vio.slice(0, 3).map((x) => words20(`${x.rule.replace(/_/g, ' ')}: ${x.detail}`)),
          key: e.type === 'checker_pass' ? 'Every rule holds' : `${vio.length} rule${vio.length === 1 ? '' : 's'} broken${vio[0]?.week ? ` (week ${vio[0].week})` : ''}`,
        })
        if (e.type === 'checker_fail') setMarshalFlash((n) => n + 1)
        say('marshal', e.type === 'checker_pass' ? 'Every hard rule holds. Stay on the course.'
          : `${vio.length} rule${vio.length === 1 ? '' : 's'} broken. Back to the drawing board.`, false, e.t_ms)
        break
      }
      case 'fix': {
        const changes = (e.changes as string[]) ?? []
        update('marshal', (n) => ({ status: e.passed ? 'pass' : 'fail', why: changes.slice(0, 3).map(words20), key: `Safest version: ${changes.length} fix${changes.length === 1 ? '' : 'es'}` || n.key }))
        say('marshal', `Safest version: ${changes.length} fix${changes.length === 1 ? '' : 'es'} in code. ${e.passed ? 'Every rule holds now.' : 'Check the warnings.'}`, false, e.t_ms)
        break
      }
      case 'spend':
        update(e.persona, (n) => ({ cost: n.cost + (e.cost_usd as number), tokens: n.tokens + (e.tokens as number), calls: n.calls + (e.calls as number) }))
        setTotal(e.run_total_usd as number)
        onSpend()
        break
      case 'ruling':
        update('monk', (n) => ({ status: 'done', why: [...sentences(e.ruling).slice(0, 2), ...sentences(e.goal_note).slice(0, 1)].map(words20), key: n.key }))
        say('monk', e.voice_line as string, true, e.t_ms)
        break
      case 'budget_stop':
        update('marshal', { status: 'stopped', key: `Budget cap ${String(vv.budget ?? '')}`, why: [`Stopped at ${String(vv.cost ?? '')}: the run cap was reached.`] })
        setStopped(true)
        say('marshal', scripted('marshal') ?? 'Budget cap reached. Race stopped at the aid station.', false, e.t_ms)
        break
      case 'error':
        say('marshal', 'The run failed. Try again in a minute.', false, e.t_ms)
        break
      case 'plan_ready': {
        const pv = e.plan_view as PlanView
        setResult(pv)
        onPlan(pv)
        break
      }
      case 'done': {
        setRunning(false)
        SPECIALISTS.forEach((p) => update(p, (n) => (n.status === 'thinking' || n.status === 'waiting' ? { status: 'idle' } : {})))
        if (v?.quote_card_pool.length) {
          const id = v.quote_card_pool[Math.floor(Math.random() * v.quote_card_pool.length)]
          const q = v.quotes.find((x) => x.id === id)
          if (q) setQuote(`${quoteText(v, id)} — ${q.author}`)
        }
        break
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPlan, onSpend])

  const reset = () => {
    setNodes(fresh()); setEdges(freshEdges()); setFeed([]); setResult(null); setError(null); setTotal(0)
    setQuote(null); setVetoArrow(false); setRound(0); setStopped(false); roundRef.current = 0
  }

  const start = useCallback(async (body: CouncilBody) => {
    reset()
    setRunning(true)
    setStartedAt(Date.now())
    abort.current = new AbortController()
    try {
      await streamCouncil(body, handle, abort.current.signal)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
      abort.current = null
      onSpend()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, onSpend])

  /** Replay the last run's events at no token cost: instantly (after a reload) or animated, squeezed into about 20 s. */
  const timers = useRef<number[]>([])
  const replay = useCallback(async (animated = true) => {
    const { events } = await api.lastCouncil()
    if (!events.length || abort.current) return
    timers.current.forEach(clearTimeout)
    timers.current = []
    reset()
    if (!animated) { events.forEach(handle); return }
    setRunning(true)
    setStartedAt(Date.now())
    const last = Math.max(1, ...events.map((e) => e.t_ms ?? 0))
    const k = Math.min(1, 20000 / last)
    events.forEach((e) => {
      timers.current.push(window.setTimeout(() => handle(e), (e.t_ms ?? 0) * k))
    })
    timers.current.push(window.setTimeout(() => setRunning(false), last * k + 300))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle])

  const state: CouncilState = { nodes, edges, pulse, pulseDir, vetoArrow, marshalFlash, round, feed, running, error, total, result, quote, stoppedByBudget, startedAt }
  return { state, start, replay }
}

function whyFor(p: Persona, e: CouncilEvent, n: NodeState): Partial<NodeState> {
  const vv = (e.vars ?? {}) as Record<string, unknown>
  if (p === 'wallbreaker') {
    return { why: sentences(e.summary).slice(0, 3).map(words20), key: `Peak ${vv.peak_km} km/week · long run up to ${vv.long_run_km} km` }
  }
  if (p === 'guru') {
    const days = (e.days as string[]) ?? []
    const sessions = (e.sessions as { phase: string; focus: string }[]) ?? []
    return { why: [`Gym on ${days.join(' and ')}, never the day before a hard run`, ...sessions.slice(0, 2).map((s) => words20(`${s.phase}: ${s.focus}`))], key: `Gym: ${days.join(' & ')}` }
  }
  if (p === 'kickstarter') {
    const w = (e.wrist_card ?? {}) as { strategy?: string; fueling?: string[]; splits?: { segment: string; pace: string }[] }
    return { why: [words20(w.strategy), ...(w.fueling ?? []).slice(0, 1).map(words20), w.splits?.[0] ? `Start ${w.splits[0].segment} at ${w.splits[0].pace}` : ''].filter(Boolean),
      key: `Goal ${vv.goal_time ?? ''}`.trim() }
  }
  return { why: n.why, key: n.key }
}
