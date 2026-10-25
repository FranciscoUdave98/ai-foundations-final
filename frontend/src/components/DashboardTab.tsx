import { useEffect, useState } from 'react'
import { api } from '../api'
import { addDays, fmtDay, mondayOf } from '../format'
import type { Dashboard, LoadZone } from '../types'
import { CalendarHeatmap } from './charts/CalendarHeatmap'
import { EfficiencyLine } from './charts/EfficiencyLine'
import { PaceHrScatter } from './charts/PaceHrScatter'
import { VolumeBars } from './charts/VolumeBars'
import { Info } from '../glossary'
import { useUnits } from '../units'
import { TodayCard } from './TodayCard'

type Range = 'all' | '12w' | '8w' | 'custom'

const ZONES: Record<LoadZone, { color: string; icon: string; label: string; note: string }> = {
  low: { color: 'var(--muted)', icon: '↓', label: 'Low', note: 'Training less than usual' },
  'sweet spot': { color: 'var(--good)', icon: '✓', label: 'Sweet spot', note: 'Building safely' },
  caution: { color: 'var(--warning)', icon: '!', label: 'Caution', note: 'Load rising fast' },
  danger: { color: 'var(--critical)', icon: '✕', label: 'Danger', note: 'Injury risk; back off' },
  'no data': { color: 'var(--muted)', icon: '–', label: 'No data', note: 'Need 4 weeks of runs' },
}

export function DashboardTab({ initial, planKey, embedded }: { initial: Dashboard; planKey?: string; embedded?: boolean }) {
  const [data, setData] = useState(initial)
  const [range, setRange] = useState<Range>('all')
  const [start, setStart] = useState(initial.first_day)
  const [end, setEnd] = useState(initial.as_of)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTable, setShowTable] = useState(false)
  const latest = initial.as_of
  const earliest = initial.first_day

  useEffect(() => { setData(initial); setRange('all'); setStart(initial.first_day); setEnd(initial.as_of) }, [initial])

  function load(s: string, e: string) {
    setLoading(true)
    setError(null)
    api.dashboard(s, e).then(setData).catch((err) => setError(String(err.message ?? err))).finally(() => setLoading(false))
  }

  function pickRange(r: Range) {
    setRange(r)
    if (r === 'custom') return
    // Presets start on a Monday so the first week's bar is a full week.
    const s = r === 'all' ? earliest : mondayOf(addDays(latest, r === '12w' ? -77 : -49))
    setStart(s)
    setEnd(latest)
    load(s < earliest ? earliest : s, latest)
  }

  const k = data.kpis
  const zone = ZONES[k.load.zone]
  const ratio = k.load.ratio ?? 0
  const pin = Math.min(2, ratio) / 2 * 100
  const best = Object.fromEntries(data.best_efforts.map((b) => [b.distance, b]))
  const u = useUnits()
  const plain = plainLines(data, u.dist)

  return (
    <div>
      {embedded ? (
        <p className="data-line">{data.total_runs} runs from {fmtDay(data.first_day, true)} to {fmtDay(data.as_of, true)}. Computed in code, no AI.</p>
      ) : (
        <div className="page-head">
          <div>
            <h1>Dashboard</h1>
            <p>{data.total_runs} runs from {fmtDay(data.first_day, true)} to {fmtDay(data.as_of, true)}. Every number here is computed in code, no AI.</p>
          </div>
        </div>
      )}

      <TodayCard planKey={planKey} />

      <div className="filters" role="group" aria-label="Date range">
        <div className="seg">
          {([['all', 'All data'], ['12w', 'Last 12 weeks'], ['8w', 'Last 8 weeks'], ['custom', 'Custom']] as const).map(([id, label]) => (
            <button key={id} aria-pressed={range === id} onClick={() => pickRange(id)}>{label}</button>
          ))}
        </div>
        {range === 'custom' && (
          <>
            <label className="date-in">From <input type="date" value={start} min={earliest} max={end} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="date-in">To <input type="date" value={end} min={start} max={latest} onChange={(e) => setEnd(e.target.value)} /></label>
            <button className="btn btn-primary" onClick={() => load(start, end)}>Apply</button>
          </>
        )}
        <span className="as-of">KPIs as of {fmtDay(data.as_of, true)}</span>
      </div>

      {error && <div className="error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      <div className={loading ? 'refetching' : undefined}>
        <div className="kpis">
          <div className="card kpi">
            <div className="label">Last 7 days <Info term="weekly_km" /></div>
            <div className="value">{u.num(k.this_week_km)}<small>{u.unit}</small></div>
            <div className="sub">{plain.week}</div>
          </div>
          <div className="card kpi">
            <div className="label">4-week average <Info term="weekly_km" /></div>
            <div className="value">{u.num(k.four_week_avg_km)}<small>{u.unit} / week</small></div>
            <div className="sub">Your usual week right now. Plans start near this, not above it.</div>
          </div>
          <div className="card kpi">
            <div className="label">Longest run (12 weeks) <Info term="long_run" /></div>
            <div className="value">{u.num(k.longest_run_km)}<small>{u.unit}</small></div>
            <div className="sub">The plan's first long runs grow from this, about 10% at a time.</div>
          </div>
          <div className={`card kpi zone-${k.load.zone.replace(' ', '-')}`} data-highlight="load_ratio">
            <div className="label">Training load <Info term="load_ratio" /></div>
            <div className="value">{k.load.ratio?.toFixed(2) ?? '—'}</div>
            <div className="zone-meter" aria-hidden="true">
              <span style={{ background: 'var(--muted)' }} />
              <span style={{ background: 'var(--good)' }} />
              <span style={{ background: 'var(--warning)' }} />
              <span style={{ background: 'var(--critical)' }} />
              {k.load.ratio !== null && <i className="pin" style={{ left: `${pin}%` }} />}
            </div>
            <div className="zone-scale" aria-hidden="true"><span>0</span><span>0.8</span><span>1.3 1.5</span><span>2.0</span></div>
            <div className="sub"><span className="status"><i style={{ background: zone.color }} />{zone.icon} {zone.label}</span> · {zone.note}</div>
            {plain.load && <div className="sub plain">{plain.load}</div>}
          </div>
        </div>

        <div className="row-2">
          <section className="card" data-highlight="predictions">
            <div className="card-head">
              <div>
                <h2>Predicted race times <Info term="predictions" /></h2>
                <div className="card-sub">If you raced today</div>
              </div>
            </div>
            <div className="preds">
              {k.predictions.map((p) => (
                <div className={`pred${p.distance === 'Marathon' ? ' goal' : ''}`} key={p.distance}>
                  <div className="d">{p.distance}</div>
                  <div className="t">{p.time}</div>
                  <div className="p">{p.pace}</div>
                </div>
              ))}
            </div>
            {plain.predictions && <p className="plain">{plain.predictions}</p>}
            <div className="basis">{k.prediction_basis}</div>
          </section>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Best efforts</h2>
                <div className="card-sub">Fastest whole run per distance</div>
              </div>
            </div>
            <table className="data">
              <thead><tr><th>Distance</th><th className="num">Best</th><th className="num">Pace</th><th className="num">Date</th><th className="num">Predicted</th></tr></thead>
              <tbody>
                {k.predictions.map((p) => {
                  const found = best[p.distance]
                  const b = found?.hard_effort ? found : undefined
                  return (
                    <tr key={p.distance}>
                      <td>{p.distance}{found && !found.hard_effort && <span className="no-effort">No hard effort at this distance yet</span>}</td>
                      <td className="num">{b?.time ?? '—'}</td>
                      <td className="num">{b?.pace ?? '—'}</td>
                      <td className="num">{b ? fmtDay(b.day) : '—'}</td>
                      <td className="num">{p.time}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        </div>

        {data.fun.length > 0 && (
          <section className="fun-section" aria-label="Your running, translated" data-highlight="fun_stats">
            <h2>Your running, translated <Info term="fun_stats" /></h2>
            <div className="fun-grid">
              {data.fun.map((f) => (
                <div className="card fun" key={f.id} title={f.basis}>
                  <span className="fun-emoji" aria-hidden="true">{f.emoji}</span>
                  <div>
                    <div className="fun-title">{f.title}</div>
                    <div className="fun-value">{f.value}</div>
                    <div className="fun-detail">{f.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="row-2b">
          <section className="card" data-highlight="weekly_km">
            <div className="card-head">
              <div>
                <h2>Weekly {u.unit === 'mi' ? 'miles' : 'kilometers'} <Info term="weekly_km" /></h2>
                <div className="card-sub">Peak and latest weeks labelled</div>
              </div>
              <button className="btn-link" onClick={() => setShowTable((v) => !v)}>{showTable ? 'Show chart' : 'Show table'}</button>
            </div>
            {showTable ? (
              <div className="table-scroll">
                <table className="data">
                  <thead><tr><th>Week of</th><th className="num">km</th><th className="num">Runs</th><th className="num">Long run</th><th className="num">Minutes</th></tr></thead>
                  <tbody>
                    {[...data.weekly].reverse().map((w) => (
                      <tr key={w.week_start}><td>{fmtDay(w.week_start, true)}</td><td className="num">{w.km.toFixed(1)}</td><td className="num">{w.runs}</td><td className="num">{w.long_run_km.toFixed(1)}</td><td className="num">{Math.round(w.minutes)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <VolumeBars weeks={data.weekly} asOf={data.as_of} />}
            {plain.weekly && <p className="plain">{plain.weekly}</p>}
          </section>
          <section className="card" data-highlight="training_calendar">
            <div className="card-head">
              <div>
                <h2>Training calendar <Info term="calendar" /></h2>
                <div className="card-sub">Brighter means more distance</div>
              </div>
            </div>
            <CalendarHeatmap days={data.daily} />
            {plain.calendar && <p className="plain">{plain.calendar}</p>}
          </section>
        </div>

        <div className="row-2b">
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Pace vs heart rate <Info term="easy_pace" /></h2>
                <div className="card-sub">Each dot is one run</div>
              </div>
            </div>
            <PaceHrScatter points={data.pace_hr} />
          </section>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Aerobic efficiency <Info term="aerobic_efficiency" /></h2>
                <div className="card-sub">Higher means fitter</div>
              </div>
            </div>
            <EfficiencyLine weeks={data.efficiency} />
            {plain.efficiency && <p className="plain">{plain.efficiency}</p>}
          </section>
        </div>
      </div>
    </div>
  )
}

/** One plain-English sentence per card, from the same numbers the charts show. */
function plainLines(d: Dashboard, dist: (km: number, digits?: number) => string) {
  const k = d.kpis
  const diff = k.four_week_avg_km ? (k.this_week_km / k.four_week_avg_km - 1) * 100 : 0
  const week = Math.abs(diff) < 5 ? `About your usual ${dist(k.four_week_avg_km, 0)}`
    : `${Math.abs(diff).toFixed(0)}% ${diff > 0 ? 'more' : 'less'} than your usual ${dist(k.four_week_avg_km, 0)}`
  const r = k.load.ratio
  const load = r === null ? null
    : r > 1.5 ? `${r.toFixed(2)}× your usual: ease off`
    : r > 1.3 ? `${r.toFixed(2)}× your usual: hold steady`
    : r >= 0.8 ? `${r.toFixed(2)}× your usual: room to build`
    : `${r.toFixed(2)}× your usual: a light week`
  const marathon = k.predictions.find((p) => p.distance === 'Marathon')
  const half = k.predictions.find((p) => p.distance === 'Half Marathon')
  const predictions = marathon && half ? `Half ${half.time} · marathon ${marathon.time}, if trained for it` : null
  const full = d.weekly.slice(0, -1)
  const peak = full.reduce<typeof full[number] | null>((a, w) => (!a || w.km > a.km ? w : a), null)
  const last = full[full.length - 1]
  const weekly = peak && last ? `Peak ${dist(peak.km, 0)} (${fmtDay(peak.week_start)}) · last week ${dist(last.km, 0)}` : null
  const runDays = d.daily.filter((x) => x.km > 0).length
  const weeks = Math.max(1, d.daily.length / 7)
  const calendar = d.daily.length ? `Ran ${runDays} of ${d.daily.length} days · ${(runDays / weeks).toFixed(1)} a week` : null
  const eff = d.efficiency.filter((e) => e.meters_per_beat > 0)
  const change = eff.length >= 4 ? (eff[eff.length - 1].meters_per_beat / eff[0].meters_per_beat - 1) * 100 : null
  const efficiency = change === null ? null : Math.abs(change) < 2 ? 'About the same as when your data starts'
    : `${Math.abs(change).toFixed(0)}% ${change > 0 ? 'more' : 'less'} ground per heartbeat than at the start`
  return { week, load, predictions, weekly, calendar, efficiency }
}
