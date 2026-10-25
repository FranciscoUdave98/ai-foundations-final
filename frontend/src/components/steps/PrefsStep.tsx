import { useState } from 'react'
import type { AppState } from '../../types'
import type { useCouncil } from '../../useCouncil'
import { loadPrefs, prefsSummary, savePrefs } from '../../prefs'
import { useUnits } from '../../units'

type Council = ReturnType<typeof useCouncil>

/** ③ Preferences, then "Convene the council". */
export function PrefsStep({ state, council, onStart, onDone }: {
  state: AppState | null; council: Council; onStart: () => void; onDone: () => void
}) {
  const u = useUnits()
  const [prefs, setPrefs] = useState(loadPrefs)
  const t = state?.target
  const predicted = state?.predicted_for_target

  async function convene() {
    savePrefs(prefs)
    onStart()
    await council.start({ goal_time: prefs.goal_time.trim() || null, mode: 'lean', distance_km: t?.target_km ?? null })
    onDone()
  }

  return (
    <section className="card step-card prefs">
      <div className="card-head"><h2>Your preferences</h2></div>
      <label className="field">Goal time <span className="muted">(optional)</span>
        <input value={prefs.goal_time} onChange={(e) => setPrefs({ ...prefs, goal_time: e.target.value })} placeholder="e.g. 3:15:00" maxLength={10} />
        {predicted && <span className="hint">Your data predicts {predicted}</span>}
      </label>
      <p className="prefs-summary">{prefsSummary(prefs, u.unit)}</p>
      <button className="btn btn-primary btn-big" onClick={convene} disabled={council.state.running || !t}>Convene the council</button>
    </section>
  )
}
