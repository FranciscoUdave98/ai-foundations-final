import { CalendarRange, ClipboardList, Compass, Dumbbell, HeartPulse, ShieldCheck, Timer, type LucideIcon } from 'lucide-react'
import type { Persona } from './types'

/** How each agent shows up on screen: a plain job title anyone understands first, the voice-pack character second. */
export interface Agent { id: Persona; title: string; nick: string; short: string; job: string; icon: LucideIcon; ai: boolean }

export const AGENTS: Record<Persona, Agent> = {
  monk: { id: 'monk', title: 'Head Coach', nick: 'Marathon Monk', short: 'Leads the team', icon: ClipboardList, ai: true,
    job: 'Runs the meeting. Hands out the work and signs off the final plan.' },
  whisperer: { id: 'whisperer', title: 'Race Scout', nick: 'Course Whisperer', short: 'Finds your race', icon: Compass, ai: true,
    job: 'Reads race listings near you and recommends the races that fit.' },
  wallbreaker: { id: 'wallbreaker', title: 'Plan Builder', nick: 'Sgt. Wall-Breaker', short: 'Writes the weeks', icon: CalendarRange, ai: true,
    job: 'Writes the weeks: how far to run each day, and how fast.' },
  taper: { id: 'taper', title: 'Injury Guard', nick: 'Dr. Taper', short: 'Prevents injuries', icon: HeartPulse, ai: true,
    job: 'A physio. Says no to any week that ramps up too fast for your body.' },
  kickstarter: { id: 'kickstarter', title: 'Race-Day Planner', nick: 'Kickstarter', short: 'Plans race day', icon: Timer, ai: true,
    job: 'Plans the race itself: target pace, when to eat and drink, the last easy weeks.' },
  guru: { id: 'guru', title: 'Strength Coach', nick: 'Glute Guru', short: 'Adds gym work', icon: Dumbbell, ai: true,
    job: 'Adds short gym sessions that make running easier and safer.' },
  marshal: { id: 'marshal', title: 'Safety Checker', nick: 'Course Marshal', short: 'Fixed safety rules', icon: ShieldCheck, ai: false,
    job: 'Not AI: fixed rules in code that every plan must pass, like no big jumps in distance.' },
}

// Francisco's coach portraits (public/pacekit-png/coaches); the line icon is the fallback if one fails to load.
const PORTRAIT: Record<Persona, string> = {
  monk: 'head-coach', whisperer: 'race-scout', wallbreaker: 'plan-builder', taper: 'injury-guard',
  kickstarter: 'race-day', guru: 'strength-coach', marshal: 'safety-checker',
}

/** The agent's portrait in a ring of its own color. */
export function AgentIcon({ id, size = 'md' }: { id: Persona; size?: 'sm' | 'md' | 'lg' }) {
  const a = AGENTS[id]
  const Icon = a.icon
  const px = size === 'sm' ? 14 : size === 'lg' ? 28 : 18
  return (
    <span className={`agent-icon ai-${size}${a.ai ? '' : ' is-code'}`} style={{ '--agent': `var(--agent-${id})` } as React.CSSProperties} aria-hidden="true">
      <img src={`/pacekit-png/coaches/${PORTRAIT[id]}.png`} alt="" loading="lazy"
        onError={(e) => { e.currentTarget.style.display = 'none'; (e.currentTarget.nextSibling as HTMLElement | null)?.removeAttribute('hidden') }} />
      <span className="ai-fallback" hidden><Icon size={px} strokeWidth={2.2} /></span>
    </span>
  )
}

/** The four section graphics (public/pacekit-png/icons). Decorative: tabs keep their text labels. */
export function NavIcon({ name }: { name: 'council' | 'plan' | 'data' | 'safety' | 'demo' | 'slides' | 'report' }) {
  return <img className="nav-icon" src={name === 'demo' ? '/pacekit-png/loading/shoe-mascot.png' : `/pacekit-png/icons/${name}.png`} alt="" width={22} height={22} />
}
