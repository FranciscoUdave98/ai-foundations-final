import { Play, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { Info } from '../../glossary'
import type { AppState, Dashboard, SampleAthlete } from '../../types'
import { Skel, toast } from '../../ui'
import { useUnits } from '../../units'

/** Your runs: sample athletes, upload, and 3 numbers. Before any data it holds the demo button. */
export function RunsCard({ state, loaded, onData, onDemo, busy }: {
  state: AppState | null; loaded: boolean; onData: (d: Dashboard) => void; onDemo: () => void; busy: boolean
}) {
  const u = useUnits()
  const [athletes, setAthletes] = useState<SampleAthlete[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { api.samples().then(setAthletes).catch(() => {}) }, [])
  const a = state?.athlete

  async function load(job: () => Promise<Dashboard>, label: string) {
    setLoading(label)
    try {
      const d = await job()
      onData(d)
      toast(`Runs loaded: ${d.total_runs} runs`)
    } catch (e) {
      toast(`Couldn't read that file. ${e instanceof Error && e.message.length < 60 ? e.message : 'Try a Strava .zip or Garmin .csv.'}`, 'error')
    } finally { setLoading(null) }
  }

  const zone = a?.load_zone ?? 'no data'
  const predicted = state?.predicted_for_target ?? (a ? a.predictions[a.goal_distance] : null)
  return (
    <section className="card setup-card" id="card-runs" aria-labelledby="runs-title">
      <div className="setup-head"><h2 id="runs-title">Your runs</h2></div>
      {!loaded ? <div className="skel-stack"><Skel h={40} /><Skel h={28} /><Skel h={56} /></div> : (
        <>
          {!a && (
            <button className="btn btn-primary btn-demo" onClick={onDemo} disabled={busy}>
              <Play size={18} aria-hidden="true" />
              <span><strong>Run the full demo</strong><small>About $0.007 · 1 minute</small></span>
            </button>
          )}
          <div className="chips" role="group" aria-label="Sample athletes">
            {athletes.map((x, i) => (
              <button key={x.id} className="chip-btn" aria-pressed={a?.id === x.id} disabled={busy || !!loading}
                title={x.label} onClick={() => load(() => api.useSample(x.id), x.id)}>
                {loading === x.id ? 'Loading' : `Athlete ${String.fromCharCode(65 + i)}`}
              </button>
            ))}
          </div>
          <button className="btn-text" onClick={() => file.current?.click()} disabled={busy || !!loading}>
            <Upload size={15} aria-hidden="true" /> {loading === 'upload' ? 'Reading files' : 'Upload your export'}
          </button>
          <input ref={file} type="file" hidden multiple accept=".zip,.csv,.fit,.gpx,.gz"
            onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) load(() => api.upload(f, 'km'), 'upload') }} />
          {a && (
            <div className="mini-stats">
              <div><span>Avg week</span><strong>{u.num(a.avg_week_km, 0)}<small>{u.unit}</small></strong></div>
              <div className={`zone-${zone.replace(' ', '-')}`}>
                <span>Training load <Info term="load_ratio" /></span>
                <strong>{a.load_ratio?.toFixed(2) ?? '—'}×</strong><em>your usual</em>
              </div>
              <div><span>Predicted <Info term="predictions" /></span><strong className="time">{predicted ?? '—'}</strong></div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
