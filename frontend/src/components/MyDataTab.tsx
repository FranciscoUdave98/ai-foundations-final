import { BarChart3 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { AppState, Dashboard, ParseReport, SampleAthlete } from '../types'
import { DashboardTab } from './DashboardTab'

/** My Data: switch athlete or upload an export, then the full dashboard. */
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
    <div>
      <div className="page-head">
        <div>
          <h1>My Data</h1>
          <p>Your runs, measured in code</p>
        </div>
      </div>

      <section className={`card data-source${over ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files) }}>
        <div className="athletes" role="group" aria-label="Sample athletes">
          {athletes.map((a) => (
            <button key={a.id} aria-pressed={state?.athlete?.id === a.id} disabled={!!busy} title={a.goal}
              onClick={() => run(a.id, () => api.useSample(a.id))}>{busy === a.id ? 'Loading…' : a.label.replace(/ \(.*\)$/, '')}</button>
          ))}
        </div>
        <div className="upload-row">
          <button className="btn" onClick={() => file.current?.click()} disabled={!!busy}>{busy === 'upload' ? 'Reading files…' : 'Upload your export'}</button>
          <input ref={file} type="file" hidden multiple accept=".zip,.csv,.fit,.gpx,.gz" onChange={(e) => upload(e.target.files)} />
          <div className="units" role="group" aria-label="Distance units in a Garmin CSV">
            {(['km', 'mi'] as const).map((u) => <button key={u} aria-pressed={units === u} onClick={() => setUnits(u)}>Garmin CSV in {u}</button>)}
          </div>
          <span className="muted small">or drop files here · names, notes and GPS tracks are dropped</span>
        </div>
        <details className="export-help">
          <summary>How to export from Strava or Garmin</summary>
          <div className="how">
            <div><h3>Strava</h3><ol><li>Settings → My Account → Download or Delete Your Account</li><li>Request your archive; Strava emails a .zip</li><li>Upload the .zip as it is</li></ol></div>
            <div><h3>Garmin Connect</h3><ol><li>Activities → All Activities → Export CSV</li><li>Or open one activity → ⚙ → Export Original (.fit)</li><li>Pick km or mi to match your Garmin units</li></ol></div>
            <div><h3>Why upload, not log in?</h3><ol><li>Strava's API terms don't allow sending API data to AI</li><li>Graders can't use your login</li><li>Your own export file avoids both</li></ol></div>
          </div>
        </details>
        {error && <div className="error" role="alert">{error}</div>}
        {report && <p className="muted small">Loaded {report.runs_found} runs from {report.files_read} file(s); skipped {report.skipped_non_runs} non-runs, {report.duplicates_removed} duplicates.</p>}
      </section>

      {dashboard ? <DashboardTab initial={dashboard} planKey={planKey} embedded /> : (
        <div className="empty-state"><BarChart3 size={32} aria-hidden="true" /><p>No runs yet.</p><button className="btn btn-primary" onClick={() => run('athlete_a', () => api.useSample('athlete_a'))}>Load Athlete A</button></div>
      )}
    </div>
  )
}
