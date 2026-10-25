import { MapPin } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { fmtDay } from '../../format'
import type { AppState, RaceCard as Card, RaceDistance, ScoutResult } from '../../types'
import { Skel, toast } from '../../ui'
import { DIST_KM, DISTANCES, defaultQuery, RADII, raceQuery } from './setup'

const STATUS: Record<string, string> = { confirmed: 'confirmed', reported: 'reported', estimated: 'estimated' }
const short = (name: string) => name.split(' (')[0]

/** Race: the chosen race on top with the Scout's one-line note, the Scout's other picks as a radio list, and the search. */
export function RaceCard({ state, refreshState, onSpend, demo }: {
  state: AppState | null; refreshState: () => Promise<void> | void; onSpend: () => void; demo: boolean
}) {
  const last = state?.last_scout
  const q0 = last?.query ?? defaultQuery(state)
  const [distance, setDistance] = useState<RaceDistance>(q0.distance)
  const [radius, setRadius] = useState(q0.radius_mi)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scout: ScoutResult | null = last?.result ?? null
  const started = useRef(false)
  const target = state?.target ?? null
  const locked = !state?.athlete

  const pick = useCallback(async (c: Card, km: number) => {
    await api.selectRace(c.id, c.miles_away, km)
    await refreshState()
    toast(`Race set: ${short(c.name)}, ${fmtDay(c.date)}`)
  }, [refreshState])

  const search = useCallback(async (d: RaceDistance, r: number) => {
    setBusy(true); setError(null)
    try {
      const q = raceQuery(d, r)
      await api.searchRaces(q)
      const s = await api.scoutRaces(q)
      onSpend()
      const top = s.cards.find((c) => c.id === s.top_pick) ?? s.cards[0]
      const current = state?.target
      const keep = current && s.cards.some((c) => c.id === current.id) && Math.abs((current.target_km ?? 0) - DIST_KM[d]) < 1
      if (top && !keep) await pick(top, DIST_KM[d])
      else await refreshState()
      if (!top) setError('No races found. Try a wider radius.')
    } catch {
      setError("The race search failed. Try again in a moment.")
    } finally { setBusy(false) }
  }, [onSpend, pick, refreshState, state?.target])

  // First time an athlete is loaded: scout once (the demo runs its own scout, so wait for it).
  useEffect(() => {
    if (locked || last || demo || started.current) return
    started.current = true
    search(q0.distance, q0.radius_mi)
  }, [locked, last, demo, search, q0.distance, q0.radius_mi])
  useEffect(() => { if (last) { setDistance(last.query.distance); setRadius(last.query.radius_mi) } }, [last])

  const cards = scout ? [...scout.cards.filter((c) => c.id === scout.top_pick), ...scout.cards.filter((c) => c.id !== scout.top_pick)] : []
  const chosen = cards.find((c) => c.id === target?.id)
  const others = cards.filter((c) => c.id !== target?.id).slice(0, 3)
  const note = chosen?.why_it_fits ?? null

  return (
    <section className={`card setup-card${locked ? ' is-locked' : ''}`} id="card-race" aria-labelledby="race-title">
      <div className="setup-head">
        <h2 id="race-title">Race</h2>
        {!locked && (
          <div className="inline-selects">
            <select aria-label="Distance" value={distance} disabled={busy}
              onChange={(e) => { const d = e.target.value as RaceDistance; setDistance(d); search(d, radius) }}>
              {DISTANCES.map((d) => <option key={d} value={d}>{d === 'Half Marathon' ? 'Half' : d}</option>)}
            </select>
            <select aria-label="Radius" value={radius} disabled={busy}
              onChange={(e) => { const r = Number(e.target.value); setRadius(r); search(distance, r) }}>
              {RADII.map((r) => <option key={r} value={r}>{r} mi</option>)}
            </select>
          </div>
        )}
      </div>
      {locked ? <p className="locked-line">Load your runs first</p>
        : busy || (!scout && !error) ? (
          <div className="skel-stack" aria-label="The Scout is reading the listings"><Skel h={22} w="70%" /><Skel h={14} w="45%" /><Skel h={14} /><Skel h={14} /><Skel h={14} /></div>
        ) : (
          <>
            {error && <p className="error-line" role="alert">{error}</p>}
            {target && (
              <div className="chosen-race">
                <strong className="race-name">{short(target.name)}</strong>
                <div className="race-meta">
                  <MapPin size={14} aria-hidden="true" /> {fmtDay(target.date)} · {target.weeks_until} wks · {Math.round(target.miles_away)} mi
                  <span className={`badge status-${target.date_status}`}>{STATUS[target.date_status] ?? target.date_status}</span>
                </div>
                {note && <p className="scout-note">🗺️ {note}</p>}
              </div>
            )}
            {others.length > 0 && (
              <fieldset className="race-radios" aria-label="The Scout's other top picks">
                {others.map((c) => (
                  <label key={c.id} className="race-radio">
                    <input type="radio" name="race" checked={false} onChange={() => pick(c, DIST_KM[distance])} />
                    <span>{short(c.name)} · {fmtDay(c.date)} · {c.weeks_until} wks · {c.date_status}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </>
        )}
    </section>
  )
}
