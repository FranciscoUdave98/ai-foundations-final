import { fmtPace } from '../../format'
import type { PaceHrPoint } from '../../types'

/** Easy vs hard runs, split by heart rate: one bar for the mix, two tiles for what each kind looks like. */
export function EffortMix({ points }: { points: PaceHrPoint[] }) {
  const pts = points.filter((p) => p.avg_hr > 0 && p.pace_s_per_km > 0)
  if (pts.length < 4) return <p className="caption">Not enough heart-rate data yet.</p>
  const maxHr = Math.max(...pts.map((p) => p.avg_hr))
  const cut = maxHr * 0.88   // above ~88% of the hardest average: a hard run
  const hard = pts.filter((p) => p.avg_hr >= cut)
  const easy = pts.filter((p) => p.avg_hr < cut)
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
  const easyPct = Math.round((easy.length / pts.length) * 100)
  const tile = (label: string, cls: string, xs: PaceHrPoint[]) => (
    <div className={`em-tile ${cls}`}>
      <span className="em-label">{label}</span>
      <strong>{xs.length ? fmtPace(avg(xs.map((p) => p.pace_s_per_km))).replace('/km', '') : '—'}<small>/km</small></strong>
      <span>{xs.length ? `${Math.round(avg(xs.map((p) => p.avg_hr)))} bpm · ${xs.length} runs` : 'none yet'}</span>
    </div>
  )
  return (
    <div className="effort-mix">
      <div className="em-bar" role="img" aria-label={`${easyPct}% easy runs, ${100 - easyPct}% hard runs`}>
        <span className="easy" style={{ width: `${easyPct}%` }}>{easyPct}% easy</span>
        <span className="hard" style={{ width: `${100 - easyPct}%` }}>{100 - easyPct > 8 ? `${100 - easyPct}% hard` : ''}</span>
      </div>
      <div className="em-tiles">
        {tile('Easy runs', 'easy', easy)}
        {tile('Hard runs', 'hard', hard)}
      </div>
      <p className="dm-foot">{easyPct >= 75 ? 'Mostly easy, the way coaches like it.' : 'Lots of hard running: the plan adds more easy days.'}</p>
    </div>
  )
}
