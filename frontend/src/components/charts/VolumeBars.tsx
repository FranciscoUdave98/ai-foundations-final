import { useState } from 'react'
import { addDays, fmtDay, monthShort, niceTicks } from '../../format'
import type { WeekVolume } from '../../types'
import { Tooltip, barPath, monthLabelIndexes, useWidth, type TipState } from './common'

const M = { top: 24, right: 12, bottom: 28, left: 36 }

/** Weekly km as bars, the 4-week average as a dashed line on the same axis. Labels: the peak and latest weeks only. */
export function VolumeBars({ weeks, asOf, height = 260 }: { weeks: WeekVolume[]; asOf: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const H = height

  const innerW = width - M.left - M.right
  const innerH = H - M.top - M.bottom
  const max = Math.max(10, ...weeks.map((w) => w.km))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const band = innerW / Math.max(1, weeks.length)
  const barW = Math.max(3, Math.min(28, band - 4))
  const y = (v: number) => M.top + innerH - (v / top) * innerH
  const cx = (i: number) => M.left + i * band + band / 2
  const peak = weeks.reduce((best, w, i) => (w.km > weeks[best].km ? i : best), 0)
  const last = weeks.length - 1
  const partial = (w: WeekVolume) => addDays(w.week_start, 6) > asOf
  const monthAt = monthLabelIndexes(weeks.map((w) => w.week_start), cx)
  // 4-week rolling average, from the 4th week on.
  const avg = weeks.map((_, i) => (i < 3 ? null : weeks.slice(i - 3, i + 1).reduce((a, w) => a + w.km, 0) / 4))
  const avgPath = avg.map((v, i) => (v === null ? '' : `${avg[i - 1] == null ? 'M' : 'L'}${cx(i).toFixed(1)},${y(v).toFixed(1)}`)).join(' ')

  return (
    <div className="chart" ref={ref} onPointerLeave={() => { setTip(null); setHover(null) }}>
      <svg width={width} height={H} role="img" aria-label="Weekly distance bar chart with a 4-week average line">
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'baseline' : 'gridline'} x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} />
            <text className="tick" x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{t}</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const x = M.left + i * band + (band - barW) / 2
          const h = M.top + innerH - y(w.km)
          const key = i === peak || i === last
          return (
            <g key={w.week_start}>
              <path d={barPath(x, y(w.km), barW, h)} fill={hover === i ? 'var(--series-1-hover)' : key ? 'var(--brand)' : 'var(--series-1)'}
                opacity={partial(w) ? 0.55 : hover !== null && hover !== i ? 0.6 : 1} />
              {key && w.km > 0 && <text className="label-strong" x={cx(i)} y={y(w.km) - 7} textAnchor="middle">{Math.round(w.km)}</text>}
              {monthAt.has(i) && <text className="tick" x={cx(i)} y={H - 8} textAnchor="middle">{monthShort(w.week_start)}</text>}
            </g>
          )
        })}
        <path d={avgPath} className="avg-line" />
        {weeks.map((w, i) => (
          <rect key={`hit-${w.week_start}`} x={M.left + i * band} y={M.top} width={band} height={innerH} fill="transparent" tabIndex={0}
            aria-label={`Week of ${fmtDay(w.week_start)}: ${w.km.toFixed(1)} km`}
            onPointerMove={() => {
              setHover(i)
              setTip({
                x: cx(i), y: y(w.km),
                content: (
                  <>
                    <div className="tv">{w.km.toFixed(1)} km</div>
                    <div className="tl">Week of {fmtDay(w.week_start, true)}{partial(w) ? ' (so far)' : ''}</div>
                    <div className="tl">{w.runs} runs · longest {w.long_run_km.toFixed(1)} km{avg[i] != null ? ` · 4-wk avg ${avg[i]!.toFixed(0)}` : ''}</div>
                  </>
                ),
              })
            }}
            onFocus={() => { setHover(i); setTip({ x: cx(i), y: y(w.km), content: <div className="tv">{w.km.toFixed(1)} km</div> }) }}
            onBlur={() => { setHover(null); setTip(null) }} />
        ))}
      </svg>
      <Tooltip tip={tip} />
    </div>
  )
}
