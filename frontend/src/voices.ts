// Scripted lines from data/agent_voices.json: free and instant, shown on SSE events until the
// agent's own voice_line arrives. Lines with a missing placeholder value are skipped, and no line
// repeats within the last 3 shown.
import type { CouncilEvent, Persona, Voices } from './types'

// Which line bucket an SSE event uses, per persona.
const EVENT_KEY: Record<string, string> = {
  run_started: 'agent_started',
  agent_started: 'agent_started',
  agent_thinking: 'agent_thinking',
  agent_done: 'agent_done',
  delegate: 'delegate',
  physio_veto: 'physio_veto',
  approve: 'approve',
  fix: 'fix',
  veto_reaction: 'veto_reaction',
  ruling: 'ruling',
  goal_check: 'goal_check',
  plan_ready: 'plan_ready',
  budget_stop: 'budget_stop',
  error: 'error',
  race_search_started: 'race_search_started',
  races_found: 'races_found',
  injection_seen: 'injection_seen',
}

// Scripted lines used in this run (never reused until the pool runs out), and the previous run's (avoided if possible).
const recent: string[] = []
const usedThisRun = new Set<string>()
const LAST_KEY = 'pacelab.voices.lastRun'
let lastRun = new Set<string>((() => { try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? '[]') as string[] } catch { return [] } })())

/** Call at the start of each council run. */
export function newVoiceRun() {
  if (usedThisRun.size) {
    lastRun = new Set(usedThisRun)
    try { localStorage.setItem(LAST_KEY, JSON.stringify([...lastRun].slice(-200))) } catch { /* storage full */ }
  }
  usedThisRun.clear()
  recent.length = 0
}

export function quoteText(v: Voices, id: string): string {
  const q = v.quotes.find((x) => x.id === id)
  return q ? `“${q.text}”` : ''
}

function fill(v: Voices, line: string, vars: Record<string, unknown>): string | null {
  let missing = false
  const out = line.replace(/\{([a-z_]+)(?::([a-z0-9_]+))?\}/g, (_, key: string, arg?: string) => {
    if (key === 'quote' && arg) return quoteText(v, arg) || ((missing = true), '')
    const val = vars[key]
    if (val === undefined || val === null || val === '') {
      missing = true
      return ''
    }
    return String(val)
  })
  return missing ? null : out
}

// Delegation lines address one council member by name; pick the line for the agent being called.
const ADDRESS: Partial<Record<Persona, string>> = {
  wallbreaker: 'Sergeant', taper: 'Taper', kickstarter: 'Kickstarter', guru: 'Guru', whisperer: 'Whisperer',
}

// Extra hand-off lines in the Head Coach's calm voice; each names its coach so the filter below still works.
const DELEGATE_MORE: Partial<Record<Persona, string[]>> = {
  wallbreaker: [
    'Sergeant, your turn. Build the weeks, and keep the easy days easy.',
    'Sergeant, start near the usual week. Then climb, one step at a time.',
    'Sergeant, a draft please. Patience first, glory later.',
    'Sergeant, once more. Lighter where the doctor pointed.',
  ],
  taper: [
    'Dr. Taper, read the ramp. Say no if it is too much.',
    'Taper, check every week for the body that has to run them.',
    'Dr. Taper, one more look. Did we fix what you flagged?',
    'Taper, the stamp is on your desk. Use it if you must.',
  ],
  kickstarter: [
    'Kickstarter, plan the race itself. Pace, fuel, and a calm first mile.',
    'Kickstarter, the last weeks are yours. Bring them home rested.',
    'Kickstarter, what does race morning look like?',
  ],
  guru: [
    'Guru, two short gym days. Strong legs, fresh long runs.',
    'Guru, find room for strength without stealing from the miles.',
    'Guru, keep it simple: a few moves that keep injuries away.',
  ],
}

/** A scripted line for this persona and event, or null if none fits. */
export function scriptedLine(v: Voices | null, persona: Persona, eventType: string, vars: Record<string, unknown> = {},
  addressee?: Persona): string | null {
  if (!v) return null
  // Checker results are the Monk's lines in the pack; the code layer speaks as the Marshal otherwise.
  const who = (eventType === 'checker_pass' || eventType === 'checker_fail') ? 'monk' : persona
  const key = EVENT_KEY[eventType] ?? eventType
  let pool = v.lines[who]?.[key] ?? []
  // The pack has one hand-off line per coach, so add a few more and the Head Coach doesn't repeat itself every run.
  if (key === 'delegate' && addressee && DELEGATE_MORE[addressee]) pool = [...pool, ...DELEGATE_MORE[addressee]!]
  const name = addressee && ADDRESS[addressee]
  if (name) pool = pool.filter((l) => l.includes(name))
  const all = pool.map((l) => fill(v, l, vars)).filter((l): l is string => !!l)
  // Prefer lines not used this run and not used last run; then not this run; then anything but the last few.
  const fresh = all.filter((l) => !usedThisRun.has(l) && !lastRun.has(l))
  const unused = all.filter((l) => !usedThisRun.has(l))
  const filled = fresh.length ? fresh : unused.length ? unused : all.filter((l) => !recent.includes(l))
  if (!filled.length) return null
  // Bubbles hold 100 characters on 2 lines and are never cut: use the lines that fit, else the shortest.
  const fits = filled.filter((l) => l.length <= 100)
  const candidates = fits.length ? fits : [filled.reduce((a, b) => (b.length < a.length ? b : a))]
  const line = candidates[Math.floor(Math.random() * candidates.length)]
  recent.push(line)
  usedThisRun.add(line)
  if (recent.length > 6) recent.shift()
  return line
}

/** Merge the run-wide vars with an event's own vars. */
export function eventVars(base: Record<string, unknown>, e: CouncilEvent): Record<string, unknown> {
  return { ...base, ...(e.vars ?? {}) }
}

/** Render {quote:id} tokens inside a live voice_line from an agent. */
export function renderQuotes(v: Voices | null, text: string): string {
  if (!v) return text
  return text.replace(/\{quote:([a-z0-9_]+)\}/g, (_, id: string) => quoteText(v, id))
}
