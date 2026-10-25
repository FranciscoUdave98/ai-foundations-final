import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Dashboard, ParseReport, SampleAthlete } from '../types'

interface Props {
  onLoaded: (d: Dashboard) => Promise<void>
  hasData: boolean
  goDashboard: () => void
}

const ACCEPT = '.zip,.csv,.fit,.gpx,.gz'

export function StartTab({ onLoaded, hasData, goDashboard }: Props) {
  const [busy, setBusy] = useState<'sample' | 'upload' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<ParseReport | null>(null)
  const [over, setOver] = useState(false)
  const [units, setUnits] = useState<'km' | 'mi'>('km')
  const [files, setFiles] = useState<File[]>([])
  const input = useRef<HTMLInputElement>(null)
  const [athletes, setAthletes] = useState<SampleAthlete[]>([])
  const [athlete, setAthlete] = useState('athlete_a')

  useEffect(() => { api.samples().then(setAthletes).catch(() => {}) }, [])

  async function run(kind: 'sample' | 'upload', job: () => Promise<Dashboard>) {
    setBusy(kind)
    setError(null)
    try {
      const d = await job()
      setReport(d.report)
      await onLoaded(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  function pick(list: FileList | null) {
    const chosen = Array.from(list ?? [])
    if (!chosen.length) return
    setFiles(chosen)
    void run('upload', () => api.upload(chosen, units))
  }

  return (
    <div>
      <div className="hero">
        <section className="hero-main">
          <h1>Your AI coaching staff</h1>
          <p>
            Upload your running history, pick a race near you, and watch a council of AI coaches
            build your plan from your real data.
          </p>
          <button className="btn-hero" disabled={busy !== null} onClick={() => run('sample', () => api.useSample(athlete))}>
            {busy === 'sample' ? 'Loading sample…' : 'Use sample data'}
          </button>
          {athletes.length > 1 && (
            <div className="athletes" role="radiogroup" aria-label="Sample athlete">
              {athletes.map((a) => (
                <button key={a.id} role="radio" aria-checked={athlete === a.id} onClick={() => setAthlete(a.id)} title={a.goal}>
                  {a.label.replace(/ \(.*\)$/, '')}
                </button>
              ))}
            </div>
          )}
          <span className="hero-hint">6 months of anonymized runs. You're on the dashboard in seconds.</span>
          <svg className="runner" aria-hidden="true"><use href="#pl-runner" /></svg>
        </section>

        <section
          className={`drop${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files) }}
          aria-label="Upload your running export"
        >
          <h2>Or drop your own export here</h2>
          <div className="formats">Strava export .zip or activities.csv · Garmin Activities.csv or .fit · any .gpx</div>
          <div>
            <button className="btn btn-primary" disabled={busy !== null} onClick={() => input.current?.click()}>
              {busy === 'upload' ? 'Reading files…' : 'Choose files'}
            </button>
            <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => pick(e.target.files)} />
          </div>
          <div className="units" role="group" aria-label="Distance units in a Garmin CSV">
            {(['km', 'mi'] as const).map((u) => (
              <button key={u} aria-pressed={units === u} onClick={() => setUnits(u)}>Garmin CSV in {u}</button>
            ))}
          </div>
          {files.length > 0 && <div className="file-list">{files.map((f) => f.name).join(', ')}</div>}
          <div className="formats">Files stay on this computer's backend. Activity names, notes and GPS tracks are dropped.</div>
        </section>
      </div>

      {error && <div className="error" role="alert" style={{ marginTop: 16 }}>{error}</div>}

      {report && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <h2>Import report</h2>
            {hasData && <button className="btn-link" onClick={goDashboard}>Open dashboard →</button>}
          </div>
          <div className="report">
            <span><strong>{report.runs_found}</strong> runs loaded</span>
            <span><strong>{report.files_read}</strong> files read</span>
            <span><strong>{report.skipped_non_runs}</strong> non-run activities skipped</span>
            <span><strong>{report.skipped_bad_rows}</strong> unreadable rows</span>
            <span><strong>{report.duplicates_removed}</strong> duplicates removed</span>
          </div>
          {report.warnings.map((w) => <p key={w} className="muted">⚠ {w}</p>)}
        </div>
      )}

      <div className="how">
        <div className="card">
          <h3>Strava</h3>
          <ol>
            <li>Settings → My Account → Download or Delete Your Account</li>
            <li>Request your archive; Strava emails a .zip</li>
            <li>Drop the .zip here as it is</li>
          </ol>
        </div>
        <div className="card">
          <h3>Garmin Connect</h3>
          <ol>
            <li>Activities → All Activities → Export CSV</li>
            <li>Or open one activity → ⚙ → Export Original (.fit)</li>
            <li>Pick km or mi to match your Garmin units</li>
          </ol>
        </div>
        <div className="card">
          <h3>Why upload, not log in?</h3>
          <ol>
            <li>Strava's API terms don't allow sending API data to AI</li>
            <li>Graders can't use your login</li>
            <li>Your own export file avoids both</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
