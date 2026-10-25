import type { Profile, RaceHit, UsageSummary } from '../types'
import { fmtDay } from '../format'

interface Props {
  profile: Profile | null
  source: string | null
  target: RaceHit | null
  usage: UsageSummary | null
}

// Display budget for the meter. The hard per-run / per-session caps arrive with the council (Part 4).
const BUDGET_USD = 0.5

export function Sidebar({ profile, source, target, usage }: Props) {
  const s = usage?.session
  const spent = s?.cost_usd ?? 0
  return (
    <aside className="sidebar" aria-label="Athlete profile and token meter">
      <div className="brand">
        <svg aria-hidden="true"><use href="#pl-logo" /></svg>
        <div>
          <div className="brand-name">PaceLab</div>
          <div className="brand-tag">Your AI coaching staff</div>
        </div>
      </div>

      <section className="side-card">
        <h3>Athlete profile</h3>
        {profile ? (
          <>
            <Row k="Data through" v={fmtDay(profile.as_of, true)} />
            <Row k="History" v={`${profile.history.weeks_of_data} weeks · ${source ?? ''}`} />
            <Row k="Avg week (4 wk)" v={`${profile.volume_km.avg_week_last_4} km`} />
            <Row k="Peak week (12 wk)" v={`${profile.volume_km.peak_week_last_12} km`} />
            <Row k="Runs / week" v={`${profile.frequency.runs_per_week_last_4}`} />
            <Row k="Easy pace" v={profile.typical_easy_pace ?? '—'} />
            <Row k="Easy HR" v={profile.heart_rate.typical_easy_hr ? `${profile.heart_rate.typical_easy_hr} bpm` : '—'} />
            <Row k="Half marathon" v={profile.race_predictions['Half Marathon'] ?? '—'} />
            <Row k="Marathon" v={profile.race_predictions['Marathon'] ?? '—'} />
            {profile.flags.length > 0 && (
              <ul className="side-flags">
                {profile.flags.map((f) => <li key={f}><span aria-hidden="true">⚠</span>{f}</li>)}
              </ul>
            )}
          </>
        ) : (
          <p className="side-empty">No data yet. Load the sample or upload your export on the Start tab.</p>
        )}
      </section>

      <section className="side-card side-race" aria-label="Target race">
        <h3>Target race</h3>
        {target ? (
          <>
            <strong>{target.name}</strong>
            <Row k="Date" v={fmtDay(target.date, true)} />
            <Row k="Weeks to go" v={`${target.weeks_until}`} />
            <Row k="Distance" v={target.distances.join(' / ')} />
          </>
        ) : <p className="side-empty">Pick one in Race Finder with “Train for this”.</p>}
      </section>

      <section className="side-card" aria-label="Token meter">
        <h3>Token meter</h3>
        <Row k="This session" v={`$${spent.toFixed(5)}`} />
        <div className="meter-track" role="meter" aria-valuemin={0} aria-valuemax={BUDGET_USD} aria-valuenow={spent} aria-label="Spend vs budget">
          <div className="meter-fill" style={{ width: `${(spent / BUDGET_USD) * 100}%` }} />
        </div>
        <Row k="Budget" v={`$${BUDGET_USD.toFixed(2)}`} />
        {s && s.requests > 0 ? (
          <>
            <Row k="Model calls" v={`${s.requests}`} />
            <Row k="Tokens" v={`${(s.input_tokens + s.output_tokens).toLocaleString()}`} />
            {Object.entries(s.by_agent).map(([agent, a]) => (
              <Row key={agent} k={`· ${agent.replace('_', ' ')}`} v={`$${a.cost_usd.toFixed(5)}`} />
            ))}
            <p className="side-note">Same tokens on gpt-6-astra: ${s.what_if_astra_usd.toFixed(4)}</p>
          </>
        ) : (
          <p className="side-note">No AI calls yet this session: the dashboard is computed in code, for free.</p>
        )}
      </section>

      <div className="side-foot">MGT 409 · AI Foundations for Managers</div>
    </aside>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="side-row"><span>{k}</span><strong>{v}</strong></div>
}
