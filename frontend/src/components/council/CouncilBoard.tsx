import { RotateCcw, ScrollText, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AppState, Persona, Voices } from '../../types'
import type { useCouncil } from '../../useCouncil'
import { money } from '../../ui'
import { OrgChart } from '../OrgChart'

type Council = ReturnType<typeof useCouncil>

/** The council, always on screen: idle before a run, live during one, final states after. */
export function CouncilBoard({ council, voices, state, openAgent, onOpened }: {
  council: Council; voices: Voices | null; state: AppState | null; openAgent: Persona | null; onOpened: () => void
}) {
  const s = council.state
  const [drawer, setDrawer] = useState(false)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!s.running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [s.running])
  const persona = (id: Persona) => voices?.personas.find((p) => p.id === id)
  const scout = state?.last_scout?.result
  const top = scout?.cards.find((c) => c.id === scout.top_pick)
  const last = s.feed.slice(-6)
  const rounds = [...new Set(last.map((f) => f.round))]
  const secs = s.running && s.startedAt ? Math.round((now - s.startedAt) / 1000) : 0
  const round = Math.min(3, Math.max(1, s.round))

  return (
    <section className="card board" id="council-board" data-highlight="agent_tree" data-tip="board" aria-labelledby="board-title">
      <div className="board-head">
        <h2 id="board-title">The council</h2>
        <span className="caption">{s.running ? 'Debating live' : s.feed.length ? 'Ruled' : '5 AI coaches, 1 rule checker'}</span>
        {!s.running && s.feed.length > 0 && (
          <button className="btn-text" onClick={() => council.replay(true)} title="Replay the last debate. Free: no AI calls.">
            <RotateCcw size={15} aria-hidden="true" /> Replay the debate
          </button>
        )}
      </div>
      {s.running && (
        <div className="run-progress" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={round}
          aria-label={`Round ${round} of 3`}>
          <span className="bar" style={{ width: `${Math.min(100, (round - 1) * 33 + Math.min(33, secs))}%` }} />
          <span className="label">Round {round} of 3 · {secs} s · {money(s.total)}</span>
        </div>
      )}
      {s.error && <p className="error-line" role="alert">The council couldn't finish. Try again in a minute.</p>}
      <OrgChart s={s} voices={voices} openAgent={openAgent} onOpened={onOpened}
        whisperer={{ line: scout?.voice_line ?? null, calls: scout?.usage.requests ?? 0, cost: scout?.usage.cost_usd ?? 0, top: top ? `${top.name}, ${top.date}` : null }} />

      <div className="feed" aria-live="polite">
        {last.length === 0 && <p className="caption">The debate shows here, line by line.</p>}
        {rounds.map((r) => (
          <div key={r} className="feed-round">
            <span className="feed-round-label">{r === 0 ? 'Opening' : `Round ${r}`}</span>
            {last.filter((f) => f.round === r).map((f, i) => (
              <p key={i}><strong style={{ color: `var(--agent-${f.persona})` }}>{persona(f.persona)?.name}</strong> {f.text}</p>
            ))}
          </div>
        ))}
        {s.feed.length > 6 && (
          <button className="btn-text" onClick={() => setDrawer(true)}><ScrollText size={15} aria-hidden="true" /> Full transcript ({s.feed.length})</button>
        )}
      </div>

      {drawer && (
        <div className="drawer-backdrop" onClick={() => setDrawer(false)}>
          <aside className="drawer" role="dialog" aria-label="Full transcript" onClick={(e) => e.stopPropagation()}>
            <div className="board-head"><h2>Full transcript</h2><button className="icon-btn" onClick={() => setDrawer(false)} aria-label="Close transcript"><X size={18} /></button></div>
            {s.feed.map((f, i) => (
              <p key={i} className="drawer-line">
                <span className="caption">{(f.t / 1000).toFixed(0)} s · round {f.round}</span><br />
                <strong style={{ color: `var(--agent-${f.persona})` }}>{persona(f.persona)?.name}</strong> {f.text}
              </p>
            ))}
          </aside>
        </div>
      )}
    </section>
  )
}
