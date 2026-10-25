import { BarChart3, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { AppState, Dashboard, ParseReport, SampleAthlete } from '../types'
import { SAMPLE } from './council/StepRuns'
import { DashboardTab } from './DashboardTab'

/** My Data: whose runs (a sample runner or your own file), then the dashboard. */
export function MyDataTab({ dashboard, state, onData, planKey }: {
  dashboard: Dashboard | null; state: AppState | null; onData: (d: Dashboard) => void; planKey?: string
}) {
  const [athletes, setAthletes] = useState<SampleAthlete[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<ParseReport | null>(null)
  const [units, setUnits] = useState<'km' | 'mi'>('km')
  const [over, setOver] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { api.samples().then(setAthletes).catch(() => {}) }, [])

  async function run(label: string, job: () => Promise<Dashboard>) {
    setBusy(label); setError(null)
    try { const d = await job(); setReport(d.report); onData(d) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
  }
  const upload = (list: FileList | null) => {
    const f = Array.from(list ?? [])
    if (f.length) run('upload', () => api.upload(f, units))
  }

  return (
    <div className={over ? 'data-page over' : 'data-page'}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files) }}>
      <div className="data-head">
        <h1>My Data</h1>
        <div className="data-who" role="group" aria-label="Whose runs">
          {athletes.map((a) => (
            <button key={a.id} className="chip-btn" aria-pressed={state?.athlete?.id === a.id} disabled={!!busy} title={a.goal}
              onClick={() => run(a.id, () => api.useSample(a.id))}>
              {SAMPLE[a.id] && <img className="chip-runner" src={`/pacekit-png/runners/${SAMPLE[a.id].img}.png`} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />} {busy === a.id ? 'Loading…' : SAMPLE[a.id]?.title.replace(/^The /, '') ?? a.label}
            </button>
          ))}
          <button className="btn btn-outline btn-sm" onClick={() => file.current?.click()} disabled={!!busy}>
            <Upload size={14} aria-hidden="true" /> {busy === 'upload' ? 'Reading…' : 'Upload my runs'}
          </button>
          <input ref={file} type="file" hidden multiple accept=".zip,.csv,.fit,.gpx,.gz" onChange={(e) => upload(e.target.files)} />
          <details className="data-help">
            <summary>How?</summary>
            <div className="data-help-pop">
              <p><strong>Strava:</strong> Settings → My Account → Download your archive. Upload the .zip.</p>
              <p><strong>Garmin:</strong> Activities → Export CSV. Its distances are in
                <select value={units} onChange={(e) => setUnits(e.target.value as 'km' | 'mi')} aria-label="Garmin CSV units"><option value="km">km</option><option value="mi">miles</option></select>
              </p>
              <p className="muted small">Or drop files anywhere on this page. Names, notes and GPS tracks are never kept.</p>
            </div>
          </details>
        </div>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {report && <p className="muted small">Loaded {report.runs_found} runs · skipped {report.skipped_non_runs} non-runs, {report.duplicates_removed} duplicates.</p>}

      {dashboard ? <DashboardTab initial={dashboard} planKey={planKey} goal={state?.athlete?.goal_distance} athleteId={state?.athlete?.id} /> : (
        <div className="empty-state"><BarChart3 size={32} aria-hidden="true" /><p>No runs yet.</p><button className="btn btn-primary" onClick={() => run('athlete_a', () => api.useSample('athlete_a'))}>Load the Boston chaser</button></div>
      )}
    </div>
  )
}
