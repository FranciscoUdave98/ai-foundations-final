import { Play, Upload } from 'lucide-react'
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

/** First visit: what PaceLab is for, in pictures, with one button. */
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
      <section className="landing-top">
        <div className="landing-hero">
          <h1>Train for race day<br /><span>without guessing.</span></h1>
          <p>PaceLab reads your runs, finds a race near you and builds a week-by-week plan your body can handle.</p>
          <div className="landing-cta">
            <button className="btn btn-primary btn-hero-cta" onClick={onDemo} disabled={!!busy}>
              <Play size={22} aria-hidden="true" />
              <span><strong>See it build a plan</strong><small>1-minute demo · about $0.007</small></span>
            </button>
            <button className="btn-text" onClick={() => file.current?.click()} disabled={!!busy}>
              <Upload size={16} aria-hidden="true" /> Use my own runs
            </button>
            <input ref={file} type="file" hidden multiple accept=".zip,.csv,.fit,.gpx,.gz"
              onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) load(() => api.upload(f, 'km')) }} />
          </div>
          {athletes.length > 0 && (
            <p className="landing-alt">Or try a sample runner:
              {athletes.map((a) => (
                <button key={a.id} className="chip-btn" disabled={!!busy} title={a.label}
                  onClick={() => load(() => api.useSample(a.id))}>{RUNNER[a.id] ?? a.id}</button>
              ))}
            </p>
          )}
        </div>
      </section>

      <section className="what-row" aria-label="What PaceLab does">
        <div className="what">
          <svg className="ill" viewBox="0 0 240 96" aria-hidden="true">
            {[34, 46, 40, 58, 52, 66, 30, 72, 64, 80].map((h, i) => (
              <rect key={i} className={`bar${i === 9 ? ' hi' : ''}`} x={8 + i * 23} y={92 - h} width="16" height={h} rx="3" />
            ))}
          </svg>
          <h3>Reads your training</h3>
          <p>Strava or Garmin export in, your real weekly load out.</p>
        </div>
        <div className="what">
          <svg className="ill" viewBox="0 0 240 96" aria-hidden="true">
            <path className="line" d="M20 80 C 70 20, 120 90, 170 40 S 220 30, 220 30" />
            {[[20, 80], [95, 58], [150, 54]].map(([x, y]) => <circle key={x} className="dot" cx={x} cy={y} r="5" />)}
            <path className="pin" d="M210 6 a 14 14 0 0 1 14 14 c 0 12 -14 26 -14 26 s -14 -14 -14 -26 a 14 14 0 0 1 14 -14 z" />
            <circle className="pin-hole" cx="210" cy="20" r="5" />
          </svg>
          <h3>Finds a race near you</h3>
          <p>Real races, with enough weeks to get ready.</p>
        </div>
        <div className="what">
          <svg className="ill" viewBox="0 0 240 96" aria-hidden="true">
            {Array.from({ length: 21 }, (_, i) => {
              const kind = i === 20 ? 'race' : i % 7 === 6 ? 'long' : i % 7 === 2 ? 'tempo' : i % 7 === 0 || i % 7 === 4 ? '' : 'easy'
              return <rect key={i} className={`cell ${kind}`} x={8 + (i % 7) * 32} y={6 + Math.floor(i / 7) * 30} width="26" height="24" rx="5" />
            })}
          </svg>
          <h3>Plans every week</h3>
          <p>Easy days, long runs, a taper. Checked for injury risk.</p>
        </div>
      </section>

      <section className="landing-coaches" aria-label="Meet the coaches">
        <h2>Built by 5 AI coaches who argue it out</h2>
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
