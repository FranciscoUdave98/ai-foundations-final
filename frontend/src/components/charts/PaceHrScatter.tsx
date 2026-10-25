import { useState } from 'react'
import { fmtDay, fmtPace } from '../../format'
import type { PaceHrPoint } from '../../types'
import { Tooltip, useWidth, type TipState } from './common'

const H = 240
const M = { top: 14, right: 12, bottom: 34, left: 52 }
// Recency in one steel hue: older runs are fainter (charts stay steel; the hi-vis accent is reserved)
const RAMP = [0.25, 0.42, 0.6, 0.8, 1]

/** Pace vs heart rate per run. Faster is up. Color = recency (one blue ramp, older is lighter). */
export function PaceHrScatter({ points }: { points: PaceHrPoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  if (points.length < 3) return <p className="muted">No heart-rate data in this range.</p>

  const sorted = [...points].sort((a, b) => a.day.localeCompare(b.day))
  const hrs = sorted.map((p) => p.avg_hr)
  const paces = sorted.map((p) => p.pace_s_per_km)
  const hr0 = Math.floor((Math.min(...hrs) - 3) / 10) * 10
  const hr1 = Math.ceil((Math.max(...hrs) + 3) / 10) * 10
  const p0 = Math.floor((Math.min(...paces) - 5) / 30) * 30
  const p1 = Math.ceil((Math.max(...paces) + 5) / 30) * 30
  const innerW = width - M.left - M.right
  const innerH = H - M.top - M.bottom
  const x = (hr: number) => M.left + ((hr - hr0) / (hr1 - hr0)) * innerW
  const y = (pace: number) => M.top + ((pace - p0) / (p1 - p0)) * innerH      // faster (smaller) at top
  const bin = (i: number) => Math.min(RAMP.length - 1, Math.floor((i / sorted.length) * RAMP.length))
  const hrTicks: number[] = []
  for (let v = hr0; v <= hr1; v += 10) hrTicks.push(v)
  const paceTicks: number[] = []
  for (let v = p0; v <= p1; v += 30) paceTicks.push(v)

  function move(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - box.left + M.left
    const py = e.clientY - box.top + M.top
    let best = -1
    let bestD = Infinity
    sorted.forEach((p, i) => {
      const d = (x(p.avg_hr) - px) ** 2 + (y(p.pace_s_per_km) - py) ** 2
      if (d < bestD) { bestD = d; best = i }
    })
    if (best < 0 || bestD > 40 ** 2) { setHover(null); setTip(null); return }
    const p = sorted[best]
    setHover(best)
    setTip({
      x: x(p.avg_hr), y: y(p.pace_s_per_km),
      content: (
        <>
          <div className="tv">{fmtPace(p.pace_s_per_km)} at {Math.round(p.avg_hr)} bpm</div>
          <div className="tl">{fmtDay(p.day, true)} · {p.distance_km.toFixed(1)} km</div>
        </>
      ),
    })
  }

  return (
    <div>
      <div className="chart" ref={ref}>
        <svg width={width} height={H} role="img" aria-label="Pace versus heart rate scatter plot">
          {paceTicks.map((t) => (
            <g key={t}>
              <line className="gridline" x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} />
              <text className="tick" x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end">{fmtPace(t).replace('/km', '')}</text>
            </g>
          ))}
          {hrTicks.map((t) => (
            <text key={t} className="tick" x={x(t)} y={M.top + innerH + 16} textAnchor="middle">{t}</text>
          ))}
          <line className="baseline" x1={M.left} x2={width - M.right} y1={M.top + innerH} y2={M.top + innerH} />
          <text x={M.left + innerW / 2} y={H - 2} textAnchor="middle">Average heart rate (bpm)</text>
          <text x={12} y={M.top + innerH / 2} textAnchor="middle" transform={`rotate(-90 12 ${M.top + innerH / 2})`}>Pace (min/km)</text>
          {sorted.map((p, i) => (
            <circle key={`${p.day}-${i}`} cx={x(p.avg_hr)} cy={y(p.pace_s_per_km)} r={hover === i ? 6 : 4}
              fill="var(--series-1)" fillOpacity={RAMP[bin(i)]} stroke="var(--surface)" strokeWidth={2} />
          ))}
          <rect x={M.left} y={M.top} width={innerW} height={innerH} fill="transparent"
            onPointerMove={move} onPointerLeave={() => { setHover(null); setTip(null) }} />
        </svg>
        <Tooltip tip={tip} />
      </div>
      <div className="legend" style={{ marginTop: 6 }}>
        <span>Older<span className="ramp">{RAMP.map((o) => <i key={o} style={{ background: 'var(--series-1)', opacity: o }} />)}</span>Newer</span>
        <span>Up and to the left = faster at a lower heart rate</span>
      </div>
    </div>
  )
}
