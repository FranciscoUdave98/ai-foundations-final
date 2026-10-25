import { CalendarCheck, Footprints, MapPin, MessagesSquare, Play, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { Dashboard, Persona, SampleAthlete, Voices } from '../../types'
import { toast } from '../../ui'

const COACHES: { id: Persona; job: string }[] = [
  { id: 'monk', job: 'Runs the debate' },
  { id: 'wallbreaker', job: 'Builds the weeks' },
  { id: 'taper', job: 'Blocks injury risk' },
  { id: 'kickstarter', job: 'Plans race day' },
  { id: 'guru', job: 'Adds strength work' },
  { id: 'whisperer', job: 'Scouts your race first' },
]
const RUNNER: Record<string, string> = { athlete_a: 'Sub-3 marathoner', athlete_b: 'First 5K', athlete_c: 'Sub-1:45 half' }
const STEPS = [
  { icon: Footprints, text: 'Your runs' },
  { icon: MapPin, text: 'A race near you' },
  { icon: MessagesSquare, text: '5 coaches debate' },
  { icon: CalendarCheck, text: 'Your plan' },
]

/** First visit: one promise, one button, how it works, who the coaches are. */
export function Landing({ voices, onDemo, onData, busy }: {
  voices: Voices | null; onDemo: () => void; onData: (d: Dashboard) => void; busy: string | null
}) {
  const [athletes, setAthletes] = useState<SampleAthlete[]>([])
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { api.samples().then(setAthletes).catch(() => {}) }, [])
  const meta = (id: Persona) => voices?.personas.find((p) => p.id === id)

  async function load(job: () => Promise<Dashboard>) {
    try { onData(await job()) } catch { toast("Couldn't read that file. Try a Strava .zip or Garmin .csv.", 'error') }
  }

  return (
    <div className="landing">
      <section className="landing-hero">
        <h1>Your race plan,<br /><span>argued out by 5 AI coaches.</span></h1>
        <p>Pick a runner and watch them build a safe plan, live.</p>
        <div className="landing-cta">
          <button className="btn btn-primary btn-hero-cta" onClick={onDemo} disabled={!!busy}>
            <Play size={22} aria-hidden="true" />
            <span><strong>{busy ?? 'Watch the 1-minute demo'}</strong><small>About $0.007 of AI</small></span>
          </button>
          <button className="btn-text" onClick={() => file.current?.click()} disabled={!!busy}>
            <Upload size={16} aria-hidden="true" /> Use my own runs
          </button>
          <input ref={file} type="file" hidden multiple accept=".zip,.csv,.fit,.gpx,.gz"
            onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) load(() => api.upload(f, 'km')) }} />
        </div>
        {athletes.length > 0 && (
          <p className="landing-alt">Or pick a sample runner:
            {athletes.map((a) => (
              <button key={a.id} className="chip-btn" disabled={!!busy} title={a.label}
                onClick={() => load(() => api.useSample(a.id))}>{RUNNER[a.id] ?? a.id}</button>
            ))}
          </p>
        )}
      </section>

      <ol className="landing-steps" aria-label="How it works">
        {STEPS.map((s, i) => (
          <li key={s.text}><span className="step-icon"><s.icon size={22} aria-hidden="true" /></span><span>{s.text}</span>{i < STEPS.length - 1 && <i aria-hidden="true">→</i>}</li>
        ))}
      </ol>

      <section className="landing-coaches" aria-label="Meet the coaches">
        <h2>Meet the coaches</h2>
        <div className="coach-row">
          {COACHES.map((c) => (
            <div key={c.id} className={`coach${c.id === 'monk' ? ' lead' : ''}${c.id === 'whisperer' ? ' scout' : ''}`} style={{ '--agent': `var(--agent-${c.id})` } as React.CSSProperties}>
              <span className="coach-av" aria-hidden="true">{meta(c.id)?.emoji}</span>
              <strong>{meta(c.id)?.name.replace(/^The /, '') ?? c.id}</strong>
              <span>{c.job}</span>
            </div>
          ))}
        </div>
        <p className="landing-foot">A code rule-checker has the final word on safety. Every AI call is priced on Cost &amp; Safety.</p>
      </section>
    </div>
  )
}
