import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** Width of a container, kept in sync with resizes. */
export function useWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth || fallback)
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [fallback])
  return [ref, width] as const
}

export interface TipState {
  x: number
  y: number
  content: ReactNode
}

/** One floating tooltip: value first (strong), label after. Text only, never HTML strings. */
export function Tooltip({ tip }: { tip: TipState | null }) {
  if (!tip) return null
  return (
    <div className="tooltip" style={{ left: tip.x, top: tip.y }} role="status">
      {tip.content}
    </div>
  )
}

/** Indexes where a month label goes: first week of each month, skipping labels that would collide. */
export function monthLabelIndexes(dates: string[], xAt: (i: number) => number, minGap = 30): Set<number> {
  const out = new Set<number>()
  let lastX = -Infinity
  dates.forEach((d, i) => {
    if ((i === 0 || d.slice(0, 7) !== dates[i - 1].slice(0, 7)) && xAt(i) - lastX >= minGap) {
      out.add(i)
      lastX = xAt(i)
    }
  })
  return out
}

/** Bar with a 4px rounded data-end and a square baseline. */
export function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`
}
