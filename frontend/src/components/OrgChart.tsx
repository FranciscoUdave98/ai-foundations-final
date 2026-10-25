import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Persona, Voices } from '../types'
import { type CouncilState, type NodeStatus, SPECIALISTS } from '../useCouncil'

const STATUS_TEXT: Partial<Record<NodeStatus, string>> = {
  idle: 'waiting', waiting: 'waiting', thinking: 'thinking', done: 'done', veto: 'veto', veto_resolved: 'veto resolved',
  approved: 'approved', pass: 'rules hold', fail: 'rule broken', stopped: 'stopped',
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
  const persona = (id: Persona) => voices?.personas.find((p) => p.id === id)

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
    refs.current[openAgent]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
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
  const vetoPath = geo ? `M ${geo.taperL.x} ${geo.taperL.y} C ${geo.taperL.x - 24} ${geo.taperL.y + 46}, ${geo.wallR.x + 24} ${geo.wallR.y + 46}, ${geo.wallR.x} ${geo.wallR.y}` : ''

  const node = (id: Persona, extra?: { line?: string | null; calls?: number; cost?: number; tag?: string; side?: boolean }) => {
    const n = s.nodes[id]
    const meta = persona(id)
    const line = extra?.line ?? n.line
    const calls = extra?.calls ?? n.calls
    const cost = extra?.cost ?? n.cost
    const status: NodeStatus = id === 'whisperer' ? (calls ? 'done' : 'idle') : n.status
    return (
      <div key={id === 'marshal' ? `marshal-${s.marshalFlash}` : id} ref={(el) => { refs.current[id] = el }}
        className={`org-node status-${status}${extra?.side ? ' side' : ''}${id === 'marshal' && s.marshalFlash ? ' flash-amber' : ''}`} data-agent={id}>
        <button className="org-head" onClick={() => setWhy(why === id ? null : id)} aria-expanded={why === id} aria-label={`${meta?.name}: why?`}>
          <span className="org-avatar" aria-hidden="true">{meta?.emoji}</span>
          <span className="org-id">
            <strong>{meta?.name ?? id}</strong>
            <span>{meta?.role}{extra?.tag ? ` · ${extra.tag}` : ''}</span>
          </span>
          <span className={`pill pill-${status}`}>{STATUS_TEXT[status] ?? status}</span>
        </button>
        {line && <p className="org-bubble">{line}</p>}
        {calls > 0 && <span className="org-cost">{calls} call{calls === 1 ? '' : 's'} · ${cost.toFixed(4)}</span>}
        {status === 'veto' && <span className="veto-stamp" aria-hidden="true">VETO</span>}
        {why === id && <WhyPopover id={id} s={s} top={whisperer.top} onClose={() => setWhy(null)} name={meta?.name ?? id} />}
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
            <path key={id} d={path(geo.monk, geo.tops[id])} className={`edge edge-${s.edges[id]}`} />
          ))}
          {s.vetoArrow && vetoPath && <path d={vetoPath} className="edge-veto-arrow" markerEnd="url(#arrow-red)" />}
        </svg>
      )}
      {geo && s.running && SPECIALISTS.map((id) => geo.tops[id] && s.pulse[id] ? (
        <span key={`${id}-${s.pulse[id]}`} className={`org-dot dot-${s.pulseDir[id]}${s.edges[id] === 'veto' ? ' red' : ''}`}
          style={{ offsetPath: `path('${path(geo.monk, geo.tops[id])}')` }} aria-hidden="true" />
      ) : null)}
      <div className="org-top">{node('monk')}</div>
      <div className="org-row">{SPECIALISTS.map((id) => node(id))}</div>
      <div className="org-side">
        {node('whisperer', { line: whisperer.line, calls: whisperer.calls, cost: whisperer.cost, tag: 'ran in step ②', side: true })}
        {node('marshal', { tag: 'code, not AI', side: true })}
      </div>
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
      <div className="why-head"><strong>Why?</strong><button className="btn-link" onClick={onClose} aria-label="Close">✕</button></div>
      {n.key && <div className="why-key">{n.key}</div>}
      <ul>{[...new Set(bullets)].slice(0, 3).map((b) => <li key={b}>{b}</li>)}</ul>
      <span className="muted small">Full output: Under the hood → run inspector</span>
    </div>
  )
}
