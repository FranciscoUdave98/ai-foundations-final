import type { PlanView } from '../types'
import { type WeekKind, weekKinds } from '../planSummary'

const NAME: Record<WeekKind, string> = { base: 'Base', build: 'Build', cutback: 'Lighter', taper: 'Taper', race: 'Race' }

/** Weekly volume, one bar per week. Phases are labelled under the bars (no legend); the peak week is the one highlight. */
export function PhaseBars({ view, height = 72, labels = true, unit, conv }: {
  view: PlanView; height?: number; labels?: boolean; unit: string; conv: (km: number) => number
}) {
  const weeks = weekKinds(view)
  const max = Math.max(...weeks.map((w) => w.km), 1)
  const peakIdx = weeks.findIndex((w) => w.km === max)
  // Runs of the same phase (cutbacks count as part of the phase around them) for the labels underneath.
  const phases: { kind: WeekKind; from: number; to: number }[] = []
  weeks.forEach((w, i) => {
    const k = w.kind === 'cutback' ? (phases[phases.length - 1]?.kind ?? 'base') : w.kind
    const last = phases[phases.length - 1]
    if (last && last.kind === k) last.to = i
    else phases.push({ kind: k, from: i, to: i })
  })
  const n = weeks.length
  return (
    <figure className="phase-bars" aria-label={`Weekly volume over ${n} weeks, peak ${Math.round(conv(max))} ${unit}`}>
      <div className="pb-bars" style={{ height }}>
        {weeks.map((w, i) => (
          <span key={w.index} className={`pb-bar k-${w.kind}${i === peakIdx ? ' peak' : ''}`} style={{ height: `${Math.max(4, (w.km / max) * 100)}%` }}
            title={`W${w.index} · ${NAME[w.kind]} · ${Math.round(conv(w.km))} ${unit}`}>
            {labels && i === peakIdx && <b className="pb-peak">{Math.round(conv(w.km))} {unit}</b>}
          </span>
        ))}
      </div>
      {labels && (
        <div className="pb-labels" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {phases.map((p) => (
            <span key={p.from} style={{ gridColumn: `${p.from + 1} / ${p.to + 2}` }}>{p.to - p.from >= 1 || n < 12 ? NAME[p.kind] : ''}</span>
          ))}
        </div>
      )}
    </figure>
  )
}
