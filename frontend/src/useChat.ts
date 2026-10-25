// Coach chat state, shared by the docked panel (Council tab) and the floating popup (other tabs).
import { useCallback, useEffect, useState } from 'react'
import { SESSION_ID, streamChat } from './api'
import type { ChatUsage, UiAction } from './types'

export interface ChatMsg { role: 'user' | 'coach'; text: string; ai?: boolean; usage?: ChatUsage; notes?: string[] }

export const MAX_CHARS = 600
const KEY = `pacelab.chat.${SESSION_ID}`

// The browser runs only these actions, whatever the server sends.
const TABS = ['council', 'plan', 'data', 'hood']
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

export function useChat(onAction: (a: UiAction) => void, onSpend: () => void) {
  const [msgs, setMsgs] = useState<ChatMsg[]>(load)
  const [busy, setBusy] = useState(false)
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-40))) }, [msgs])

  const send = useCallback(async (q: string) => {
    const message = q.trim().slice(0, MAX_CHARS)
    if (!message || busy) return
    const history = msgs.slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'coach', text: m.text }))
    setMsgs((m) => [...m, { role: 'user', text: message }])
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
    } catch {
      setMsgs((m) => [...m, { role: 'coach', text: "Couldn't reach the server. Check it's running, then try again." }])
    } finally {
      setBusy(false)
      onSpend()
    }
  }, [busy, msgs, onAction, onSpend])

  return { msgs, busy, send, clear: () => setMsgs([]) }
}

export type Chat = ReturnType<typeof useChat>
