import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { AppState, Dashboard, SampleAthlete } from '../../types'

/** ① Your runs: one compact card before any data; a summary once data is loaded. */
export function RunsStep({ state, onData, onDemo, busy, goData, next }: {
  state: AppState | null; onData: (d: Dashboard) => void; onDemo: () => void; busy: boolean; goData: () => void; next: () => void
}) {
  const [athletes, setAthletes] = useState<SampleAthlete[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { api.samples().then(setAthletes).catch(() => {}) }, [])

  async function load(job: () => Promise<Dashboard>, label: string) {
    setLoading(label); setError(null)
    try { onData(await job()); next() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setLoading(null) }
  }

  return (
    <section className="card step-card runs-step">
      <div className="runs-hero">
        <div>
          <h1 className="hero-title">Your AI coaching staff</h1>
          <p className="lede">PaceLab reads your running history, finds a race near you, and a council of AI coaches debates your training plan live, inside hard safety rules.</p>
          <div className="runs-actions">
            <button className="btn-hero" onClick={onDemo} disabled={busy || !!loading}>Run the full demo <span className="btn-note">about $0.007, 1 min</span></button>
            {state?.athlete && <button className="btn" onClick={next}>Continue with {state.athlete.label} →</button>}
          </div>
          <div className="athletes" role="group" aria-label="Sample athletes">
            {athletes.map((a) => (
              <button key={a.id} aria-pressed={state?.athlete?.id === a.id} onClick={() => load(() => api.useSample(a.id), a.id)} disabled={busy || !!loading} title={a.goal}>
                {loading === a.id ? 'Loading…' : a.label.replace(/ \(.*\)$/, '')}
              </button>
            ))}
          </div>
          <button className="btn-link" onClick={() => file.current?.click()} disabled={busy || !!loading}>Upload your export (Strava .zip, Garmin .csv/.fit, .gpx)</button>
          <input ref={file} type="file" hidden multiple accept=".zip,.csv,.fit,.gpx,.gz"
            onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) load(() => api.upload(f, 'km'), 'upload') }} />
          {error && <div className="error" role="alert" style={{ marginTop: 10 }}>{error}</div>}
          <p className="muted small">The full dashboard of your runs lives in <button className="btn-link" onClick={goData}>My Data</button>.</p>
        </div>
        <svg className="runner" aria-hidden="true"><use href="#pl-runner" /></svg>
      </div>
    </section>
  )
}
