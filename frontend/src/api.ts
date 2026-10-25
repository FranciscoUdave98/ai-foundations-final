import type {
  AppState, BudgetStatus, CheckInResult, CheckinsInfo, CouncilEvent, Dashboard, PlanView, Profile, RaceHit, RaceQuery, RaceSearchResult, ReceiptsSummary,
  SafetyLog, SampleAthlete, ScoutResult, TodayCard, UsageSummary, Voices,
} from './types'

// One backend session per browser (kept in localStorage), so two people testing never reset each other.
function sessionId(): string {
  let id = localStorage.getItem('pacelab.session')
  if (!id || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) {
    id = `s-${Math.random().toString(36).slice(2, 12)}`
    localStorage.setItem('pacelab.session', id)
  }
  return id
}
export const SESSION_ID = sessionId()
const SESSION = { 'x-session': SESSION_ID }

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { ...SESSION, ...(init.headers ?? {}) } })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* not JSON */
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

function json(body: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
}

export const api = {
  samples: () => call<SampleAthlete[]>('/api/data/samples'),
  useSample: (athlete = 'athlete_a') => call<Dashboard>(`/api/data/sample?athlete=${encodeURIComponent(athlete)}`, { method: 'POST' }),
  upload: (files: File[], units: 'km' | 'mi') => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    form.append('units', units)
    return call<Dashboard>('/api/data/upload', { method: 'POST', body: form })
  },
  dashboard: (start?: string, end?: string) => {
    const q = new URLSearchParams()
    if (start) q.set('start', start)
    if (end) q.set('end', end)
    return call<Dashboard>(`/api/dashboard?${q}`)
  },
  profile: () => call<Profile>('/api/profile'),
  searchRaces: (q: RaceQuery) => call<RaceSearchResult>('/api/races/search', json(q)),
  scoutRaces: (q: RaceQuery) => call<ScoutResult>('/api/races/scout', json(q)),
  selectRace: (race_id: string, miles_away: number, distance_km: number | null) =>
    call<{ selected: RaceHit }>('/api/races/select', json({ race_id, miles_away, distance_km })),
  selectedRace: () => call<{ selected: RaceHit | null }>('/api/races/selected'),
  usage: () => call<UsageSummary>('/api/usage'),
  voices: () => call<Voices>('/api/voices'),
  plan: () => call<{ plan_view: PlanView | null }>('/api/plan'),
  lastCouncil: () => call<{ events: CouncilEvent[] }>('/api/council/last'),
  setWorkout: (day: string, type: string, status: string) => call<{ ok: boolean }>('/api/plan/workout', json({ day, type, status })),
  budget: () => call<BudgetStatus>('/api/budget'),
  setBudget: (caps: BudgetStatus['caps']) => call<BudgetStatus>('/api/budget', json(caps)),
  receipts: () => call<ReceiptsSummary>('/api/receipts'),
  safety: () => call<SafetyLog>('/api/safety'),
  state: () => call<AppState>('/api/state'),
  checkins: () => call<CheckinsInfo>('/api/checkins'),
  checkin: (text: string, week: number | null, files: File[]) => {
    const form = new FormData()
    form.append('text', text)
    if (week) form.append('week', String(week))
    files.forEach((f) => form.append('files', f))
    return call<CheckInResult>('/api/checkin', { method: 'POST', body: form })
  },
  acceptCheckin: (id: string) => call<{ ok: boolean; plan_view: PlanView }>(`/api/checkin/${id}/accept`, { method: 'POST' }),
  rejectCheckin: (id: string) => call<{ ok: boolean }>(`/api/checkin/${id}/reject`, { method: 'POST' }),
  today: (scenario: string, slot: string | null) =>
    call<TodayCard>(`/api/today?scenario=${encodeURIComponent(scenario)}${slot ? `&slot=${slot}` : ''}`),
}

/** POST /api/council/stream and hand each SSE event to onEvent as it arrives. */
export async function streamCouncil(body: { goal_time: string | null; mode: 'lean' | 'full'; distance_km: number | null },
  onEvent: (e: CouncilEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch('/api/council/stream', {
    method: 'POST', body: JSON.stringify(body), signal,
    headers: { ...SESSION, 'content-type': 'application/json' },
  })
  if (!res.ok || !res.body) {
    let detail = `${res.status} ${res.statusText}`
    try { detail = (await res.json()).detail ?? detail } catch { /* not JSON */ }
    throw new Error(detail)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let cut
    while ((cut = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, cut)
      buf = buf.slice(cut + 2)
      const data = block.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n')
      if (data) onEvent(JSON.parse(data) as CouncilEvent)
    }
  }
}
