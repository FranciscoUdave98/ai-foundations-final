import { useState } from 'react'
import { api } from '../api'
import { fmtDay } from '../format'
import type { RaceCard, RaceDistance, RaceHit, RaceQuery, ScoutResult } from '../types'

interface Props {
  hasData: boolean
  selected: RaceHit | null
  onSelect: (race: RaceHit) => void
  onSpend: () => void
  initialQuery?: RaceQuery
  embedded?: boolean
}

const DISTANCES: { id: RaceDistance; label: string }[] = [
  { id: 'any', label: 'Any distance' },
  { id: '5K', label: '5K' },
  { id: '10K', label: '10K' },
  { id: 'Half Marathon', label: 'Half marathon' },
  { id: 'Marathon', label: 'Marathon' },
  { id: 'other', label: 'Other (4M, 15K…)' },
]
const RADII = [10, 25, 50, 100, 150, 250, 300]
export const KM: Partial<Record<RaceDistance, number>> = { '5K': 5, '10K': 10, 'Half Marathon': 21.1, 'Marathon': 42.2 }
const WINDOWS = [8, 12, 16, 24, 36, 52, 60]

const FLAG_TEXT: Record<string, string> = {
  injection: 'instructions aimed at an AI',
  offsite_link: 'a push to an unknown website',
  hidden_html: 'hidden HTML text',
  html_comment: 'an HTML comment',
  unicode_tag_chars: 'invisible Unicode characters',
  zero_width: 'zero-width characters',
  url_rejected: 'an unsafe link',
}

export function RaceFinderTab({ hasData, selected, onSelect, onSpend, initialQuery, embedded }: Props) {
  const [q, setQ] = useState<RaceQuery>(initialQuery ?? { zip: '06511', radius_mi: 100, distance: 'Half Marathon', weeks: 52, safety_demo: false })
  const [cards, setCards] = useState<RaceCard[] | null>(null)
  const [suggestions, setSuggestions] = useState<RaceHit[]>([])
  const [origin, setOrigin] = useState('')
  const [scout, setScout] = useState<ScoutResult | null>(null)
  const [busy, setBusy] = useState<'search' | 'scout' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function search(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    setScout(null)
    setBusy('search')
    try {
      const res = await api.searchRaces(q)
      setCards(res.hits)
      setSuggestions(res.suggestions)
      setOrigin(`${res.origin} · ${fmtDay(res.start)} to ${fmtDay(res.end, true)}`)
      if (res.hits.length) {
        setBusy('scout')
        const s = await api.scoutRaces(q)
        setScout(s)
        setCards(s.cards)
        onSpend()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const set = <K extends keyof RaceQuery>(k: K, v: RaceQuery[K]) => setQ((old) => ({ ...old, [k]: v }))
  const flagged = (cards ?? []).filter((c) => c.guardian_flags.some((f) => f !== 'link_removed')).length

  return (
    <div>
      {!embedded && (
        <div className="page-head">
          <div>
            <h1>Race Finder</h1>
            <p>Pick a race near you. Code finds the matches instantly; the Race Scout agent then reads the listings and writes a note for each.</p>
          </div>
        </div>
      )}

      <form className="card race-form" onSubmit={search}>
        <label>Zip code
          <input value={q.zip} inputMode="numeric" maxLength={5} pattern="\d{5}" required
            onChange={(e) => set('zip', e.target.value.replace(/\D/g, '').slice(0, 5))} />
        </label>
        <label>Radius
          <select value={q.radius_mi} onChange={(e) => set('radius_mi', Number(e.target.value))}>
            {RADII.map((r) => <option key={r} value={r}>{r} miles</option>)}
          </select>
        </label>
        <label>Distance
          <select value={q.distance} onChange={(e) => set('distance', e.target.value as RaceDistance)}>
            {DISTANCES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
        <label>Window
          <select value={q.weeks} onChange={(e) => set('weeks', Number(e.target.value))}>
            {WINDOWS.map((w) => <option key={w} value={w}>Next {w} weeks</option>)}
          </select>
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy !== null}>
          {busy === 'search' ? 'Searching…' : busy === 'scout' ? 'Scout reading…' : 'Find races'}
        </button>
        <label className="demo-toggle" title="Adds 10 fake races whose listings try to hijack the AI (tests/attacks/attack_races.csv)">
          <input type="checkbox" checked={q.safety_demo} onChange={(e) => set('safety_demo', e.target.checked)} />
          Safety demo: include planted attack races
        </label>
      </form>

      {error && <div className="error" role="alert" style={{ marginTop: 16 }}>{error}</div>}

      {cards && (
        <div className="race-status">
          <span>{cards.length} race{cards.length === 1 ? '' : 's'} near {origin}</span>
          {busy === 'scout' && <span className="scouting"><i className="dot" />Race Scout is reading the listings…</span>}
          {scout && (
            <span className="receipt" title="Real token counts from this run">
              Race Scout: {scout.usage.requests} calls · {(scout.usage.input_tokens + scout.usage.output_tokens).toLocaleString()} tokens ·
              {' '}${scout.usage.cost_usd.toFixed(5)} · {scout.usage.seconds.toFixed(1)}s
              <span className="muted"> (gpt-6-astra would cost ${scout.usage.what_if_astra_usd.toFixed(4)})</span>
            </span>
          )}
        </div>
      )}

      {scout && (flagged > 0 || scout.trap_calls > 0) && (
        <div className="shield-banner" role="status">
          <span aria-hidden="true">🛡</span>
          <div>
            <strong>Guardian cleaned {flagged} listing{flagged === 1 ? '' : 's'} before the Race Scout read {flagged === 1 ? 'it' : 'them'}.</strong>{' '}
            {scout.trap_calls === 0 ? 'The scout made 0 calls to the trap registration tool.' : `ALERT: ${scout.trap_calls} trap call(s) logged; nothing was registered.`}{' '}
            Details are in the safety log (Under the hood, Part 4).
          </div>
        </div>
      )}

      {scout?.summary && (
        <div className="scout-summary">
          {scout.voice_line && <p className="scout-voice">🗺️ <em>{scout.voice_line}</em></p>}
          <strong>The Course Whisperer:</strong> {scout.summary}
        </div>
      )}

      {cards && cards.length === 0 && (
        <div className="card soon" style={{ marginTop: 16 }}>
          <h2>No races match that search</h2>
          <p>Try a bigger radius or a longer window.{suggestions.length > 0 && ' Closest matches within 150 miles and 12 months:'}</p>
          {suggestions.length > 0 && (
            <div className="race-grid" style={{ width: '100%' }}>
              {suggestions.map((r) => <Card key={r.id} race={r} selected={selected?.id === r.id} onSelect={onSelect} hasData={hasData} preferKm={KM[q.distance] ?? null} />)}
            </div>
          )}
        </div>
      )}

      {cards && cards.length > 0 && (
        <div className="race-grid">
          {cards.map((r) => (
            <Card key={r.id} race={r} top={scout?.top_pick === r.id} selected={selected?.id === r.id}
              onSelect={onSelect} hasData={hasData} loading={busy === 'scout'} preferKm={KM[q.distance] ?? null} />
          ))}
        </div>
      )}
    </div>
  )
}

export function Card({ race, top, selected, onSelect, hasData, loading, preferKm }: {
  race: RaceCard; top?: boolean; selected: boolean; onSelect: (r: RaceHit) => void; hasData: boolean; loading?: boolean
  preferKm: number | null
}) {
  const [busy, setBusy] = useState(false)
  const flags = race.guardian_flags.filter((f) => f !== 'link_removed')
  async function pick() {
    setBusy(true)
    try {
      const { selected } = await api.selectRace(race.id, race.miles_away, preferKm)
      onSelect(selected)
    } finally {
      setBusy(false)
    }
  }
  return (
    <article className={`card race-card${selected ? ' selected' : ''}`}>
      <div className="race-top">
        <div className="race-date">
          <strong>{fmtDay(race.date)}</strong>
          <span>{new Date(race.date + 'T12:00').getFullYear()}</span>
        </div>
        <div className="race-title">
          <h3>{race.name}</h3>
          <div className="race-meta">{race.city}, {race.state} · {race.miles_away} mi · {race.terrain}</div>
        </div>
      </div>
      <div className="chips">
        {top && <span className="chip chip-top">★ Scout's top pick</span>}
        <span className={`chip status-${race.date_status}`} title="How sure the date is">{race.date_status}</span>
        {race.distances.map((d) => <span key={d} className="chip">{d}</span>)}
        <span className="chip">{race.weeks_until} weeks away</span>
        <span className="chip">{race.price_usd != null ? `$${race.price_usd.toFixed(0)}` : 'price n/a'}</span>
      </div>
      {flags.length > 0 && (
        <div className="guardian-note" title={flags.join(', ')}>
          🛡 Guardian removed {flags.map((f) => FLAG_TEXT[f] ?? f).join(' and ')} from this listing
        </div>
      )}
      <div className="scout-notes">
        {race.headline ? (
          <>
            <p className="headline">{race.headline}</p>
            {race.why_it_fits && <p>{race.why_it_fits}</p>}
            {race.watch_out && <p className="watch">⚠ {race.watch_out}</p>}
          </>
        ) : loading ? <p className="muted shimmer">Scout note coming…</p> : null}
      </div>
      <div className="race-actions">
        <button className="btn btn-primary" onClick={pick} disabled={busy || !hasData}
          title={hasData ? undefined : 'Load your data on the Start tab first'}>
          {selected ? '✓ Training for this' : busy ? 'Saving…' : 'Train for this'}
        </button>
        {race.url && <a className="btn" href={race.url} target="_blank" rel="noopener noreferrer">Official page ↗</a>}
      </div>
    </article>
  )
}
