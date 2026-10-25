import { useState } from 'react'
import { addDays, fmtDay, monthShort, niceTicks } from '../../format'
import type { WeekVolume } from '../../types'
import { Tooltip, barPath, monthLabelIndexes, useWidth, type TipState } from './common'

const H = 220
const M = { top: 22, right: 8, bottom: 26, left: 34 }

/** Weekly km, one series. Labels: the peak week and the latest week only. */
export function VolumeBars({ weeks, asOf }: { weeks: WeekVolume[]; asOf: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const innerW = width - M.left - M.right
  const innerH = H - M.top - M.bottom
  const max = Math.max(10, ...weeks.map((w) => w.km))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const band = innerW / Math.max(1, weeks.length)
  const barW = Math.max(3, Math.min(24, band - 2))
  const y = (v: number) => M.top + innerH - (v / top) * innerH
  const peak = weeks.reduce((best, w, i) => (w.km > weeks[best].km ? i : best), 0)
  const last = weeks.length - 1
  const partial = (w: WeekVolume) => addDays(w.week_start, 6) > asOf
  const monthAt = monthLabelIndexes(weeks.map((w) => w.week_start), (i) => M.left + i * band + band / 2)

  return (
    <div className="chart" ref={ref} onPointerLeave={() => { setTip(null); setHover(null) }}>
      <svg width={width} height={H} role="img" aria-label="Weekly kilometers bar chart">
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'baseline' : 'gridline'} x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} />
            <text className="tick" x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end">{t}</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const x = M.left + i * band + (band - barW) / 2
          const h = M.top + innerH - y(w.km)
          const showLabel = i === peak || i === last
          const firstOfMonth = monthAt.has(i)
          return (
            <g key={w.week_start}>
              <path d={barPath(x, y(w.km), barW, h)} fill={hover === i ? 'var(--series-1-hover)' : showLabel ? 'var(--brand)' : 'var(--series-1)'}
                opacity={partial(w) ? 0.55 : 1} />
              {showLabel && w.km > 0 && (
                <text className="label-strong" x={x + barW / 2} y={y(w.km) - 6} textAnchor="middle">{Math.round(w.km)}</text>
              )}
              {firstOfMonth && (
                <text x={M.left + i * band + band / 2} y={H - 8} textAnchor="middle">{monthShort(w.week_start)}</text>
              )}
              <rect x={M.left + i * band} y={M.top} width={band} height={innerH} fill="transparent" tabIndex={0}
                aria-label={`Week of ${fmtDay(w.week_start)}: ${w.km} km`}
                onPointerMove={() => {
                  setHover(i)
                  setTip({
                    x: x + barW / 2, y: y(w.km),
                    content: (
                      <>
                        <div className="tv">{w.km.toFixed(1)} km</div>
                        <div className="tl">Week of {fmtDay(w.week_start, true)}{partial(w) ? ' (so far)' : ''}</div>
                        <div className="tl">{w.runs} runs · long run {w.long_run_km.toFixed(1)} km · {Math.round(w.minutes)} min</div>
                      </>
                    ),
                  })
                }}
                onFocus={() => { setHover(i); setTip({ x: x + barW / 2, y: y(w.km), content: <div className="tv">{w.km.toFixed(1)} km</div> }) }}
                onBlur={() => { setHover(null); setTip(null) }}
              />
            </g>
          )
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  )
}
