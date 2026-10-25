import { useState } from 'react'
import type { AppState, Persona, Voices } from '../../types'
import type { useCouncil } from '../../useCouncil'

type Council = ReturnType<typeof useCouncil>
const ORDER: Persona[] = ['monk', 'wallbreaker', 'taper', 'kickstarter', 'guru', 'whisperer', 'marshal']

/** ④ Debate: the council at work, and the last lines of the debate. */
export function DebateStep({ council, voices }: { council: Council; voices: Voices | null; state: AppState | null }) {
  const s = council.state
  const [full, setFull] = useState(false)
  const persona = (id: Persona) => voices?.personas.find((p) => p.id === id)
  const lines = full ? s.feed : s.feed.slice(-6)
  return (
    <section className="card step-card">
      <div className="card-head">
        <h2>The council {s.running ? 'is debating' : 'has ruled'}</h2>
        <span className="muted">Round {Math.max(1, s.round)} of 3 · ${s.total.toFixed(4)}</span>
      </div>
      {s.error && <div className="error" role="alert">{s.error}</div>}
      <div className="node-grid">
        {ORDER.map((id) => {
          const n = s.nodes[id]
          const meta = persona(id)
          return (
            <div key={id} className={`node status-${n.status}`}>
              <span className="node-emoji" aria-hidden="true">{meta?.emoji}</span>
              <strong>{meta?.name}</strong>
              <span className="muted small">{meta?.role}</span>
              <span className={`pill pill-${n.status}`}>{n.status.replace('_', ' ')}</span>
              {n.line && <p className="bubble">{n.line}</p>}
              {n.calls > 0 && <span className="muted small">{n.calls} call{n.calls === 1 ? '' : 's'} · ${n.cost.toFixed(4)}</span>}
            </div>
          )
        })}
      </div>
      <div className="feed-compact">
        {lines.map((f, i) => (
          <p key={i} className={f.live ? 'live' : ''}><span aria-hidden="true">{persona(f.persona)?.emoji}</span> <strong>{persona(f.persona)?.name}</strong> {f.text}</p>
        ))}
        {s.feed.length > 6 && <button className="btn-link" onClick={() => setFull((v) => !v)}>{full ? 'Show the last 6 lines' : 'Show full transcript'}</button>}
      </div>
    </section>
  )
}
