import { useEffect, useState } from 'react'
import { fmtDay } from '../format'
import type { Dashboard } from '../types'
import { CalendarHeatmap } from './charts/CalendarHeatmap'
import { EfficiencyLine } from './charts/EfficiencyLine'
import { EffortMix } from './charts/EffortMix'
import { ZONE_LABEL } from './charts/LoadGauge'
import { VolumeBars } from './charts/VolumeBars'
import { CoachSays } from './CoachSays'
import { SAMPLE } from './council/StepRuns'
import { Info } from '../glossary'
import { useUnits } from '../units'

const FUN_IMG: Record<string, string> = { big_mac: 'burger', ice_cream: 'ice-cream', world: 'globe', central_park: 'park', everest: 'elevation', binge: 'duration' }

// What each fun number means, as a sentence: lead + number + unit ("Calories burned = 105 Big Macs").
const FUN_WORDS: Record<string, { lead: string; unit: string }> = {
  big_mac: { lead: 'Calories burned =', unit: 'Big Macs' },
  ice_cream: { lead: 'Or, in dessert:', unit: 'scoops of ice cream' },
  world: { lead: "You've run", unit: 'of the way around the Earth' },
  central_park: { lead: 'Same distance as', unit: 'laps of Central Park' },
  boston_nyc: { lead: 'Same distance as', unit: 'Boston to New York trips' },
  route_66: { lead: "You've run", unit: 'of Route 66' },
  everest: { lead: 'Your total climbing =', unit: 'Mount Everests' },
  binge: { lead: 'Time spent running:', unit: 'instead of watching TV' },
}

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
  const recent = data.weekly.slice(-9, -1)
  const recentMax = Math.max(1, ...recent.map((w) => w.km))
  const totalKm = data.weekly.reduce((n, w) => n + w.km, 0)
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

      <div className="d3-stats">
        <div className="card d3s">
          <div className="d3s-head"><img src="/pacekit-png/data/weekly-distance.png" alt="" /><span>How much you run <Info term="weekly_km" /></span></div>
          <div className="d3s-value">{u.num(k.four_week_avg_km, 0)}<small>{u.unit} a week</small></div>
          <div className="d3s-bars" role="img" aria-label={`Weekly distance, last ${recent.length} weeks`}>
            {recent.map((w, n) => (
              <span key={w.week_start} className={n === recent.length - 1 ? 'last' : ''} style={{ height: `${Math.max(6, (w.km / recentMax) * 100)}%` }}
                title={`Week of ${fmtDay(w.week_start)}: ${u.dist(w.km, 0)}`} />
            ))}
          </div>
          <span className="d3s-foot">Your usual week · last {recent.length} weeks shown</span>
        </div>
        <div className="card d3s goal">
          <div className="d3s-head"><img src="/pacekit-png/project/race-goal.png" alt="" /><span>{SHORT[goalDist] ?? goalDist} time if you raced today <Info term="predictions" /></span></div>
          <div className="d3s-value">{goalPred?.time ?? '—'}</div>
          <div className="d3s-pills">
            <span><img src="/pacekit-png/data/pace.png" alt="" /><b>{goalPred?.pace ? u.pace(goalPred.pace) : '—'}</b>race pace</span>
            <span><img src="/pacekit-png/week/long-run.png" alt="" /><b>{u.dist(k.longest_run_km, 0)}</b>longest run</span>
          </div>
          <span className="d3s-foot">Predicted from your best recent effort</span>
        </div>
        <div className={`card d3s load zone-${k.load.zone.replace(' ', '-')}`} data-highlight="load_ratio">
          <div className="d3s-head"><img src="/pacekit-png/data/training-load.png" alt="" /><span>Is this week too much? <Info term="load_ratio" /></span></div>
          <div className="d3s-value">{k.load.ratio != null ? `${k.load.ratio.toFixed(2)}×` : '—'}<em className="d3s-chip" style={{ '--z': zone.color } as React.CSSProperties}>{zone.icon} {zone.text}</em></div>
          <div className="d3s-zones" aria-hidden="true">
            <div className="d3z-track">
              <i style={{ flex: 0.8 }} /><i className="ok" style={{ flex: 0.5 }} /><i className="warn" style={{ flex: 0.2 }} /><i className="bad" style={{ flex: 0.5 }} />
              {k.load.ratio != null && <b style={{ left: `${(Math.min(2, Math.max(0, k.load.ratio)) / 2) * 100}%` }} />}
            </div>
            <div className="d3z-labels"><span>easy</span><span>just right</span><span>risky</span></div>
          </div>
          <span className="d3s-foot">Last 7 days compared with your usual week</span>
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
        <section className="d3-fun" aria-labelledby="fun-title" data-highlight="fun_stats">
          <div className="d3f-head">
            <h2 id="fun-title">Your running, in everyday terms</h2>
            <span>All {data.total_runs} runs since {fmtDay(data.first_day)} · {u.dist(totalKm, 0)} in total</span>
          </div>
          <div className="d3f-grid">
            {data.fun.slice(0, 4).map((f) => {
              const w = FUN_WORDS[f.id]
              return (
                <div key={f.id} className="d2f" title={f.basis}>
                  {FUN_IMG[f.id] && <img src={`/pacekit-png/data/${FUN_IMG[f.id]}.png`} alt="" />}
                  <span className="d3f-lead">{w?.lead ?? f.title}</span>
                  <strong>{f.value.replace(/^about /, '~')}</strong>
                  <span className="d3f-unit">{w?.unit ?? f.detail}</span>
                </div>
              )
            })}
          </div>
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
