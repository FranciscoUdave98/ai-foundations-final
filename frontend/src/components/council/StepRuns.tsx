import { Check } from 'lucide-react'
import { CoachSays } from '../CoachSays'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { AppState, Dashboard, SampleAthlete } from '../../types'
import { toast } from '../../ui'
import { useUnits } from '../../units'
import { RouteLoader } from '../RouteLoader'

// The preloaded runners: a name a person would use, a level, and a goal in a few words.
export const SAMPLE: Record<string, { title: string; emoji: string; img: string; level: string; tag: string; stat: string; goal: string; order: number }> = {
  athlete_b: { title: 'The first-timer', emoji: '🌱', img: 'first-timer', level: 'beginner', tag: 'Beginner', stat: 'Just started · 2–3 short runs a week', goal: 'Finish a first 5K', order: 1 },
  athlete_c: { title: 'The weekend runner', emoji: '🌤️', img: 'weekend-runner', level: 'mid', tag: 'Intermediate', stat: '3–4 runs a week · ~30 km', goal: 'Half marathon under 1:45', order: 2 },
  athlete_a: { title: 'The Boston chaser', emoji: '🏃', img: 'boston-chaser', level: 'pro', tag: 'Advanced', stat: '5 runs a week · ~60 km', goal: 'Sub-3 hour marathon', order: 4 },
  athlete_d: { title: 'The marathon rookie', emoji: '🏅', img: 'alternate-runner', level: 'exp', tag: 'Experienced', stat: '4 runs a week · ~45 km', goal: 'First marathon under 4:00', order: 3 },
}
const VERDICT: Record<string, { icon: string; text: string }> = {
  'sweet spot': { icon: '✅', text: 'Steady, consistent training. A great base to build on.' },
  caution: { icon: '⚡', text: 'Ramping up fast lately, so the coaches will start gently.' },
  danger: { icon: '🛑', text: 'A big jump in the last weeks, so week 1 will be lighter.' },
  low: { icon: '🌙', text: 'A quiet few weeks, so the plan rebuilds step by step.' },
}
const SHORT: Record<string, string> = { '5K': '5K', '10K': '10K', 'Half Marathon': 'Half marathon', Marathon: 'Marathon' }

/** Step 1: pick whose runs to use (a sample runner or your own file), then three big numbers about them. */
export function StepRuns({ state, onData, busy, goData }: {
  state: AppState | null; onData: (d: Dashboard) => void; busy: boolean; goData: () => void
}) {
  const u = useUnits()
  const [athletes, setAthletes] = useState<SampleAthlete[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { api.samples().then(setAthletes).catch(() => {}) }, [])
  const a = state?.athlete
  // Never an empty page: with no runs loaded yet, preselect the Boston chaser.
  const preselected = useRef(false)
  useEffect(() => {
    if (preselected.current || a || busy || !athletes.some((x) => x.id === 'athlete_a')) return
    preselected.current = true
    load(() => api.useSample('athlete_a'), 'athlete_a')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athletes, a, busy])

  async function load(job: () => Promise<Dashboard>, label: string) {
    setLoading(label)
    try {
      const d = await job()
      onData(d)
      toast(`Loaded ${d.total_runs} runs`)
    } catch (e) {
      toast(`Couldn't read that file. ${e instanceof Error && e.message.length < 60 ? e.message : 'Try a Strava .zip or Garmin .csv.'}`, 'error')
    } finally { setLoading(null) }
  }
  const upload = (files: File[]) => { if (files.length) load(() => api.upload(files, 'km'), 'upload') }
  const off = busy || !!loading
  const own = !!a && !SAMPLE[a.id]
  const pred = a ? a.predictions[a.goal_distance] : null

  return (
    <div className="runs-step" id="card-runs">
      <CoachSays id="monk">{a
        ? `Nice pick! ${SAMPLE[a.id] ? SAMPLE[a.id].title.replace(/^The /, 'The ') : 'Your history'}: ${a.runs} runs logged. Hit Next and the Race Scout finds you a race.`
        : "Hi, I'm your Head Coach! Pick a runner to try PaceLab, or upload your own runs from Strava or Garmin."}</CoachSays>
      <div className="runner-grid sample-list" role="radiogroup" aria-label="Choose a runner">
        {[...athletes].sort((x, y) => (SAMPLE[x.id]?.order ?? 9) - (SAMPLE[y.id]?.order ?? 9)).map((x) => {
          const m = SAMPLE[x.id]
          const on = a?.id === x.id
          return (
            <button key={x.id} type="button" role="radio" aria-checked={on} className={`sample runner${on ? ' on' : ''}`} disabled={off}
              onClick={() => load(() => api.useSample(x.id), x.id)}>
              <span className="runner-check" aria-hidden="true">{loading === x.id ? <RouteLoader size="sm" /> : on ? <Check size={18} strokeWidth={3} /> : null}</span>
              <span className="runner-av" aria-hidden="true">{m ? <img src={`/pacekit-png/runners/${m.img}.png`} alt=""
                onError={(e) => { e.currentTarget.replaceWith(Object.assign(document.createElement('span'), { className: 'runner-emoji', textContent: m.emoji })) }} /> : '🏃'}</span>
              {m && <span className={`runner-tag lvl-${m.level}`}>{m.tag}</span>}
              <strong>{m?.title ?? x.label}</strong>
              <span className="runner-level">{m?.stat}</span>
              <span className="runner-goal">Goal: {m?.goal ?? x.goal}</span>
            </button>
          )
        })}
        <button type="button" className={`runner own${drag ? ' drag' : ''}${own ? ' on' : ''}`} disabled={off}
          onClick={() => file.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload(Array.from(e.dataTransfer.files)) }}>
          <span className="runner-check" aria-hidden="true">{own ? <Check size={18} strokeWidth={3} /> : null}</span>
          <span className="runner-av" aria-hidden="true">{loading === 'upload' ? <RouteLoader size="sm" /> : <img src="/pacekit-png/runners/upload-runs.png" alt="" />}</span>
          <span className="runner-tag lvl-own">You</span>
          <strong>Use my own runs</strong>
          <span className="own-desc">Get a plan built from <b>your real runs</b>. In Garmin Connect, open Activities and press <b>Export CSV</b>, then tap here to upload the file.</span>
        </button>
        <input ref={file} type="file" hidden multiple accept=".zip,.csv,.fit,.gpx,.gz"
          onChange={(e) => { upload(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      </div>

      {a && (
        <section className="learned card" aria-label="What the runs say">
          <div className="learned-top">
            <h2>{SAMPLE[a.id] ? `${SAMPLE[a.id].title} at a glance` : 'Your runs at a glance'}</h2>
            {VERDICT[a.load_zone] && <p className="learned-verdict"><span aria-hidden="true">{VERDICT[a.load_zone].icon}</span> {VERDICT[a.load_zone].text}</p>}
            <button className="btn-text" onClick={goData}>See all the charts →</button>
          </div>
          <div className="learned-tiles three">
            <div><span>Runs logged</span><strong>{a.runs}</strong><em>last 6 months</em></div>
            <div><span>Usual week</span><strong>{u.num(a.avg_week_km, 0)}<small>{u.unit}</small></strong><em>{a.runs_per_week.toFixed(1)} runs a week</em></div>
            {pred && <div className="hi"><span>{SHORT[a.goal_distance] ?? a.goal_distance} today</span><strong>{pred}</strong><em>estimated finish</em></div>}
          </div>
        </section>
      )}
    </div>
  )
}
