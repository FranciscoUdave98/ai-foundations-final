import type { AppState, RaceDistance, RaceQuery } from '../../types'

export const DISTANCES: RaceDistance[] = ['5K', '10K', 'Half Marathon', 'Marathon']
export const DIST_KM: Record<string, number> = { '5K': 5, '10K': 10, 'Half Marathon': 21.1, Marathon: 42.2 }
// Races sooner than this are too close to train for, so the search skips them.
export const MIN_WEEKS: Record<string, number> = { '5K': 4, '10K': 6, 'Half Marathon': 8, Marathon: 12 }
export const RADII = [25, 50, 100, 150]

export function raceQuery(distance: RaceDistance, radius = 100): RaceQuery {
  return { zip: '06511', radius_mi: radius, distance, weeks: 52, safety_demo: false, min_weeks: MIN_WEEKS[distance] ?? 0 }
}

export function defaultQuery(state: AppState | null): RaceQuery {
  const d = (DISTANCES as string[]).includes(state?.athlete?.goal_distance ?? '') ? state!.athlete!.goal_distance as RaceDistance : 'Half Marathon'
  return raceQuery(d)
}
