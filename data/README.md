# PaceLab data pack

Drop this folder's contents into the repo's `data/` folder. Everything here is safe to commit: no real names, GPS, or personal data.

## 1. `races_cache.json` / `races.csv`: real races

103 real races in NYC + all six New England states, 5K to marathon (no ultras), from **Oct 24, 2026 to Oct 24, 2027**. Use it as the Race Scout's offline fallback when the RunSignup API is down.

| Field | Meaning |
| --- | --- |
| `date_status` | `confirmed` = official/organizer page or the race's own RunSignup listing · `reported` = third-party calendar(s) · `estimated` = projected from the race's usual weekend |
| `lat`, `lon` | Approximate town/park centroid, good enough for a radius filter (haversine from the user's zip) |
| `distances`, `distance_km` | Every distance offered; km values are standard (half = 21.1, marathon = 42.2) |
| `price_usd` | Lowest listed adult entry fee where found; `null` otherwise |
| `source`, `url` | Where the date came from; descriptions are written fresh, not copied |

Counts: MA 25 · CT 24 · NH 18 · NY 16 · RI 13 · ME 6 · VT 1. Confirmed 71 · reported 17 · estimated 15.

The app should show the `date_status` badge on each race card, so estimated dates are never presented as fact.

**Live API, confirmed working with no key:**
`https://runsignup.com/Rest/races?format=json&state=CT&start_date=2026-10-24&end_date=2027-10-24&min_distance=5&max_distance=42.2&distance_units=K&results_per_page=100&events=T`
(add `zipcode=06511&radius=50` for a radius search). Responses include long HTML race descriptions. Strip them through the Guardian before any agent sees them; this is the prompt-injection surface.

## 2. `sample/`: training data for three anonymized athletes

Six months (Apr 26 – Oct 24, 2026), deterministic (re-run `build_training_data.py` for identical output).

| Athlete | Profile | Runs | km | Gym |
| --- | --- | --- | --- | --- |
| `athlete_a` | Marathoner chasing a BQ, calibrated to a real runner's Garmin data | 118 | 1,153 | 48 (Mon/Thu) |
| `athlete_b` | Beginner building to a first 5K | 76 | 320 | – |
| `athlete_c` | Recreational half-marathoner | 94 | 732 | – |

Files per athlete:

- `activities.csv`: Strava-export column names (`Activity Date`, `Activity Type`, `Moving Time` in s, `Distance` in km, `Average Heart Rate`, `Average Speed` in m/s, `Relative Effort`, `Workout Type` 1 = race, 2 = long, 3 = workout). Runs plus `Weight Training` sessions.
- `wellness_daily.csv`: Garmin-style daily metrics: sleep hours/score/deep/REM, resting HR, overnight HRV + status, VO2max, Body Battery high/low, stress, training readiness, steps, intensity minutes.
- `athlete.json`: profile, units, and the scripted events below.

**Scripted demo events in `athlete_a`** (so every agent has something to react to):

| When | Event | What the agents should notice |
| --- | --- | --- |
| Jun 28 – Jul 4 | Sick week | 0 km; RHR +6, HRV −18, VO2max dips for two weeks |
| Aug 2 – 8 | Relocation week | Volume drops ~60%, sleep −1 h, stress up |
| Sep 13 | Half marathon race, 1:39:33 | Sets training paces; a long way from the 1:30 goal |
| Last 2 weeks | Mileage spike to ~77 then ~79 km/week (1.41× and 1.45× the prior 4-week average of ~54 km) | HRV ~74 → ~60, RHR +3–4, readiness ~70 → 40s → **Physio should veto** |

## 3. Calibration (done)

`athlete_a` is calibrated to a real runner's Garmin data (pulled Oct 24, 2026): resting HR 43, overnight HRV ~78 ms, VO2max 50.6 → 55.6 over the last 90 days, sleep ~7.3 h with scores in the 80s, easy pace ~6:25/km at HR ~143, max HR ~187–189, mostly evening runs, about 42–56 km/week. Garmin's current predictions (5K 21:21, half 1:41:50, marathon 3:41:58) set the race and workout paces. The values live in `calibration_a.json`. Nothing identifying is included: no names, GPS, locations or real activity IDs, and every run is regenerated, not copied.
