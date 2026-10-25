import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { fmtWeekday } from '../format'
import type { TodayCard as Today } from '../types'

const TYPE_ICON: Record<string, string> = {
  easy: '🏃', recovery: '🚶', long: '🛣️', tempo: '⚡', intervals: '⏱️', strength: '🏋️', rest: '😴',
}

/** Duolingo-style "Today" card: plan streak, the notification, an inbox, and a Simulate control for demos. */
export function TodayCard({ planKey }: { planKey?: string }) {
  const [card, setCard] = useState<Today | null>(null)
  const [scenario, setScenario] = useState('real')
  const [slot, setSlot] = useState<'morning' | 'evening' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((sc: string, sl: 'morning' | 'evening' | null) => {
    api.today(sc, sl).then((c) => { setCard(c); setError(null) }).catch((e) => setError(String(e.message ?? e)))
  }, [])
  useEffect(() => { load(scenario, slot) }, [load, scenario, slot, planKey])

  if (error) return <div className="card today-card"><p className="muted">Today card unavailable: {error}</p></div>
  if (!card) return null
  const [first, ...inbox] = card.nudges
  const flame = card.paused ? '⏸️' : card.streak > 0 ? '🔥' : '🌱'

  return (
    <section className={`card today-card${card.paused ? ' paused' : ''}`} aria-label="Today">
      <div className="today-head">
        <div>
          <h2>Today <span className="muted">{fmtWeekday(card.date)} · {card.slot}</span>
            {card.simulated && <span className="sim-badge">simulated</span>}</h2>
          <div className="today-workout">
            {card.today.race ? '🏁 Race day' : `${TYPE_ICON[card.today.type] ?? '•'} ${card.today.workout ?? card.today.type}`}
            {card.today.pace && !card.today.race ? ` at ${card.today.pace}/km` : ''}
          </div>
        </div>
        <div className="streak" title="Plan streak: days the plan was kept in a row. Rest days count.">
          <span className="flame" aria-hidden="true">{flame}</span>
          <strong>{card.streak}</strong>
          <span>day plan streak</span>
        </div>
      </div>

      <div className="today-body">
        <div className="today-left">
          {first ? (
            <div className="notif" role="status">
              <div className="notif-top"><span className="notif-app">PaceLab</span><span className="muted">now</span></div>
              <div className="notif-title">{first.title}</div>
              <div className="notif-text">{first.text}</div>
            </div>
          ) : <p className="muted">No nudge right now. The plan is quiet today.</p>}
          {inbox.length > 0 && (
            <ul className="inbox" aria-label="More nudges">
              {inbox.map((n) => <li key={n.id}><strong>{n.title}</strong> {n.text}</li>)}
            </ul>
          )}
          {card.note && <p className="today-note">{card.note}</p>}
        </div>
        <div className="today-right">
          <div className="week-strip" aria-label="This week">
            {card.week.map((d) => (
              <div key={d.day} className={`ws-day ws-${d.state}${d.day === card.date ? ' ws-today' : ''}`} title={`${fmtWeekday(d.day)}: ${d.workout ?? d.type} (${d.state})`}>
                <span className="ws-name">{fmtWeekday(d.day).slice(0, 3)}</span>
                <span className="ws-icon" aria-hidden="true">{TYPE_ICON[d.type] ?? '•'}</span>
                <span className="ws-mark">{d.state === 'kept' ? '✓' : d.state === 'missed' ? '✕' : d.state === 'extra' ? '!' : ''}</span>
              </div>
            ))}
          </div>
          <div className="today-controls">
            <label>Simulate
              <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
                {Object.entries(card.scenarios).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <div className="seg" role="group" aria-label="Time of day">
              {(['morning', 'evening'] as const).map((s) => (
                <button key={s} aria-pressed={card.slot === s} onClick={() => setSlot(s)}>{s === 'morning' ? '☀️ Morning' : '🌙 Evening'}</button>
              ))}
            </div>
            <button className="btn-link" onClick={() => load(scenario, slot)}>Another line ↻</button>
          </div>
          <p className="card-sub">Plan streak, not a run streak: rest days count, so it never pushes extra running. Sick or hurt in a check-in pauses every nudge. Lines are picked by code: 0 tokens.</p>
        </div>
      </div>
    </section>
  )
}
