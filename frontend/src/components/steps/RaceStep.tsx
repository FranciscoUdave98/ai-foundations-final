import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { AppState, RaceHit, ScoutResult } from '../../types'
import { defaultQuery } from '../CouncilHome'
import { Card, RaceFinderTab } from '../RaceFinderTab'

/** ② Race: the Course Whisperer's note and its top 3 races; "See all races" opens the full finder. */
export function RaceStep({ state, onSelected, onSpend, auto = true }: {
  state: AppState | null; onSelected: () => void; onSpend: () => void; auto?: boolean
}) {
  const q = state?.last_scout?.query ?? defaultQuery(state)
  const [scout, setScout] = useState<ScoutResult | null>(state?.last_scout?.result ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const started = useRef(false)

  // A scout someone else ran (the demo) shows here too; otherwise scout once, unless the demo is about to.
  useEffect(() => { if (!scout && state?.last_scout?.result) setScout(state.last_scout.result) }, [scout, state])
  useEffect(() => {
    if (scout || started.current || !state?.athlete || !auto || state.last_scout) return
    started.current = true
    setBusy(true)
    api.searchRaces(q).then(() => api.scoutRaces(q)).then((s) => { setScout(s); onSpend() })
      .catch((e) => setError(String(e.message ?? e))).finally(() => setBusy(false))
  }, [scout, state, q, onSpend, auto])

  const top = scout ? [
    ...scout.cards.filter((c) => c.id === scout.top_pick),
    ...scout.cards.filter((c) => c.id !== scout.top_pick),
  ].slice(0, 3) : []
  const preferKm = state?.athlete?.goal_km ?? null
  const picked = (_r: RaceHit) => onSelected()

  return (
    <section className="card step-card">
      <div className="card-head">
        <div>
          <h2>Pick your race</h2>
          <div className="card-sub">{q.distance} races within {q.radius_mi} miles of {q.zip}, next {q.weeks} weeks. “Train for this” moves you to preferences.</div>
        </div>
        <button className="btn-link" onClick={() => setAll((v) => !v)}>{all ? 'Hide filters' : 'See all races'}</button>
      </div>
      {busy && <p className="scouting"><i className="dot" />The Course Whisperer is reading the listings…</p>}
      {error && <div className="error" role="alert">{error}</div>}
      {scout?.summary && (
        <div className="scout-summary">
          {scout.voice_line && <p className="scout-voice">🗺️ <em>{scout.voice_line}</em></p>}
          <strong>The Course Whisperer:</strong> {scout.summary}
          <span className="muted small"> · {scout.usage.requests} calls · ${scout.usage.cost_usd.toFixed(5)}</span>
        </div>
      )}
      {!all && top.length > 0 && (
        <div className="race-grid">
          {top.map((r) => <Card key={r.id} race={r} top={r.id === scout?.top_pick} selected={state?.target?.id === r.id}
            onSelect={picked} hasData={!!state?.athlete} preferKm={preferKm} />)}
        </div>
      )}
      {all && <RaceFinderTab embedded initialQuery={q} hasData={!!state?.athlete} selected={state?.target ?? null} onSelect={picked} onSpend={onSpend} />}
    </section>
  )
}
