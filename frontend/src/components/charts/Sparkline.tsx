/** A tiny trend line for a stat tile: one 2px series, the latest point marked. Decorative; the tile states the number. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null
  const W = 120, H = 36, P = 4
  const lo = Math.min(...values), hi = Math.max(...values)
  const x = (i: number) => P + (i / (values.length - 1)) * (W - 2 * P)
  const y = (v: number) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${d} L${x(values.length - 1)},${H} L${x(0)},${H} Z`
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={area} className="spark-area" />
      <path d={d} className="spark-line" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3.5} className="spark-dot" />
    </svg>
  )
}
