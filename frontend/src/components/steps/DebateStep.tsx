import { useState } from 'react'
import type { AppState, Persona, Voices } from '../../types'
import type { useCouncil } from '../../useCouncil'
import { OrgChart } from '../OrgChart'

type Council = ReturnType<typeof useCouncil>

/** ④ Debate: the live org chart, with the last lines of the debate under it. */
export function DebateStep({ council, voices, state, openAgent, onOpened }: {
  council: Council; voices: Voices | null; state: AppState | null; openAgent?: Persona | null; onOpened?: () => void
}) {
  const s = council.state
  const [drawer, setDrawer] = useState(false)
  const persona = (id: Persona) => voices?.personas.find((p) => p.id === id)
  const scout = state?.last_scout?.result
  const top = scout?.cards.find((c) => c.id === scout.top_pick)
  const last = s.feed.slice(-6)
  const rounds = [...new Set(last.map((f) => f.round))]

  return (
    <section className="card step-card debate" data-highlight="agent_tree">
      <div className="card-head">
        <div>
          <h2>The council {s.running ? 'is debating' : s.feed.length ? 'has ruled' : 'is waiting'}</h2>
          <div className="card-sub">Click any coach for the reasons behind its call.</div>
        </div>
        <span className="round-counter">Round {Math.max(1, s.round)} of 3 · ${s.total.toFixed(4)}</span>
      </div>
      {s.error && <div className="error" role="alert">{s.error}</div>}
      <OrgChart s={s} voices={voices} openAgent={openAgent ?? null} onOpened={onOpened ?? (() => {})}
        whisperer={{ line: scout?.voice_line ?? null, calls: scout?.usage.requests ?? 0, cost: scout?.usage.cost_usd ?? 0, top: top ? `${top.name}, ${top.date}` : null }} />

      <div className="feed-compact" aria-live="polite">
        {rounds.map((r) => (
          <div key={r} className="feed-round">
            <span className="feed-round-label">{r === 0 ? 'Opening' : `Round ${r}`}</span>
            {last.filter((f) => f.round === r).map((f, i) => (
              <p key={i} className={f.live ? 'live' : ''}><span aria-hidden="true">{persona(f.persona)?.emoji}</span> <strong>{persona(f.persona)?.name}</strong> {f.text}</p>
            ))}
          </div>
        ))}
        {s.feed.length > 6 && <button className="btn-link" onClick={() => setDrawer(true)}>Show full transcript ({s.feed.length} lines)</button>}
      </div>

      {drawer && (
        <div className="drawer-backdrop" onClick={() => setDrawer(false)}>
          <aside className="drawer" role="dialog" aria-label="Full transcript" onClick={(e) => e.stopPropagation()}>
            <div className="card-head"><h2>Full transcript</h2><button className="btn" onClick={() => setDrawer(false)}>Close</button></div>
            {s.feed.map((f, i) => (
              <p key={i} className={`drawer-line${f.live ? ' live' : ''}`}>
                <span className="muted small">{(f.t / 1000).toFixed(0)}s · round {f.round}</span><br />
                <span aria-hidden="true">{persona(f.persona)?.emoji}</span> <strong>{persona(f.persona)?.name}</strong> {f.text}
              </p>
            ))}
          </aside>
        </div>
      )}
    </section>
  )
}
