import { MessageCircle, Send, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Voices } from '../types'
import { type Chat, MAX_CHARS } from '../useChat'
import { ktok, money } from '../ui'

const STARTERS = [
  'What does load ratio mean?', 'Why did Dr. Taper veto?', 'Show me week 7',
  'How much did this plan cost?', 'My knee hurts, should I run?', 'Take me to the safety log',
]

/** "Ask your coach": docked on the Council tab, a popup everywhere else. It explains and navigates, never edits. */
export function ChatPanel({ chat, voices, mode, open = true, setOpen }: {
  chat: Chat; voices: Voices | null; mode: 'docked' | 'popup'; open?: boolean; setOpen?: (v: boolean) => void
}) {
  const [text, setText] = useState('')
  const body = useRef<HTMLDivElement>(null)
  const monk = voices?.personas.find((p) => p.id === 'monk')
  // Scroll only the chat itself, never the page.
  useEffect(() => { if (body.current) body.current.scrollTop = body.current.scrollHeight }, [chat.msgs, chat.busy, open])

  if (mode === 'popup' && !open) {
    return (
      <button className="chat-fab" onClick={() => setOpen?.(true)} data-tip="chat">
        <MessageCircle size={18} aria-hidden="true" /> Ask your coach
      </button>
    )
  }
  const send = (q: string) => { chat.send(q); setText('') }

  return (
    <aside className={`chat-panel chat-${mode}`} aria-label="Ask your coach" data-tip={mode === 'docked' ? 'chat' : undefined}>
      <div className="chat-head">
        <span className="avatar" style={{ '--agent': 'var(--agent-monk)' } as React.CSSProperties} aria-hidden="true">{monk?.emoji ?? '🧘'}</span>
        <div className="chat-title"><strong>Ask your coach</strong><span>Explains and navigates. Never edits.</span></div>
        {chat.msgs.length > 0 && <button className="icon-btn" onClick={chat.clear} aria-label="Clear chat" title="Clear chat"><Trash2 size={16} /></button>}
        {mode === 'popup' && <button className="icon-btn" onClick={() => setOpen?.(false)} aria-label="Close chat" title="Close"><X size={16} /></button>}
      </div>

      <div className="chat-body" aria-live="polite" ref={body}>
        <div className="chat-msg coach">
          <p>Breathe. Ask me about your plan, data or costs.</p>
          <span className="chat-meta"><span className="badge-code">Scripted</span> free</span>
        </div>
        {chat.msgs.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <p>{m.text}</p>
            {m.notes?.map((n) => <span key={n} className="chat-note">↳ {n}</span>)}
            {m.role === 'coach' && (m.ai
              ? <span className="chat-meta"><span className="badge-ai">AI</span> {money(m.usage?.cost_usd)} · {ktok(m.usage?.tokens ?? 0)}</span>
              : m.usage && <span className="chat-meta"><span className="badge-code">Rule, not AI</span> free</span>)}
          </div>
        ))}
        {chat.busy && <div className="chat-msg coach typing" aria-label="The coach is typing"><span /><span /><span /></div>}
      </div>

      {chat.msgs.length === 0 && (
        <div className="chat-chips">
          {STARTERS.map((s) => <button key={s} className="chip-btn" onClick={() => send(s)} disabled={chat.busy}>{s}</button>)}
        </div>
      )}

      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(text) }}>
        <textarea value={text} maxLength={MAX_CHARS} rows={1} placeholder="Ask your coach…" aria-label="Message to your coach"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text) } }} />
        <button className="icon-btn send" type="submit" disabled={chat.busy || !text.trim()} aria-label="Send" title={text.trim() ? 'Send' : 'Type a question first'}>
          <Send size={16} />
        </button>
      </form>
    </aside>
  )
}
