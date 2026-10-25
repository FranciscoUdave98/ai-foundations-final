// Small shared UI: toasts, skeletons, coach-mark tips, the page title hook.
import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'

// ---------------------------------------------------------------- toasts (bottom-left, 3 s)

interface Toast { id: number; text: string; kind: 'ok' | 'error' }
let toasts: Toast[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(text: string, kind: Toast['kind'] = 'ok') {
  const id = Date.now() + Math.random()
  toasts = [...toasts, { id, text, kind }].slice(-3)
  emit()
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); emit() }, 3000)
}

export function Toasts() {
  const list = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => toasts)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>)}
    </div>
  )
}

// ---------------------------------------------------------------- skeleton

export function Skel({ h = 16, w = '100%' }: { h?: number; w?: number | string }) {
  return <span className="skel" style={{ height: h, width: w }} aria-hidden="true" />
}

// ---------------------------------------------------------------- coach-mark tips (shown once)

const TIPS = [
  { anchor: 'setup', text: 'Set up your runs, race and preferences' },
  { anchor: 'board', text: 'Watch 5 AI coaches debate your plan' },
  { anchor: 'chat', text: 'Ask your coach anything here' },
]
const TIPS_KEY = 'pacelab.tips.seen'
let tipsOpen = localStorage.getItem(TIPS_KEY) !== '1'
const tipListeners = new Set<() => void>()
export function showTips() { tipsOpen = true; tipListeners.forEach((l) => l()) }
function closeTips() { tipsOpen = false; localStorage.setItem(TIPS_KEY, '1'); tipListeners.forEach((l) => l()) }

/** Tips sit next to elements marked data-tip="setup|board|chat" on the Council tab. */
export function CoachMarks({ active }: { active: boolean }) {
  const open = useSyncExternalStore((l) => { tipListeners.add(l); return () => tipListeners.delete(l) }, () => tipsOpen)
  const [i, setI] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const tip = TIPS[i]

  useLayoutEffect(() => {
    if (!open || !active) return
    const place = () => {
      const el = document.querySelector(`[data-tip="${tip.anchor}"]`)
      if (!el) { setPos(null); return }
      const r = el.getBoundingClientRect()
      // Beside the thing it points at, never on top of a button: under the setup row, inside the board's top-right, left of the chat.
      const at = tip.anchor === 'setup' ? { top: r.top + 56, left: r.left + r.width * 0.3 }
        : tip.anchor === 'board' ? { top: r.top + 48, left: r.right - 300 }
        : { top: r.top + 64, left: r.left - 296 }
      const left = Math.min(Math.max(16, at.left), window.innerWidth - 296)
      setPos({ top: Math.min(Math.max(104, at.top), window.innerHeight - 160), left })
    }
    place()
    const t = setInterval(place, 400)
    window.addEventListener('resize', place)
    return () => { clearInterval(t); window.removeEventListener('resize', place) }
  }, [open, active, tip.anchor])
  useEffect(() => { if (open) setI(0) }, [open])

  if (!open || !active || !pos) return null
  const next = () => (i < TIPS.length - 1 ? setI(i + 1) : closeTips())
  return (
    <div className="coach-mark" style={{ top: pos.top, left: pos.left }} role="dialog" aria-label={`Tip ${i + 1} of ${TIPS.length}`}>
      <span className="coach-n">{i + 1}</span>
      <p>{tip.text}</p>
      <div className="coach-actions">
        <button className="btn-text" onClick={closeTips}>Skip</button>
        <button className="btn btn-sm" onClick={next}>{i < TIPS.length - 1 ? 'Next' : 'Got it'}</button>
      </div>
      <button className="icon-btn coach-x" onClick={closeTips} aria-label="Close tips"><X size={14} /></button>
    </div>
  )
}

// ---------------------------------------------------------------- browser tab title

export function useTitle(title: string) {
  useEffect(() => { document.title = `${title} · PaceLab` }, [title])
}

// ---------------------------------------------------------------- formatting for summaries (exact values live in Cost & Safety)

export const money = (usd: number | null | undefined) => (usd == null ? '—' : usd < 0.01 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`)
export const ktok = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k tokens` : `${n} tokens`)
