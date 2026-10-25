import { useEffect, useRef, useState } from 'react'
import { SESSION_ID, streamChat } from '../api'
import type { ChatUsage, UiAction, Voices } from '../types'

export interface ChatMsg { role: 'user' | 'coach'; text: string; ai?: boolean; usage?: ChatUsage; notes?: string[] }

const MAX = 600
const KEY = `pacelab.chat.${SESSION_ID}`
const STARTERS = [
  'What does load ratio mean?', 'Why did Dr. Taper veto?', 'Show me week 7',
  'How much did this plan cost?', 'My knee hurts, should I run?', 'Take me to the safety log',
]

// The browser runs only these actions, whatever the server sends.
const TABS = ['council', 'data', 'hood']
const TARGETS = ['load_ratio', 'predictions', 'weekly_km', 'calendar', 'fun_stats', 'preferences', 'agent_tree', 'cost_table', 'budget_caps', 'safety_log']
const AGENTS = ['monk', 'wallbreaker', 'taper', 'kickstarter', 'guru', 'whisperer', 'marshal']
export function safeAction(a: UiAction): boolean {
  const n = Number(a.arg)
  switch (a.action) {
    case 'open_tab': return TABS.includes(String(a.arg))
    case 'go_to_step': return Number.isInteger(n) && n >= 1 && n <= 5
    case 'show_plan_week': return Number.isInteger(n) && n >= 1 && n <= 40
    case 'highlight': return TARGETS.includes(String(a.arg))
    case 'open_agent': return AGENTS.includes(String(a.arg))
    default: return false
  }
}

function load(): ChatMsg[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ChatMsg[] } catch { return [] }
}

/** "Ask your coach": the Marathon Monk in a side panel. It can explain and take you places, never change anything. */
export function ChatRail({ voices, onAction, onSpend, open, setOpen }: {
  voices: Voices | null
  onAction: (a: UiAction) => void
  onSpend: () => void
  open: boolean
  setOpen: (v: boolean) => void
}) {
  const [msgs, setMsgs] = useState<ChatMsg[]>(load)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const monk = voices?.personas.find((p) => p.id === 'monk')

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-40))) }, [msgs])
  // Scroll only the chat itself: scrollIntoView would also scroll the page away from what the coach just opened.
  useEffect(() => { if (body.current) body.current.scrollTop = body.current.scrollHeight }, [msgs, busy, open])

  const send = async (q: string) => {
    const message = q.trim().slice(0, MAX)
    if (!message || busy) return
    const history = msgs.slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'coach', text: m.text }))
    setMsgs((m) => [...m, { role: 'user', text: message }])
    setText('')
    setBusy(true)
    const notes: string[] = []
    try {
      await streamChat({ message, history }, (e) => {
        if (e.type === 'ui_action' && safeAction(e)) {
          notes.push(e.note)
          onAction(e)
        } else if (e.type === 'reply') {
          setMsgs((m) => [...m, { role: 'coach', text: e.text, ai: e.ai, usage: e.usage, notes: [...notes] }])
        }
      })
    } catch (err) {
      setMsgs((m) => [...m, { role: 'coach', text: `I couldn't reach the server (${(err as Error).message}). Try again in a moment.` }])
    } finally {
      setBusy(false)
      onSpend()
    }
  }

  const greeting = `Breathe. I'm ${monk?.name ?? 'the Marathon Monk'}, your head coach. Ask me about your plan, your data or what it cost, and I'll take you to the right spot. ${monk?.catchphrase ?? ''}`

  return (
    <>
      <aside className={`chat-rail${open ? ' open' : ''}`} aria-label="Ask your coach">
        <div className="chat-head">
          <span className="org-avatar" aria-hidden="true">{monk?.emoji ?? '🧘'}</span>
          <div className="chat-title"><strong>Ask your coach</strong><span>{monk?.name ?? 'The Marathon Monk'} · can explain, can't change your plan</span></div>
          {msgs.length > 0 && <button className="btn-link small" onClick={() => setMsgs([])}>Clear</button>}
          <button className="btn-link chat-close" onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
        </div>

        <div className="chat-body" aria-live="polite" ref={body}>
          <div className="chat-msg coach">
            <p>{greeting}</p>
            <span className="chat-meta"><span className="badge-code">Scripted</span> 0 tokens</span>
          </div>
          {msgs.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              <p>{m.text}</p>
              {m.notes?.map((n) => <span key={n} className="chat-note">↳ {n}</span>)}
              {m.role === 'coach' && (m.ai
                ? <span className="chat-meta"><span className="badge-ai">AI</span> {m.usage?.calls ?? 0} call{m.usage?.calls === 1 ? '' : 's'} · {(m.usage?.tokens ?? 0).toLocaleString()} tokens · ${(m.usage?.cost_usd ?? 0).toFixed(4)}</span>
                : m.usage && <span className="chat-meta"><span className="badge-code">Code, not AI</span> 0 tokens · $0.0000</span>)}
            </div>
          ))}
          {busy && <div className="chat-msg coach typing" aria-label="The coach is typing"><span /><span /><span /></div>}
        </div>

        {msgs.length === 0 && (
          <div className="chat-chips">
            {STARTERS.map((s) => <button key={s} className="chip-btn" onClick={() => send(s)} disabled={busy}>{s}</button>)}
          </div>
        )}

        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(text) }}>
          <textarea value={text} maxLength={MAX} rows={2} placeholder="Ask about your plan, a metric or the cost…" aria-label="Message to your coach"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text) } }} />
          <div className="chat-send">
            <span className="muted small">{text.length}/{MAX}</span>
            <button className="btn" type="submit" disabled={busy || !text.trim()}>Send</button>
          </div>
        </form>
      </aside>
      {!open && (
        <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Ask your coach">
          <span aria-hidden="true">{monk?.emoji ?? '🧘'}</span> Ask your coach
        </button>
      )}
    </>
  )
}
