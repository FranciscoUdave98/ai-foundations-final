import { MessagesSquare, RotateCcw } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { AppState, Persona, Voices } from '../../types'
import type { useCouncil } from '../../useCouncil'
import { money } from '../../ui'
import { OrgChart } from '../OrgChart'
import { AGENTS, AgentIcon } from '../../agents'

type Council = ReturnType<typeof useCouncil>

/** The coaching team, the heart of step 4: the team chart on the left, what they're saying on the right. */
export function CouncilBoard({ council, voices, state, openAgent, onOpened, status, action }: {
  council: Council; voices: Voices | null; state: AppState | null; openAgent: Persona | null; onOpened: () => void
  status: string; action: ReactNode
}) {
  const s = council.state
  const [now, setNow] = useState(Date.now())
  const talk = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!s.running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [s.running])
  // Keep the newest line in view: scroll the panel itself, never the page.
  useEffect(() => { if (talk.current) talk.current.scrollTop = talk.current.scrollHeight }, [s.feed.length])
  const scout = state?.last_scout?.result
  const top = scout?.cards.find((c) => c.id === scout.top_pick)
  const secs = s.running && s.startedAt ? Math.round((now - s.startedAt) / 1000) : 0
  const round = Math.min(3, Math.max(1, s.round))

  return (
    <section className="card board team-board" id="council-board" data-highlight="agent_tree" aria-labelledby="board-title">
      <div className="tb-head">
        <div className="tb-title">
          <h2 id="board-title">Your coaching team</h2>
          <p className="tb-status" aria-live="polite">
            <span className={`wf-dot${s.running ? ' on' : ''}`} aria-hidden="true" />
            <span>{status}</span>
            {s.running && <span className="tb-meter">Round {round} of 3 · {secs} s · {money(s.total)}</span>}
          </p>
        </div>
        <div className="tb-actions">
          {!s.running && s.feed.length > 0 && (
            <button className="btn-text" onClick={() => council.replay(true)} title="Watch the last run again. Free: no AI calls.">
              <RotateCcw size={15} aria-hidden="true" /> Replay
            </button>
          )}
          {action}
        </div>
      </div>
      {s.error && <p className="error-line" role="alert">The coaches couldn't finish. Try again in a minute.</p>}

      <div className="tb-body">
        <OrgChart s={s} voices={voices} openAgent={openAgent} onOpened={onOpened}
          whisperer={{ line: scout?.voice_line ?? null, calls: scout?.usage.requests ?? 0, cost: scout?.usage.cost_usd ?? 0, top: top ? `${top.name}, ${top.date}` : null }} />

        <aside className="tb-talk" aria-label="What the coaches are saying">
          <h3><MessagesSquare size={16} aria-hidden="true" /> What they're saying</h3>
          <div className="talk-list" ref={talk} aria-live="polite">
            {s.feed.length === 0 ? (
              <p className="talk-empty">Press <strong>Build</strong> and the coaches' conversation shows up here.</p>
            ) : s.feed.map((f, i) => (
              <div key={`${f.t}-${i}`}>
                {(i === 0 || s.feed[i - 1].round !== f.round) && <span className="talk-round">{f.round === 0 ? 'Opening' : `Round ${f.round}`}</span>}
                <div className={`talk-msg${f.persona === 'monk' ? ' lead' : ''}${/\bVETO\b/.test(f.text) ? ' veto' : ''}`}>
                  <AgentIcon id={f.persona} size="sm" />
                  <div>
                    <strong style={{ color: `var(--agent-${f.persona})` }}>{AGENTS[f.persona].title}</strong>
                    <p>{f.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  )
}
