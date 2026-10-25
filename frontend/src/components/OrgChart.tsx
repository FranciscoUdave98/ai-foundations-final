import { ShieldCheck, Undo2, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AGENTS, AgentIcon } from '../agents'
import type { Persona, Voices } from '../types'
import { money } from '../ui'
import { type CouncilState, type NodeStatus, SPECIALISTS } from '../useCouncil'

const STATUS_TEXT: Partial<Record<NodeStatus, string>> = {
  idle: 'waiting', waiting: 'waiting', thinking: 'working…', done: 'done', veto: 'had concerns', veto_resolved: 'fixed',
  approved: 'approved', pass: 'all rules pass', fail: 'found problems', stopped: 'stopped',
}

interface Pt { x: number; y: number }
interface Geo { w: number; h: number; monk: Pt; tops: Record<string, Pt>; taperL: Pt; wallR: Pt }

/** The council as an org chart: the Monk on top, four specialists below, two side nodes under them. */
export function OrgChart({ s, voices, whisperer, openAgent, onOpened }: {
  s: CouncilState
  voices: Voices | null
  whisperer: { line: string | null; calls: number; cost: number; top: string | null }
  openAgent: Persona | null
  onOpened: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const refs = useRef<Record<string, HTMLDivElement | null>>({})
  const [geo, setGeo] = useState<Geo | null>(null)
  const [why, setWhy] = useState<Persona | null>(null)
  void voices

  const measure = useCallback(() => {
    const b = box.current?.getBoundingClientRect()
    const m = refs.current.monk?.getBoundingClientRect()
    if (!b || !m) return
    const rel = (r: DOMRect, fx: number, fy: number): Pt => ({ x: r.left - b.left + r.width * fx, y: r.top - b.top + r.height * fy })
    const tops: Record<string, Pt> = {}
    for (const id of SPECIALISTS) {
      const r = refs.current[id]?.getBoundingClientRect()
      if (r) tops[id] = rel(r, 0.5, 0)
    }
    const t = refs.current.taper?.getBoundingClientRect()
    const w = refs.current.wallbreaker?.getBoundingClientRect()
    setGeo({ w: b.width, h: b.height, monk: rel(m, 0.5, 1), tops,
      taperL: t ? rel(t, 0, 0.78) : { x: 0, y: 0 }, wallR: w ? rel(w, 1, 0.78) : { x: 0, y: 0 } })
  }, [])

  useLayoutEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [measure])
  useEffect(() => { measure() }, [s.nodes, measure])

  // The coach chat can open an agent's "Why?" popover.
  useEffect(() => {
    if (!openAgent) return
    setWhy(openAgent)
    refs.current[openAgent]?.scrollIntoView({ block: 'center' })
    onOpened()
  }, [openAgent, onOpened])

  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setWhy(null) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])

  const path = (a: Pt, b: Pt) => {
    const my = (a.y + b.y) / 2
    return `M ${a.x} ${a.y} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`
  }

  const node = (id: Persona, extra?: { line?: string | null; calls?: number; cost?: number; tag?: string; side?: boolean }) => {
    const n = s.nodes[id]
    const ag = AGENTS[id]
    // Before any run: each coach's job in plain words and "waiting", so the team reads at a glance.
    const idle = !s.running && s.feed.length === 0
    const line = idle ? ag.job : extra?.line ?? n.line
    const calls = extra?.calls ?? n.calls
    const cost = extra?.cost ?? n.cost
    // A run that never finished (stopped, or a reload mid-run) must not look like it's still working.
    const status: NodeStatus = id === 'whisperer' ? (calls ? 'done' : 'waiting') : idle ? 'waiting' : !s.running && n.status === 'thinking' ? 'stopped' : n.status
    const latest = !idle && s.feed.length > 0 && s.feed[s.feed.length - 1].persona === id
    return (
      <div key={id === 'marshal' ? `marshal-${s.marshalFlash}` : id} ref={(el) => { refs.current[id] = el }}
        style={{ '--agent': `var(--agent-${id})` } as React.CSSProperties}
        className={`org-node status-${status}${latest ? ' latest' : ''}${extra?.side ? ' side' : ''}${id === 'marshal' && s.marshalFlash ? ' flash-amber' : ''}`} data-agent={id}>
        <button className="org-head" onClick={() => setWhy(why === id ? null : id)} aria-expanded={why === id} aria-label={`${ag.title}: why?`}>
          <AgentIcon id={id} />
          <span className="org-id">
            <strong>{ag.title}</strong>
            <span className="org-role">{ag.nick}{extra?.tag ? ` · ${extra.tag}` : ''}
              <span className={`st st-${status}`}>{STATUS_TEXT[status] ?? status}</span></span>
          </span>
        </button>
        {line && <p className="org-bubble">{line}</p>}
        {calls > 0 && <span className="org-cost">{money(cost)} · {calls} call{calls === 1 ? '' : 's'}</span>}
        {status === 'veto' && s.running && <span className="veto-stamp" aria-hidden="true">NO</span>}
        {status === 'veto' && s.running && <span className="veto-back"><Undo2 size={14} aria-hidden="true" /> Sent back</span>}
        {status === 'veto' && !s.running && <span className="veto-done"><ShieldCheck size={14} aria-hidden="true" /> Safest version used: every rule passes</span>}
        {why === id && <WhyPopover id={id} s={s} top={whisperer.top} onClose={() => setWhy(null)} name={ag.title} />}
      </div>
    )
  }

  return (
    <div className="org" ref={box}>
      {geo && (
        <svg className="org-lines" width={geo.w} height={geo.h} aria-hidden="true">
          <defs>
            <marker id="arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: 'var(--critical)' }} />
            </marker>
          </defs>
          {SPECIALISTS.map((id) => geo.tops[id] && (
            <path key={id} d={path(geo.monk, geo.tops[id])} className={`edge edge-${s.edges[id]}`} style={{ '--agent': `var(--agent-${id})` } as React.CSSProperties} />
          ))}
        </svg>
      )}
      {geo && s.running && SPECIALISTS.map((id) => geo.tops[id] && s.pulse[id] ? (
        <span key={`${id}-${s.pulse[id]}`} className={`org-dot dot-${s.pulseDir[id]}${s.edges[id] === 'veto' ? ' red' : ''}`}
          style={{ offsetPath: `path('${path(geo.monk, geo.tops[id])}')` }} aria-hidden="true" />
      ) : null)}
      {/* Top row: the Whisperer (already ran in Race) and the Marshal (code) flank the Monk as dashed side nodes. */}
      <div className="org-top">
        {node('whisperer', { line: whisperer.line, calls: whisperer.calls, cost: whisperer.cost, tag: 'step 2', side: true })}
        {node('monk')}
        {node('marshal', { tag: 'code', side: true })}
      </div>
      <div className="org-row">{SPECIALISTS.map((id) => node(id))}</div>
    </div>
  )
}

function WhyPopover({ id, s, top, onClose, name }: { id: Persona; s: CouncilState; top: string | null; onClose: () => void; name: string }) {
  const n = s.nodes[id]
  const bullets = id === 'whisperer'
    ? [top ? `Top pick: ${top}` : 'Picked races from the listings', 'Read race text as untrusted data', 'Guardian cleaned every listing first']
    : n.why.length ? n.why : ['Nothing to explain yet: this agent has not run.']
  return (
    <div className="why-pop" role="dialog" aria-label={`Why: ${name}`}>
      <div className="why-head"><strong>{name}: why?</strong><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={14} /></button></div>
      {n.key && <div className="why-key">{n.key}</div>}
      <ul>{[...new Set(bullets)].slice(0, 3).map((b) => <li key={b}>{b}</li>)}</ul>
      <span className="caption">Every word each coach wrote: Cost &amp; Safety tab → run inspector</span>
    </div>
  )
}
