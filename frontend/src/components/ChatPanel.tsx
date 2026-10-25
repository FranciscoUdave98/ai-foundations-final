import { ArrowUp, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AgentIcon } from '../agents'
import type { Persona, Voices } from '../types'
import { type Chat, MAX_CHARS, QUICK } from '../useChat'
import { ktok, money } from '../ui'

// Questions for the coaches, each shown with the coach who'd answer it.
const ASK: { q: string; who: Persona }[] = [
  { q: 'How fast should my easy runs be?', who: 'wallbreaker' },
  { q: 'Why did the Injury Guard say no?', who: 'taper' },
  { q: 'What is a taper, and why rest before a race?', who: 'kickstarter' },
  { q: 'My knee hurts. Should I still run?', who: 'taper' },
]
const HELLO = ['Hey! 👋 Where to?', 'Ready to run? 🏃 Pick one:', 'Hi! What do you need?', 'Lace up. Where should we go?']
// Shown while the coach thinks, one every 1.4 s: the voice pack's loading lines plus a few chat ones.
const THINKING = [
  'Lacing up…', 'Checking your splits…', 'Asking the Injury Guard…', 'Reading your plan…', 'Refilling water bottles…',
  'Foam rolling the database…', 'Counting gels…', 'Stretching the hamstrings of logic…', 'Pinning the bib…', 'Untangling earbuds…',
]

function Thinking({ extra }: { extra: string[] }) {
  const lines = [...THINKING, ...extra.map((l) => l.replace(/\.\.\.$/, '…'))]
  const [i, setI] = useState(() => Math.floor(Math.random() * lines.length))
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % lines.length), 1400); return () => clearInterval(t) }, [lines.length])
  return (
    <div className="cx-row bot" aria-label="The coach is thinking">
      <img className="cx-mascot" src="/pacekit-png/loading/shoe-mascot.png" alt="" />
      <span key={i} className="cx-bubble cx-phrase">{lines[i]}</span>
    </div>
  )
}

/** "Ask your coach": a popup. Quick actions jump around the app instantly; questions go to the Head Coach. Never edits. */
export function ChatPanel({ chat, voices, mode, open = true, setOpen }: {
  chat: Chat; voices: Voices | null; mode: 'docked' | 'popup'; open?: boolean; setOpen?: (v: boolean) => void
}) {
  const [text, setText] = useState('')
  const [hello] = useState(() => HELLO[Math.floor(Math.random() * HELLO.length)])
  const body = useRef<HTMLDivElement>(null)
  // Scroll only the chat itself, never the page.
  useEffect(() => { if (body.current) body.current.scrollTop = chat.msgs.length || chat.busy ? body.current.scrollHeight : 0 }, [chat.msgs, chat.busy, open])

  if (mode === 'popup' && !open) {
    return (
      <button className="chat-fab" onClick={() => setOpen?.(true)}>
        <img className="fab-icon" src="/pacekit-png/icons/chat.png" alt="" />
        <span className="fab-text"><strong>Ask your coach</strong><small>Any question, any time</small></span>
      </button>
    )
  }
  const send = (q: string) => { chat.send(q); setText('') }
  const fresh = chat.msgs.length === 0

  return (
    <aside className={`cx cx-${mode}`} aria-label="Ask your coach">
      <header className="cx-head">
        <AgentIcon id="monk" />
        <div className="cx-title"><strong>Head Coach</strong><span><i className="cx-online" aria-hidden="true" /> here to help</span></div>
        {!fresh && <button className="icon-btn" onClick={chat.clear} aria-label="Start over" title="Start over"><RotateCcw size={16} /></button>}
        {mode === 'popup' && <button className="icon-btn" onClick={() => setOpen?.(false)} aria-label="Close chat" title="Close"><X size={18} /></button>}
      </header>

      <div className="cx-body" aria-live="polite" ref={body}>
        <div className="cx-row bot">
          <AgentIcon id="monk" size="sm" />
          <p className="cx-bubble">{hello}</p>
        </div>
        {fresh && (
          <>
            <span className="cx-group">Take me to</span>
            <div className="cx-actions">
              {QUICK.map((q) => (
                <button key={q.label} className="cx-action" onClick={() => send(q.label)} disabled={chat.busy}>
                  <img className="cx-action-art" src={`/pacekit-png/${q.img}.png`} alt="" />{q.label}
                </button>
              ))}
            </div>
            <span className="cx-group">Ask the coaches</span>
            <div className="cx-actions">
              {ASK.map((a) => (
                <button key={a.q} className="cx-action cx-question" onClick={() => send(a.q)} disabled={chat.busy}>
                  <AgentIcon id={a.who} size="sm" />{a.q}
                </button>
              ))}
            </div>
          </>
        )}
        {chat.msgs.map((m, i) => (
          <div key={i} className={`cx-row ${m.role === 'user' ? 'me' : 'bot'}`}>
            {m.role === 'coach' && <AgentIcon id="monk" size="sm" />}
            <div className="cx-stack">
              <p className="cx-bubble">{m.text}</p>
              {m.notes?.map((n) => <span key={n} className="cx-note">↳ {n}</span>)}
              {m.role === 'coach' && (m.quick ? <span className="cx-meta">instant · free</span>
                : m.ai ? <span className="cx-meta">AI · {money(m.usage?.cost_usd)} · {ktok(m.usage?.tokens ?? 0)}</span>
                : m.usage ? <span className="cx-meta">rule, not AI · free</span> : null)}
            </div>
          </div>
        ))}
        {chat.busy && <Thinking extra={voices?.loading ?? []} />}
      </div>

      {!fresh && (
        <div className="cx-chips">
          {QUICK.map((q) => <button key={q.label} onClick={() => send(q.label)} disabled={chat.busy} title={q.label}><img src={`/pacekit-png/${q.img}.png`} alt="" /> {q.label}</button>)}
        </div>
      )}

      <form className="cx-input" onSubmit={(e) => { e.preventDefault(); send(text) }}>
        <textarea value={text} maxLength={MAX_CHARS} rows={1} placeholder="Ask your coach…" aria-label="Message to your coach"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text) } }} />
        <button className="cx-send" type="submit" disabled={chat.busy || !text.trim()} aria-label="Send"><ArrowUp size={18} /></button>
      </form>
    </aside>
  )
}
