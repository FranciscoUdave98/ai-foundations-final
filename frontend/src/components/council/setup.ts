import type { AppState, RaceDistance, RaceQuery } from '../../types'

export const DISTANCES: RaceDistance[] = ['5K', '10K', 'Half Marathon', 'Marathon']
export const DIST_KM: Record<string, number> = { '5K': 5, '10K': 10, 'Half Marathon': 21.1, Marathon: 42.2 }
// Races sooner than this are too close to train for, so the search skips them.
export const MIN_WEEKS: Record<string, number> = { '5K': 4, '10K': 6, 'Half Marathon': 8, Marathon: 12 }
export const RADII = [25, 50, 100, 150]
export const HOME_ZIP = '06511'
// Where to search from: ten New England bases (the race list covers New England). Each maps to a downtown ZIP.
export const CITIES: { zip: string; name: string }[] = [
  { zip: '06511', name: 'New Haven, CT' }, { zip: '06103', name: 'Hartford, CT' }, { zip: '06901', name: 'Stamford, CT' },
  { zip: '02108', name: 'Boston, MA' }, { zip: '01608', name: 'Worcester, MA' }, { zip: '01103', name: 'Springfield, MA' },
  { zip: '02903', name: 'Providence, RI' }, { zip: '04101', name: 'Portland, ME' }, { zip: '05401', name: 'Burlington, VT' },
  { zip: '03101', name: 'Manchester, NH' },
]

export function raceQuery(distance: RaceDistance, radius = 150, zip = HOME_ZIP): RaceQuery {
  return { zip, radius_mi: radius, distance, weeks: 52, safety_demo: false, min_weeks: MIN_WEEKS[distance] ?? 0 }
}

export function defaultQuery(state: AppState | null): RaceQuery {
  const d = (DISTANCES as string[]).includes(state?.athlete?.goal_distance ?? '') ? state!.athlete!.goal_distance as RaceDistance : 'Half Marathon'
  return raceQuery(d)
}

/** The five steps from "who are you" to "here's your plan". Order matters: each one needs the one before. */
export const STEPS = [
  { n: 1, short: 'Your runs', title: "Who's running?", blurb: "Upload the runs you've logged with Strava or a Garmin watch, or pick a sample runner. We work out how fit you are right now." },
  { n: 2, short: 'Your race', title: 'Pick your race', blurb: 'Choose how far you want to race. The Race Scout finds real races near you, with enough weeks left to train.' },
  { n: 3, short: 'Preferences', title: 'Your preferences', blurb: 'Which days you can run, which day suits a longer run, gym days, and how hard to push.' },
  { n: 4, short: 'The coaches', title: 'Meet your coaches', blurb: 'The AI coaching team writes your plan and checks it for injury risk. You watch them work, live.' },
  { n: 5, short: 'Your plan', title: 'Your plan is ready', blurb: 'Your calendar to the start line: what to run every day, how far and how fast. Export it to your calendar.' },
] as const
