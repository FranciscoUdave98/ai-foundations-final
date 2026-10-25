import { useEffect, useState } from 'react'
import { fmtDay } from '../format'
import type { Dashboard } from '../types'
import { CalendarHeatmap } from './charts/CalendarHeatmap'
import { EfficiencyLine } from './charts/EfficiencyLine'
import { EffortMix } from './charts/EffortMix'
import { LoadGauge, ZONE_LABEL } from './charts/LoadGauge'
import { Sparkline } from './charts/Sparkline'
import { VolumeBars } from './charts/VolumeBars'
import { CoachSays } from './CoachSays'
import { SAMPLE } from './council/StepRuns'
import { Info } from '../glossary'
import { useUnits } from '../units'

const FUN_IMG: Record<string, string> = { big_mac: 'burger', ice_cream: 'ice-cream', world: 'globe', central_park: 'park', everest: 'elevation', binge: 'duration' }

const SHORT: Record<string, string> = { '5K': '5K', '10K': '10K', 'Half Marathon': 'Half', Marathon: 'Marathon' }

/** My Data, simple: who this is and three big numbers, the weekly chart, two easy cards. Everything else folds away. */
export function DashboardTab({ initial, planKey, goal, athleteId }: {
  initial: Dashboard; planKey?: string; embedded?: boolean; goal?: string; athleteId?: string
}) {
  void planKey
  const [data, setData] = useState(initial)
  const u = useUnits()
  useEffect(() => { setData(initial) }, [initial])

  const k = data.kpis
  const zone = ZONE_LABEL[k.load.zone]
  const best = Object.fromEntries(data.best_efforts.filter((b) => b.hard_effort).map((b) => [b.distance, b]))
  const goalDist = goal && k.predictions.some((p) => p.distance === goal) ? goal : 'Marathon'
  const goalPred = k.predictions.find((p) => p.distance === goalDist)
  const eff = data.efficiency.filter((e) => e.meters_per_beat > 0)
  const effChange = eff.length >= 4 ? (eff[eff.length - 1].meters_per_beat / eff[0].meters_per_beat - 1) * 100 : null
  const runner = athleteId ? SAMPLE[athleteId] : undefined
  const verdict = k.load.zone === 'sweet spot' ? `Steady training at about ${u.dist(k.four_week_avg_km, 0)} a week. A great base to build on.`
    : k.load.zone === 'caution' ? `You've ramped up fast lately (${k.load.ratio?.toFixed(2)}× your usual), so the plan will start gently.`
    : k.load.zone === 'danger' ? `A big jump lately (${k.load.ratio?.toFixed(2)}× your usual): week 1 of the plan will be lighter.`
    : k.load.zone === 'low' ? 'A quiet few weeks, so the plan rebuilds step by step.' : 'A few more weeks of runs and I can read your training load.'

  return (
    <div className="dash2">
      <section className="d2-hero card">
        <div className="d2-who">
          {runner ? <img src={`/pacekit-png/runners/${runner.img}.png`} alt="" /> : <img src="/pacekit-png/runners/upload-runs.png" alt="" />}
          <div>
            <strong>{runner ? runner.title : 'Your runs'}</strong>
            <span>{data.total_runs} runs · {fmtDay(data.first_day)} – {fmtDay(data.as_of)}</span>
          </div>
        </div>
        <CoachSays id="taper">{verdict}</CoachSays>
      </section>

      <div className="d2-stats">
        <div className="card d2s">
          <img src="/pacekit-png/data/weekly-distance.png" alt="" />
          <span className="d2s-label">Usual week <Info term="weekly_km" /></span>
          <span className="d2s-value">{u.num(k.four_week_avg_km, 0)}<small>{u.unit}</small></span>
          <Sparkline values={data.weekly.slice(-12, -1).map((w) => w.km)} label="Weekly distance, last 12 weeks" />
        </div>
        <div className="card d2s goal">
          <img src="/pacekit-png/project/race-goal.png" alt="" />
          <span className="d2s-label">{SHORT[goalDist] ?? goalDist} if raced today <Info term="predictions" /></span>
          <span className="d2s-value">{goalPred?.time ?? '—'}</span>
          <span className="d2s-sub">{goalPred?.pace} · longest run {u.dist(k.longest_run_km, 0)}</span>
        </div>
        <div className={`card d2s load zone-${k.load.zone.replace(' ', '-')}`} data-highlight="load_ratio">
          <img src="/pacekit-png/data/training-load.png" alt="" />
          <span className="d2s-label">Training load <Info term="load_ratio" /></span>
          <div className="d2s-gauge"><LoadGauge ratio={k.load.ratio} zone={k.load.zone} /></div>
          <span className="d2s-status" style={{ color: zone.color }}>{k.load.ratio?.toFixed(2) ?? '—'}× · {zone.text}</span>
        </div>
      </div>

      <section className="card d2-chart" data-highlight="weekly_km">
        <div className="dm-head">
          <h2><img className="dash-ic" src="/pacekit-png/data/weekly-distance.png" alt="" />Every week of running</h2>
          <div className="dm-legend" aria-hidden="true">
            <span><i className="lg-bar" /> Week</span>
            <span><i className="lg-line" /> 4-week average</span>
          </div>
        </div>
        <VolumeBars weeks={data.weekly} asOf={data.as_of} height={260} />
      </section>

      <div className="d2-pair">
        <section className="card">
          <div className="dm-head"><h2><img className="dash-ic" src="/pacekit-png/data/heart-rate.png" alt="" />Easy vs hard</h2></div>
          <EffortMix points={data.pace_hr} />
        </section>
        <section className="card" data-highlight="predictions">
          <div className="dm-head"><h2><img className="dash-ic" src="/pacekit-png/data/personal-bests.png" alt="" />Race times today</h2></div>
          <ul className="d2-races">
            {k.predictions.map((p) => (
              <li key={p.distance} className={p.distance === goalDist ? 'goal' : ''}>
                <span className="d2r-d">{SHORT[p.distance] ?? p.distance}{p.distance === goalDist && <em>goal</em>}</span>
                <span className="d2r-t">{p.time}</span>
                <span className="d2r-best">{best[p.distance] ? `Best ${best[p.distance].time}` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {data.fun.length > 0 && (
        <section className="d2-fun" aria-label="Your running, translated" data-highlight="fun_stats">
          {data.fun.slice(0, 4).map((f) => (
            <div key={f.id} className="d2f" title={`${f.detail} · ${f.basis}`}>
              {FUN_IMG[f.id] && <img src={`/pacekit-png/data/${FUN_IMG[f.id]}.png`} alt="" />}
              <strong>{f.value}</strong>
              <span>{f.title}</span>
            </div>
          ))}
        </section>
      )}

      <details className="card d2-more">
        <summary><h2>More charts</h2><span className="caption">Every run on a calendar, and your fitness trend</span></summary>
        <div className="d2-more-body">
          <div data-highlight="training_calendar"><h3><img className="dash-ic" src="/pacekit-png/data/consistency.png" alt="" />Every run</h3><CalendarHeatmap days={data.daily} /></div>
          <div>
            <h3><img className="dash-ic" src="/pacekit-png/data/aerobic-efficiency.png" alt="" />Fitness trend <Info term="aerobic_efficiency" />{effChange !== null && <span className="dm-chip">{effChange >= 0 ? '+' : '−'}{Math.abs(effChange).toFixed(0)}% since the start</span>}</h3>
            <EfficiencyLine weeks={data.efficiency} />
          </div>
        </div>
      </details>

    </div>
  )
}
