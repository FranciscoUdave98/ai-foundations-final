# PaceLab icon placement guide

Priority: Data. These are suggested placements grounded in earlier screenshots and documented routes, not a verified audit of the current live pages.

Use 28–36px in section headings, 40–56px in KPI cards, and 64–120px on selectable profile cards.

## Data

| Section | PNG | Placement |
| --- | --- | --- |
| Weekly distance | data/weekly-distance.png | Weekly volume and total-distance summaries |
| Training load | data/training-load.png | Load-ratio card and load chart heading |
| Pace | data/pace.png | Pace summaries and pace-zone headings |
| Heart rate | data/heart-rate.png | Heart-rate and pace-versus-HR chart headings |
| Aerobic efficiency | data/aerobic-efficiency.png | Efficiency trend heading |
| Consistency | data/consistency.png | Run frequency and activity heatmap headings |
| Personal bests | data/personal-bests.png | Best efforts and race-prediction section |
| Time on feet | data/duration.png | Activity duration and total training time |
| Elevation | data/elevation.png | Climbing and elevation sections, if present |
| Recovery / readiness | data/recovery.png | Recovery and readiness sections, if present |

## Home

| Section | PNG | Placement |
| --- | --- | --- |
| Boston chaser | runners/boston-chaser.png | Runner-selection card |
| First-timer | runners/first-timer.png | Runner-selection card |
| Weekend runner | runners/weekend-runner.png | Runner-selection card |
| Alternate runner | runners/alternate-runner.png | Optional additional runner artwork |
| Use my own runs | runners/upload-runs.png | Import or upload area |
| Find a race | project/race-search.png | Race-search heading or location filter |
| Race goal | project/race-goal.png | Target distance and target-time summary |
| Your race | features/race-finish.png | Race card or race step |
| Quick plan | features/stopwatch.png | Planning speed feature card |

## Council

| Section | PNG | Placement |
| --- | --- | --- |
| Head Coach | coaches/head-coach.png | Coach card, debate header, or org chart |
| Plan Builder | coaches/plan-builder.png | Coach card, debate header, or org chart |
| Injury Guard | coaches/injury-guard.png | Coach card, debate header, or org chart |
| Strength Coach | coaches/strength-coach.png | Coach card, debate header, or org chart |
| Race-Day Planner | coaches/race-day.png | Coach card, debate header, or org chart |
| Race Scout | coaches/race-scout.png | Coach card, debate header, or org chart |
| Safety Checker | coaches/safety-checker.png | Fixed-rules checker, distinct from AI coaches |

## My Plan

| Section | PNG | Placement |
| --- | --- | --- |
| Running day | week/run.png | Workout or calendar-day card |
| Rest day | week/rest.png | Rest-day card |
| Long run | week/long-run.png | Long-run card or summary |
| Strength | week/gym.png | Gym and strength sessions |
| Race goal | project/race-goal.png | Target and race-day summary |
| Hydration | project/hydration.png | Hydration advice section, if present |
| Fueling | project/fueling.png | Fueling advice section, if present |
| Weekly check-in | project/weekly-checkin.png | Weekly check-in and plan-adjustment entry |
| Export calendar | project/calendar-export.png | Calendar-export panel or button |

## Cost & Safety

| Section | PNG | Placement |
| --- | --- | --- |
| Plan cost | features/low-cost.png | Plan-cost summary |
| Token usage | icons/data.png | Usage summary or token receipt |
| Safety checks | icons/safety.png | Safety rules or validation heading |
| Data privacy | project/privacy.png | Data-handling and privacy explanation |
| Compare plans | project/compare-plans.png | Lean vs Full comparison or experiment heading |

## Shared

| Section | PNG | Placement |
| --- | --- | --- |
| Coach chat | icons/chat.png | Ask-your-coach button |
| PaceLab logo | brand/pacelab-mark.png | Header beside visible PaceLab text |
| Loading mascot | loading/shoe-mascot.png | Loading screen or empty-state illustration |
| Plain shoe | loading/starting-line.png | Alternative loading spot illustration |
| Gentle | week/gentle.png | Effort selector |
| Balanced | week/balanced.png | Effort selector |
| Ambitious | week/ambitious.png | Effort selector |

## Integration

Copy the full pacekit-png folder to frontend/public/. Copy DataIcons.tsx or ProjectIcons.tsx into frontend/src/components/.
For example: <DataMetricIcon name="pace" size={32} /> or <ProjectIcon name="calendar-export" size={32} />.
The current app has not been modified. Keep values, units and chart data as real interface text and plots; do not bake them into artwork.
Keep small functional controls, arrows and chart legends as their current simple icons. Use PNG illustrations to identify sections and larger actions.

## Screenshot-specific data cards

| Section | PNG |
| --- | --- |
| Big Mac Burner | data/burger.png |
| Ice Cream Scoops | data/ice-cream.png |
| Around the World | data/globe.png |
| Central Park Loops | data/park.png |

## Slides & Report

| Section | PNG | Placement |
| --- | --- | --- |
| Slides | icons/slides.png | Navigation tab and presentation entry |
| Report | icons/report.png | Navigation tab and report entry |
| Running injury risk | slides/injury-risk.png | Problem slide about running injuries |
| Coach debate | slides/coach-debate.png | A staff of coaches / shows the argument |
| Physio review / veto | slides/physio-veto.png | An injury expert can veto the plan |
| Safety rules in code | slides/code-rules.png | Safety rules enforced in code |
