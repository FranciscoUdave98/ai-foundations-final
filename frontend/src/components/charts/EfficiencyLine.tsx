import { useState } from 'react'
import { fmtDay, fmtPace, monthShort } from '../../format'
import type { EfficiencyWeek } from '../../types'
import { Tooltip, monthLabelIndexes, useWidth, type TipState } from './common'

const H = 200
const M = { top: 18, right: 44, bottom: 26, left: 40 }

/** Weekly aerobic efficiency (meters per heartbeat). One series, crosshair tooltip, end label. */
export function EfficiencyLine({ weeks }: { weeks: EfficiencyWeek[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [idx, setIdx] = useState<number | null>(null)
  const [tip, setTip] = useState<TipState | null>(null)

  if (weeks.length < 2) return <p className="muted">Not enough heart-rate data for a trend.</p>

  const vals = weeks.map((w) => w.meters_per_beat)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const pad = (hi - lo) * 0.25 || 0.05
  const y0 = Math.floor((lo - pad) * 20) / 20
  const y1 = Math.ceil((hi + pad) * 20) / 20
  const innerW = width - M.left - M.right
  const innerH = H - M.top - M.bottom
  const x = (i: number) => M.left + (i / (weeks.length - 1)) * innerW
  const y = (v: number) => M.top + innerH - ((v - y0) / (y1 - y0)) * innerH
  const ticks = [y0, (y0 + y1) / 2, y1]
  const line = weeks.map((w, i) => `${i ? 'L' : 'M'}${x(i)},${y(w.meters_per_beat)}`).join(' ')
  const area = `${line} L${x(weeks.length - 1)},${M.top + innerH} L${x(0)},${M.top + innerH} Z`
  const last = weeks[weeks.length - 1]
  const monthAt = monthLabelIndexes(weeks.map((w) => w.week_start), x)

  function move(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - box.left) / box.width) * (weeks.length - 1))
    const k = Math.max(0, Math.min(weeks.length - 1, i))
    const w = weeks[k]
    setIdx(k)
    setTip({
      x: x(k), y: y(w.meters_per_beat),
      content: (
        <>
          <div className="tv">{w.meters_per_beat.toFixed(2)} m per beat</div>
          <div className="tl">Week of {fmtDay(w.week_start, true)}</div>
          {w.easy_pace_s_per_km && <div className="tl">Easy runs at {fmtPace(w.easy_pace_s_per_km)}</div>}
        </>
      ),
    })
  }

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={H} role="img" aria-label="Aerobic efficiency by week, line chart">
        {ticks.map((t) => (
          <g key={t}>
            <line className="gridline" x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} />
            <text className="tick" x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end">{t.toFixed(2)}</text>
          </g>
        ))}
        <line className="baseline" x1={M.left} x2={width - M.right} y1={M.top + innerH} y2={M.top + innerH} />
        {weeks.map((w, i) => monthAt.has(i) && (
          <text key={w.week_start} x={x(i)} y={H - 8} textAnchor="middle">{monthShort(w.week_start)}</text>
        ))}
        <path d={area} fill="var(--series-1-wash)" />
        <path d={line} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {idx !== null && <line className="crosshair" x1={x(idx)} x2={x(idx)} y1={M.top} y2={M.top + innerH} />}
        {idx !== null && <circle cx={x(idx)} cy={y(weeks[idx].meters_per_beat)} r={5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />}
        <circle cx={x(weeks.length - 1)} cy={y(last.meters_per_beat)} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
        <text className="label-strong" x={x(weeks.length - 1) + 8} y={y(last.meters_per_beat)} dy="0.32em">{last.meters_per_beat.toFixed(2)}</text>
        <rect x={M.left} y={M.top} width={innerW} height={innerH} fill="transparent"
          onPointerMove={move} onPointerLeave={() => { setIdx(null); setTip(null) }} />
      </svg>
      <Tooltip tip={tip} />
    </div>
  )
}
