import { useState } from 'react'
import { fmtWeekday, monthShort, parseDay } from '../../format'
import type { DayVolume } from '../../types'
import { Tooltip, useWidth, type TipState } from './common'

const BINS: { max: number; color: string; label: string }[] = [
  { max: 0, color: 'var(--seq-0)', label: 'rest' },
  { max: 5, color: 'var(--seq-1)', label: '≤5' },
  { max: 10, color: 'var(--seq-2)', label: '≤10' },
  { max: 15, color: 'var(--seq-3)', label: '≤15' },
  { max: 20, color: 'var(--seq-4)', label: '≤20' },
  { max: Infinity, color: 'var(--seq-5)', label: '20+' },
]
const ROWS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']
const LEFT = 30
const TOP = 18
const GAP = 2

function color(km: number) {
  return (BINS.find((b) => km <= b.max) ?? BINS[BINS.length - 1]).color
}

/** Daily km, weeks as columns (Mon-Sun rows). One blue ramp, light = little, dark = a lot. */
export function CalendarHeatmap({ days }: { days: DayVolume[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  if (!days.length) return null

  const firstDow = (parseDay(days[0].day).getDay() + 6) % 7          // Monday = 0
  const cols = Math.ceil((days.length + firstDow) / 7)
  const cell = Math.max(6, Math.min(16, Math.floor((width - LEFT) / cols) - GAP))
  const step = cell + GAP
  const height = TOP + 7 * step

  return (
    <div>
      <div className="chart" ref={ref} onPointerLeave={() => setTip(null)}>
        <svg width={width} height={height} role="img" aria-label="Calendar heatmap of daily kilometers">
          {ROWS.map((r, i) => r && <text key={r} x={LEFT - 6} y={TOP + i * step + cell / 2} dy="0.32em" textAnchor="end">{r}</text>)}
          {days.map((d, i) => {
            const k = i + firstDow
            const col = Math.floor(k / 7)
            const row = k % 7
            const cx = LEFT + col * step
            const cy = TOP + row * step
            const newMonth = row === 0 || i === 0
              ? i === 0 || monthShort(d.day) !== monthShort(days[Math.max(0, i - 7)].day)
              : false
            return (
              <g key={d.day}>
                {newMonth && row === 0 && <text x={cx} y={TOP - 6}>{monthShort(d.day)}</text>}
                <rect x={cx} y={cy} width={cell} height={cell} rx={3} fill={color(d.km)}
                  onPointerMove={() => setTip({
                    x: cx + cell / 2, y: cy,
                    content: (<><div className="tv">{d.km > 0 ? `${d.km.toFixed(1)} km` : 'Rest day'}</div><div className="tl">{fmtWeekday(d.day)}</div></>),
                  })} />
              </g>
            )
          })}
        </svg>
        <Tooltip tip={tip} />
      </div>
      <div className="legend" style={{ marginTop: 6 }}>
        <span>km per day</span>
        {BINS.map((b) => (
          <span key={b.label}><span className="ramp"><i style={{ background: b.color }} /></span>{b.label}</span>
        ))}
      </div>
    </div>
  )
}
