import { Check, ChevronLeft, ChevronRight, MapPin, Star } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AGENTS, AgentIcon } from '../../agents'
import { fmtDay } from '../../format'
import type { AppState, RaceCard, RaceDistance, Voices } from '../../types'
import { CITIES, DIST_KM, DISTANCES, defaultQuery, RADII } from './setup'

const short = (name: string) => name.split(' (')[0]
const LABEL: Record<string, string> = { '5K': '5K', '10K': '10K', 'Half Marathon': 'Half', Marathon: 'Marathon' }
const MILES: Record<string, string> = { '5K': '3.1 mi', '10K': '6.2 mi', 'Half Marathon': '13.1 mi', Marathon: '26.2 mi' }
// Each distance gets its own color, cool to hot as the race gets longer.
const DCOLOR: Record<string, string> = { '5K': 'var(--wo-easy)', '10K': 'var(--wo-long)', 'Half Marathon': 'var(--wo-tempo)', Marathon: 'var(--wo-interval)' }

/** Step 2: pick a distance, the Race Scout reads the listings, you choose one of its picks. */
export function StepRace({ state, scouting, scout, pick, demo }: {
  state: AppState | null; voices: Voices | null; scouting: boolean; demo: boolean
  scout: (d: RaceDistance, radius: number, zip: string) => Promise<void>
  pick: (c: RaceCard, km: number) => Promise<void>
}) {
  const last = state?.last_scout
  const q0 = last?.query ?? defaultQuery(state)
  const [distance, setDistance] = useState<RaceDistance>(q0.distance)
  const [radius, setRadius] = useState(q0.radius_mi)
  const [zip, setZip] = useState(q0.zip)
  const track = useRef<HTMLDivElement>(null)
  const slide = (dir: number) => { const t = track.current; if (t) t.scrollBy({ left: dir * Math.max(280, t.clientWidth * 0.8), behavior: 'smooth' }) }
  const [edge, setEdge] = useState({ prev: false, next: false })
  const measure = () => { const t = track.current; if (t) setEdge({ prev: t.scrollLeft > 8, next: t.scrollLeft + t.clientWidth < t.scrollWidth - 8 }) }
  const [choosing, setChoosing] = useState<string | null>(null)
  const started = useRef(false)
  const target = state?.target ?? null
  const result = last?.result ?? null

  // First visit with runs loaded: search once for the runner's own goal distance.
  useEffect(() => {
    if (!state?.athlete || last || demo || scouting || started.current) return
    started.current = true
    scout(q0.distance, q0.radius_mi, q0.zip)
  }, [state?.athlete, last, demo, scouting, scout, q0.distance, q0.radius_mi, q0.zip])
  useEffect(() => { if (last) { setDistance(last.query.distance); setRadius(last.query.radius_mi); setZip(last.query.zip) } }, [last])

  const cards = result ? [...result.cards.filter((c) => c.id === result.top_pick), ...result.cards.filter((c) => c.id !== result.top_pick)] : []
  const shown = cards
  const run = (d = distance, r = radius, z = zip) => { track.current?.scrollTo({ left: 0 }); scout(d, r, z) }
  const choose = async (c: RaceCard) => {
    setChoosing(c.id)
    try { await pick(c, DIST_KM[last?.query.distance ?? distance] ?? DIST_KM[distance]) } finally { setChoosing(null) }
  }

  return (
    <div className="race-step" id="card-race">
      <div className="race-top">
      <div className="scout-host">
        <AgentIcon id="whisperer" size="lg" />
        <div className="scout-bubble" aria-live="polite">
          <span className="scout-name">Race Scout <small>{AGENTS.whisperer.nick}</small></span>
          <p>{scouting ? 'Hunting for races near you… about 10 seconds.'
            : !result ? "Pick a distance and I'll find races near you."
            : cards.length === 0 ? 'Nothing at that distance. Try another one?'
            : target && cards.some((c) => c.id === target.id) ? `Great pick! ${short(target.name)} it is. ${target.weeks_until} weeks to get ready.`
            : result.voice_line || "Here are my favorites. The starred one is my top pick."}</p>
        </div>
      </div>
      <div className="race-bar">
        <div className="seg seg-lg" role="radiogroup" aria-label="Race distance">
          {DISTANCES.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={distance === d} disabled={scouting} style={{ '--d': DCOLOR[d] } as React.CSSProperties}
              onClick={() => { setDistance(d); run(d) }}>{LABEL[d]}<small>{MILES[d]}</small></button>
          ))}
        </div>
        <div className="race-where">
          <img className="rw-art" src="/pacekit-png/project/race-search.png" alt="" />
          <select value={zip} disabled={scouting} aria-label="Search near" onChange={(e) => { setZip(e.target.value); run(distance, radius, e.target.value) }}>
            {!CITIES.some((c) => c.zip === zip) && <option value={zip}>ZIP {zip}</option>}
            {CITIES.map((c) => <option key={c.zip} value={c.zip}>{c.name}</option>)}
          </select>
          <select value={radius} disabled={scouting} aria-label="Distance from you" onChange={(e) => { const r = Number(e.target.value); setRadius(r); run(distance, r) }}>
            {RADII.map((r) => <option key={r} value={r}>within {r} mi</option>)}
          </select>
        </div>
      </div>
      </div>

      {scouting ? (
        <div className="scout-wait card" role="status">
          <img className="scout-run" src="/pacekit-png/loading/shoe-mascot.png" alt="" />
          <p>The Race Scout is reading race listings…</p>
        </div>
      ) : result ? (
        cards.length === 0 ? (
          <p className="empty-line card">No races found. Try another distance.</p>
        ) : (
          <>
            <div className="race-carousel">
            {edge.prev && <button type="button" className="rc-arrow left" onClick={() => slide(-1)} aria-label="Previous races"><ChevronLeft size={22} /></button>}
            <div className="race-list rc-track" ref={(el) => { track.current = el; if (el) requestAnimationFrame(measure) }} onScroll={measure} role="radiogroup" aria-label="Races the Scout found">
              {shown.map((c) => {
                const on = target?.id === c.id
                const top = c.id === result.top_pick
                return (
                  <article key={c.id} className={`race-opt card${on ? ' on' : ''}${top ? ' top' : ''}`}>
                    <div className="ro-top">{top && <span className="ro-badge"><Star size={14} fill="currentColor" aria-hidden="true" /> Scout's pick</span>}</div>
                    <h3>{short(c.name)}</h3>
                    <p className="ro-meta"><MapPin size={14} aria-hidden="true" /> {c.city}, {c.state} · {Math.round(c.miles_away)} mi</p>
                    <div className="ro-weeks"><strong>{c.weeks_until}</strong><span>weeks to train</span></div>
                    <dl className="ro-facts-list">
                      <div><dt>Race day</dt><dd>{fmtDay(c.date)}</dd></div>
                      <div><dt>Distances</dt><dd>{c.distances.slice(0, 3).join(' · ') || '—'}</dd></div>
                      <div><dt>Entry</dt><dd>{c.price_usd != null ? `$${Math.round(c.price_usd)}` : 'Not listed'}</dd></div>
                    </dl>
                    <button type="button" role="radio" aria-checked={on} className={`btn ${on ? 'btn-chosen' : 'btn-outline'} ro-choose`}
                      disabled={!!choosing || on} onClick={() => choose(c)}>
                      {on ? <><Check size={16} strokeWidth={3} aria-hidden="true" /> Your race</> : choosing === c.id ? 'Choosing…' : 'Choose this race'}
                    </button>
                  </article>
                )
              })}
            </div>
            {edge.next && <button type="button" className="rc-arrow right" onClick={() => slide(1)} aria-label="More races"><ChevronRight size={22} /></button>}
            </div>
            <p className="rc-count">{cards.length} races{edge.next || edge.prev ? ' · slide for more' : ''}</p>
          </>
        )
      ) : null}

      {target && !shown.some((c) => c.id === target.id) && !scouting && (
        <p className="current-race card"><Check size={16} aria-hidden="true" /> Your race: <strong>{short(target.name)}</strong> · {target.weeks_until} weeks away</p>
      )}
    </div>
  )
}
