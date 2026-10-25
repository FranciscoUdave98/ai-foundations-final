import { ArrowRight, CalendarDays, RotateCcw, Upload } from 'lucide-react'
import { AGENTS, AgentIcon } from '../../agents'
import { startOver } from './Stepper'
import type { Persona } from '../../types'

const TEAM: Persona[] = ['monk', 'whisperer', 'wallbreaker', 'taper', 'kickstarter', 'guru', 'marshal']

// The example plan on the right: 16 weeks that build, drop back every 4th week and taper.
const EX_WEEKS = [30, 33, 36, 29, 38, 41, 44, 34, 46, 49, 52, 40, 54, 44, 34, 22]
const EX_DAYS: [string, string, string][] = [
  ['Mon', 'Rest', ''], ['Tue', 'Easy', '8'], ['Wed', 'Tempo', '10'], ['Thu', 'Easy', '6'], ['Fri', 'Rest', ''], ['Sat', 'Easy', '5'], ['Sun', 'Long', '18'],
]
const EX_KIND: Record<string, string> = { Easy: 'easy', Tempo: 'tempo', Long: 'long', Rest: 'rest' }

// Why it's different: four big numbers, a few words each.
const STATS: { big: string; label: string; sub: string; hi?: boolean; img: string }[] = [
  { big: '6', label: 'AI coaches', sub: 'argue over your plan', hi: true, img: 'icons/council' },
  { big: '1 min', label: 'to a full plan', sub: 'from your runs to race day', img: 'features/stopwatch' },
  { big: '100%', label: 'injury-checked', sub: 'every single week', img: 'icons/safety' },
  { big: '1¢', label: 'or less per plan', sub: 'every AI call counted', img: 'features/low-cost' },
]
const HOW: { n: string; title: string; sub: string; out?: boolean; team?: boolean; img?: string }[] = [
  { n: '1', title: 'Your runs', sub: 'From your watch, or a sample', img: 'runners/boston-chaser' },
  { n: '2', title: 'Your race', sub: '5K to marathon, near you', img: 'features/race-finish' },
  { n: '3', title: 'AI coaches plan it', sub: 'Live, in about a minute', team: true },
  { n: '4', title: 'Your calendar', sub: 'What to run, every day', out: true, img: 'icons/plan' },
]

/** The landing page: one promise, one animated button (the guided demo), what makes it great, how it works, the team. */
export function Welcome({ onStart, onDemo, busy, resume, ready, goStep }: {
  onStart: () => void; onDemo: () => void; busy: boolean
  resume: { step: number; title: string } | null; ready: { race: string } | null; goStep: (n: number) => void
}) {
  const peak = Math.max(...EX_WEEKS)
  const cont = !ready && resume && resume.step > 1

  const ctas = (
    <div className="w-cta">
      <button className="btn btn-primary btn-demo-cta" onClick={onDemo} disabled={busy}>
        <img className="cta-mascot" src="/pacekit-png/runners/boston-chaser.png" alt="" />
        <span className="cta-badge" aria-hidden="true">FREE</span>
        <span><strong>Try the demo</strong><small>1 minute · we guide you, click by click</small></span>
        <ArrowRight size={20} aria-hidden="true" className="nudge" />
      </button>
      <button className="btn btn-outline btn-cta-2" onClick={onStart} disabled={busy}>
        {ready ? <CalendarDays size={16} aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
        <span>
          <strong>{ready ? 'Open my plan' : cont ? `Continue my plan: step ${resume!.step}` : 'Make a plan with my own runs'}</strong>
          <small>{ready ? `Your plan for ${ready.race}` : cont ? resume!.title : 'From your Strava or Garmin history'}</small>
        </span>
      </button>
    </div>
  )

  return (
    <div className="welcome">
      {ready && (
        <div className="welcome-back" role="status">
          <span>Welcome back. Your plan for <strong>{ready.race}</strong> is ready.</span>
          <button className="btn btn-outline btn-sm" onClick={() => goStep(5)}>Open my plan <ArrowRight size={14} aria-hidden="true" /></button>
          <button className="btn-text" onClick={startOver}>Start over</button>
        </div>
      )}

      <section className="w-hero">
        <div className="w-copy">
          <span className="eyebrow">AI running coach</span>
          <h1>Get a day-by-day running plan <span>for your next race.</span></h1>
          <p className="w-lede">
            Show it your runs, pick a race, and a team of AI coaches builds your calendar to race day.
          </p>
          {ctas}
          <div className="w-docs">
            <a href="#slides"><strong>Slides</strong><span>The 5-minute pitch</span></a>
            <a href="#report"><strong>Report</strong><span>How it works and what it costs</span></a>
          </div>
          <p className="w-note">No running data? The demo brings its own runner.{resume && !ready && <> · <button className="btn-text start-over" onClick={startOver}><RotateCcw size={14} aria-hidden="true" /> Start over</button></>}</p>
          <div className="w-proof">
            <span className="w-proof-faces" aria-hidden="true">{TEAM.slice(0, 6).map((id) => <AgentIcon key={id} id={id} size="sm" />)}</span>
            <span><strong>Built by 6 AI coaches</strong> · ready in about a minute · checked for injury risk</span>
          </div>
        </div>

        <figure className="w-preview card" aria-label="An example plan for a sample runner">
          <figcaption className="w-preview-tag">Example plan · sample runner</figcaption>
          <div className="w-preview-head">
            <div className="w-count">16<small>weeks to go</small></div>
            <div className="w-race">Hartford Half Marathon<span>A 13.1-mile race, 38 mi away</span></div>
          </div>
          <div>
            <svg className="w-bars" viewBox="0 0 320 96" aria-hidden="true">
              {EX_WEEKS.map((km, i) => {
                const h = (km / peak) * 80
                const kind = i >= 14 ? 'taper' : i > 0 && km < EX_WEEKS[i - 1] ? 'cutback' : km === peak ? 'peak' : 'build'
                return <rect key={i} className={`wb ${kind}`} x={i * 20 + 2} y={88 - h} width="15" height={h} rx="3" />
              })}
            </svg>
            <p className="w-explain"><b>Each bar = one week.</b> Build up, recover, rest before race day.</p>
          </div>
          <div>
            <div className="w-week">
              {EX_DAYS.map(([d, t, k]) => (
                <div key={d} className={`w-day ${EX_KIND[t]}`}>
                  <span className="d">{d}</span>
                  <span className="t">{t}</span>
                  {k && <span className="k">{k}<small>km</small></span>}
                </div>
              ))}
            </div>
            <p className="w-explain"><b>Every day:</b> what to run, and how far.</p>
          </div>
          <div className="w-yours">
            <span>Just an example. <b>Yours comes from your own runs.</b></span>
            <button className="btn btn-outline btn-sm" onClick={onStart} disabled={busy}>Make mine <ArrowRight size={14} aria-hidden="true" /></button>
          </div>
        </figure>
      </section>

      <section aria-labelledby="coaches-title">
        <h2 className="w-h2" id="coaches-title">Meet your coaching team</h2>
        <div className="w-team-row">
          {TEAM.map((id) => {
            const a = AGENTS[id]
            return (
              <div key={id} className={`w-mate${a.ai ? '' : ' is-code'}`} title={a.job}>
                <AgentIcon id={id} size="lg" />
                <strong>{a.title}</strong>
                <span className="nick">{a.nick}</span>
                <span className="w-mate-job">{a.short}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="picture-title">
        <h2 className="w-h2" id="picture-title">How it works</h2>
        <ol className="w-flow">
          {HOW.map((h) => (
            <li key={h.n} className={`w-flow-step${h.out ? ' out' : ''}`}>
              {h.img ? <span className="w-flow-art"><img src={`/pacekit-png/${h.img}.png`} alt="" /><b>{h.n}</b></span> : <span className="w-flow-n">{h.n}</span>}
              <div>
                <strong>{h.title}</strong>
                <span>{h.sub}</span>
                {h.team && <span className="io-team" aria-hidden="true">{(['monk', 'wallbreaker', 'taper', 'kickstarter', 'guru'] as Persona[]).map((id) => <AgentIcon key={id} id={id} size="sm" />)}</span>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="why-title">
        <h2 className="w-h2" id="why-title">Why it's different</h2>
        <div className="w-stats">
          {STATS.map((x) => (
            <div key={x.label} className={`w-stat${x.hi ? ' hi' : ''}`}>
              <img className="w-stat-art" src={`/pacekit-png/${x.img}.png`} alt="" />
              <span className="w-big">{x.big}</span>
              <strong>{x.label}</strong>
              <span>{x.sub}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
