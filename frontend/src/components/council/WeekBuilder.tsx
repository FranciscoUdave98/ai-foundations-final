import { ShieldAlert } from 'lucide-react'
import { AGENTS, AgentIcon } from '../../agents'
import { DAYS, type Day, parseTime, type Preferences } from '../../prefs'
import type { AppState } from '../../types'
import { toast } from '../../ui'
import { setUnits } from '../../units'
import type { PrefsState } from './PrefsCard'

const LEVELS: { id: Preferences['approach']; name: string; sub: string }[] = [
  { id: 'gentle', name: 'Gentle', sub: 'Slow and safe' },
  { id: 'balanced', name: 'Balanced', sub: 'Steady gains' },
  { id: 'ambitious', name: 'Ambitious', sub: 'Push the pace' },
]
const DAY_LONG: Record<Day, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }

/** Step 3 as a game: tap days to build the week, pick a difficulty, unlock badges. Same preferences underneath. */
export function WeekBuilder({ state, p, disabled }: { state: AppState | null; p: PrefsState; disabled: boolean }) {
  const prefs = p.prefs
  if (!prefs) return <section className="card week-builder" id="card-prefs"><p className="locked-line">Loading the runner's usual week…</p></section>
  const set = (patch: Partial<Preferences>) => p.setPrefs({ ...prefs, ...patch })
  const rest = prefs.rest_days
  const runs = 7 - rest.length

  const toggleDay = (d: Day) => {
    if (d === prefs.long_run_day) { toast('That\'s your long-run day. Make another day the long run first.'); return }
    if (rest.includes(d)) {
      const r = rest.filter((x) => x !== d)
      set({ rest_days: r, runs_per_week: 7 - r.length })
    } else {
      if (rest.length >= 4) { toast('Keep at least 3 runs a week.'); return }
      const r = DAYS.filter((x) => x === d || rest.includes(x))
      set({ rest_days: r, runs_per_week: 7 - r.length, gym_days: prefs.gym_days.filter((x) => x !== d) })
    }
  }
  const toggleGym = (d: Day) => {
    if (rest.includes(d)) return
    if (prefs.gym_days.includes(d)) set({ gym_days: prefs.gym_days.filter((x) => x !== d) })
    else if (prefs.gym_days.length >= 3) toast('Three gym days is the max.')
    else set({ gym_days: DAYS.filter((x) => x === d || prefs.gym_days.includes(x)) })
  }
  const setLong = (d: 'Sat' | 'Sun') => {
    const r = rest.filter((x) => x !== d)
    set({ long_run_day: d, rest_days: r, runs_per_week: 7 - r.length })
  }

  const badges = [
    { img: 'week/run', name: 'Consistent', how: '4+ runs a week', on: runs >= 4 },
    { img: 'week/rest', name: 'Recovery pro', how: '2+ rest days', on: rest.length >= 2 },
    { img: 'week/gym', name: 'Iron legs', how: 'At least 1 gym day', on: prefs.gym_days.length >= 1 },
    { img: 'week/gentle', name: 'Steady builder', how: 'Gentle or Balanced', on: prefs.approach !== 'ambitious' },
  ]
  const earned = badges.filter((b) => b.on).length
  const predicted = state?.predicted_for_target
  // The goal is set as a pace; the coaches still receive a finish time (pace × race distance).
  const raceKm = state?.target?.target_km ?? null
  const perUnit = prefs.units === 'mi' ? 1.609344 : 1
  const fmt = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60); return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}` }
  const predSec = predicted ? parseTime(predicted) : null
  // Goal pace is a slider around the runner's current race pace, so it can't be mistyped; off = the coaches set it.
  const basePace = predSec && raceKm ? (predSec / raceKm) * perUnit : 360 * perUnit
  const paceMin = Math.round((basePace * 0.8) / 5) * 5
  const paceMax = Math.round((basePace * 1.15) / 5) * 5
  const goalSec = parseTime(p.goal)
  const hasGoal = !!goalSec && !!raceKm
  const paceVal = hasGoal ? Math.round((goalSec! / raceKm!) * perUnit) : Math.round(basePace / 5) * 5
  const setPaceSec = (ps: number) => { if (raceKm) p.setGoal(fmt((ps / perUnit) * raceKm)) }

  return (
    <section className="week-builder" id="card-prefs" data-highlight="preferences" aria-label="Build your training week">
      <div className="wb-top">
      <div className="coach-host">
        <AgentIcon id="wallbreaker" size="lg" />
        <div className="scout-bubble">
          <span className="scout-name" style={{ color: 'var(--agent-wallbreaker)' }}>Plan Builder <small>{AGENTS.wallbreaker.nick}</small></span>
          <p>Which days suit you for running? Tap to switch run or rest, and add gym days. I'll build the plan around your choices.</p>
        </div>
      </div>
      <div className="wb-side">
      <div className="wb-hud">
        <div className="hud-stat"><b>{runs}</b><span>runs</span></div>
        <div className="hud-stat"><b>{rest.length}</b><span>rest days</span></div>
        <div className="hud-stat"><b>{prefs.gym_days.length}</b><span>gym</span></div>
        <div className="hud-stars" aria-label={`${earned} of ${badges.length} badges`}>
          {badges.map((b, i) => <span key={b.name} className={i < earned ? 'on' : ''}>★</span>)}
          <small>{earned === badges.length ? 'All badges!' : `${earned} of ${badges.length} badges`}</small>
        </div>
      </div>
      </div>
      </div>

      <div className={`wb-week${disabled ? ' is-disabled' : ''}`} role="group" aria-label="Tap a day to switch between run and rest" aria-disabled={disabled}>
        {DAYS.map((d) => {
          const isRest = rest.includes(d)
          const isLong = d === prefs.long_run_day
          const gym = prefs.gym_days.includes(d)
          const kind = isRest ? 'rest' : isLong ? 'long' : 'run'
          return (
            <div key={d} className={`wb-day ${kind}`}>
              <button type="button" className="wb-tap" onClick={() => toggleDay(d)} aria-label={`${DAY_LONG[d]}: ${kind}. Tap to switch.`}>
                <span className="wb-d">{d}</span>
                <img key={kind} className="wb-emoji wb-art" src={`/pacekit-png/week/${isRest ? 'rest' : isLong ? 'long-run' : 'run'}.png`} alt="" />
                <span className="wb-k">{isRest ? 'Rest' : isLong ? 'Long run' : 'Run'}</span>
              </button>
              <button type="button" className={`wb-gym${gym ? ' on' : ''}`} onClick={() => toggleGym(d)} disabled={isRest}
                aria-pressed={gym} title={isRest ? 'No gym on rest days' : gym ? 'Remove gym' : 'Add gym'}>{gym ? 'Gym' : '+ Gym'}</button>
              {(d === 'Sat' || d === 'Sun') && !isLong && (
                <button type="button" className="wb-make-long" onClick={() => setLong(d)}>Make long</button>
              )}
            </div>
          )
        })}
      </div>

      <div className="wb-row">
        <fieldset className="wb-levels" disabled={disabled}>
          <legend>Difficulty</legend>
          {LEVELS.map((l) => (
            <button key={l.id} type="button" className={`wb-level${prefs.approach === l.id ? ' on' : ''}`} aria-pressed={prefs.approach === l.id}
              onClick={() => set({ approach: l.id })}>
              <img className="wb-level-art" src={`/pacekit-png/week/${l.id}.png`} alt="" />
              <strong>{l.name}</strong><span>{l.sub}</span>
            </button>
          ))}
        </fieldset>

        <fieldset className="wb-time" disabled={disabled}>
          <legend>Longest weekday run</legend>
          <div className="wb-chips">
            <input type="range" className="wb-slider" min={30} max={120} step={15} value={prefs.max_weekday_min}
              onChange={(e) => set({ max_weekday_min: Number(e.target.value) })} aria-label="Longest weekday run, minutes" />
            <output className="wb-slider-v">{prefs.max_weekday_min} min</output>
          </div>
          <div className="wb-goal">
            <span className="wb-goal-label">Goal pace</span>
            <div className="wb-goal-toggle seg" role="group" aria-label="Goal pace">
              <button type="button" aria-pressed={!hasGoal} onClick={() => p.setGoal('')}>Coaches decide</button>
              <button type="button" aria-pressed={hasGoal} disabled={!raceKm} onClick={() => setPaceSec(paceVal)}>Set a goal pace</button>
            </div>
            {hasGoal && (
              <>
                <input type="range" className="wb-slider" min={paceMin} max={paceMax} step={5} value={paceMin + paceMax - paceVal}
                  onChange={(e) => setPaceSec(paceMin + paceMax - Number(e.target.value))} aria-label={`Goal pace per ${prefs.units}`} />
                <output className="wb-slider-v">{fmt(paceVal)}<small>/{prefs.units}</small></output>
              </>
            )}
            <div className="wb-units" role="group" aria-label="Units">
              {(['km', 'mi'] as const).map((u) => (
                <button key={u} type="button" aria-pressed={prefs.units === u} onClick={() => { set({ units: u }); setUnits(u) }}>{u}</button>
              ))}
            </div>
          </div>
        </fieldset>
      </div>

      {p.notes.length > 0 && (
        <p className="wb-alert" role="note"><ShieldAlert size={16} aria-hidden="true" /> <strong>Safety Checker:</strong> {p.notes[0]}</p>
      )}
    </section>
  )
}
