import type { LoadZone } from '../../types'

// Training load zones on a 0–2× scale. Status colors, always paired with a label and an icon.
const ZONES: { from: number; to: number; color: string }[] = [
  { from: 0, to: 0.8, color: 'var(--axis)' },
  { from: 0.8, to: 1.3, color: 'var(--good)' },
  { from: 1.3, to: 1.5, color: 'var(--warning)' },
  { from: 1.5, to: 2, color: 'var(--critical)' },
]
export const ZONE_LABEL: Record<LoadZone, { icon: string; text: string; color: string }> = {
  low: { icon: '↓', text: 'Light', color: 'var(--ink-2)' },
  'sweet spot': { icon: '✓', text: 'Sweet spot', color: 'var(--good)' },
  caution: { icon: '!', text: 'Ramping fast', color: 'var(--warning)' },
  danger: { icon: '✕', text: 'Too much', color: 'var(--critical)' },
  'no data': { icon: '–', text: 'No data yet', color: 'var(--ink-2)' },
}

const CX = 100, CY = 96, R = 78
const pt = (v: number, r = R) => {
  const a = Math.PI * (1 - Math.min(2, Math.max(0, v)) / 2)
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)] as const
}

/** A half-dial: four zones, a needle at this week's load. */
export function LoadGauge({ ratio, zone }: { ratio: number | null; zone: LoadZone }) {
  const z = ZONE_LABEL[zone]
  const [nx, ny] = pt(ratio ?? 0, R - 18)
  return (
    <svg className="gauge" viewBox="0 0 200 110" role="img" aria-label={`Training load ${ratio?.toFixed(2) ?? 'unknown'} times your usual: ${z.text}`}>
      {ZONES.map((s) => {
        const [x1, y1] = pt(s.from + 0.02)
        const [x2, y2] = pt(s.to - 0.02)
        return <path key={s.from} d={`M${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2}`} className="gauge-arc" style={{ stroke: s.color }} />
      })}
      {ratio !== null && (
        <>
          <line x1={CX} y1={CY} x2={nx} y2={ny} className="gauge-needle" />
          <circle cx={CX} cy={CY} r={6} className="gauge-hub" />
        </>
      )}
      <text x={CX - R} y={CY + 14} textAnchor="middle" className="gauge-tick">0</text>
      <text x={CX} y={CY - R - 8} textAnchor="middle" className="gauge-tick">1×</text>
      <text x={CX + R} y={CY + 14} textAnchor="middle" className="gauge-tick">2×</text>
    </svg>
  )
}
