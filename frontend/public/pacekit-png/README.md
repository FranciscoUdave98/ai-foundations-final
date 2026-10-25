# PaceLab PNG assets
Open preview.html or loading-demo.html directly in a browser. These pages embed their images and styles and need no network, login, dependencies, or API keys.

## Assets
- coaches/: seven simplified transparent portraits, up to 512px. Use 48–96px in the app.
- icons/: four transparent navigation graphics, up to 128px. Use 28–40px in the app.
- loading/starting-line.png: transparent isolated shoe illustration, up to 768px. Use 220–300px.
- originals/: full-resolution generated PNGs with alpha, preserved.
- PaceKit.tsx: optional React components for these files.
- PROMPTS.json: complete generation prompts.

## Add to your project
Copy this whole pacekit-png folder into frontend/public/.
Copy PaceKit.tsx into frontend/src/components/.
Import CoachAvatar, PaceNavIcon or PaceLoading where needed. The components use /pacekit-png/... paths and require no packages beyond your existing React install.

Agent mapping:
monk -> head-coach
wallbreaker -> plan-builder
taper -> injury-guard
guru -> strength-coach
kickstarter -> race-day
whisperer -> race-scout
marshal -> safety-checker

Use CoachAvatar name="head-coach" size={64} beside a visible job title.
For decorative avatars omit label. If the image communicates meaning on its own, supply label.
PaceNavIcon is decorative; keep visible labels on navigation buttons.
PaceLoading accepts label and detail props. Bind label to your actual app state.
The HTML loading demo adds a subtle CSS float and activity dots, with prefers-reduced-motion support. Its artwork is static PNG. It does not invent percentages or impose delays.
The optional React loader is static and avoids requiring global CSS.

Grading: commit the assets to the repository with the app. They render as normal local images. Only the existing AI features require their own backend setup. The asset previews do not.

The running app has not been edited. Originals were made with built-in image generation; delivery sizes are mechanically downsampled PNGs.


## Expanded assets and previews
This ZIP supersedes the earlier kit and includes the earlier coach and navigation PNGs.
- runners/: Boston chaser, first-timer, weekend runner, upload card.
- icons/chat.png: matching chat button.
- brand/: new logo mark plus 32px PNG favicon and multi-size ICO.
- features/: stopwatch, low-cost coins, race finish.
- loading/shoe-mascot.png: playful running-shoe character.
- runner-cards.html: runner selection + chat preview.
- home-section.html: illustrated feature cards and four-step explanation.
- loading-fun.html: mascot loading preview with reduced-motion support.
- coach-preview.html: prior coach kit preview.
- preview.html: entry point linking all previews.
- PaceExtras.tsx + PaceExtras.css: optional React wrappers and a scoped loading component. Copy both into src/components.

All HTML preview images are embedded, so the pages can open offline. Previews are illustrative, not a deployed app. Home-page metrics reproduce the provided screenshot; no performance, safety or pricing claim was independently verified.
Use the original app's actual status for FunLoading.status. Its animation is an activity cue, not measured progress. Keep the visible navigation/card labels; decorative images use empty alt.
For the favicon, add <link rel="icon" type="image/png" href="/pacekit-png/brand/favicon-32.png"> to the app's index.html. Keep visible PaceLab text next to the logo in the header.
The logo is generated raster artwork, not a vector master.


## Week-planner update
Open week-planner.html for the interactive visual preview.
- week/: rest, run (reused runner artwork), long run, gym, gentle, balanced, ambitious PNGs.
- WeekPlanner.tsx + WeekPlanner.css: optional React component and scoped styles. Copy both into frontend/src/components. Assets stay in frontend/public/pacekit-png/.
- The React component accepts initial preferences, onChange, and onContinue callbacks. Wire these to the app's existing preference state and navigation. Its day indexes are Monday=0 through Sunday=6; map these if your backend uses different indexes.
- The layout removes unsupported "Perfect week"/"Injury-proof" labels and summarizes selected days instead. It does not validate safety or prescribe workouts.
- Changing a running day to rest clears its long-run selection. Only running days can be the long-run day. Gym sessions remain independent.
- Previews support keyboard interaction, accessible button states, responsive layout, and reduced motion.
The running app has not been edited.

## Simplified race and shoe graphics
features/race-finish.png is now one finish flag without a road or gate. loading/starting-line.png is the isolated shoe without the track or flag. All embedded previews were updated. The separate shoe mascot is unchanged.

Alternate runner: runners/alternate-runner.png — an additional woman runner illustration. This is an optional asset; existing runner cards remain in place.


## Data-dashboard icon set
Open data-icons.html for all six PNGs, heading-size examples, downloads, and placement notes.
Files: data/weekly-distance.png, training-load.png, heart-rate.png, aerobic-efficiency.png, consistency.png, personal-bests.png.
Delivery PNGs are up to 256px with transparent alpha. Full-resolution originals are preserved in originals/data/.
Recommended display: 28–36px beside chart headings; 40–56px on summary cards. Keep artwork outside plotting areas.
Copy DataIcons.tsx to frontend/src/components and keep this folder in frontend/public/pacekit-png/.
<DataMetricIcon name="heart-rate" size={32} /> is decorative by default. Supply label when no visible text describes the metric.
Suggested placements use PaceLab's documented metrics. The live #data layout was not inspected because the desktop connection was offline. The running application has not been modified.


## Data-first page-by-page expansion
Data now has ten metric PNGs, adding pace, duration, elevation and recovery/readiness. Use elevation and recovery only where those metrics are actually shown.
Eight additional PNGs cover race search, race goals, hydration, fueling, weekly check-in, calendar export, privacy and plan comparison.
- page-icons.html: page-by-page visual inventory, starting on Data.
- data-icons.html: updated ten-icon data set and heading-size examples.
- ICON-MAP.md: suggested placement table for Data, Home, Council, My Plan, Cost & Safety, and shared UI.
- icons-manifest.json: structured page-to-file map.
- DataIcons.tsx: now supports all ten data icons.
- ProjectIcons.tsx: optional typed wrapper for the broader set.
The live localhost pages were not inspected because the desktop connection was offline. This expansion uses earlier screenshots and documented routes. It is not an implemented or verified redesign of the current site. The app itself has not been modified.


## Screenshot-specific data cards and slide icons
Open data-fun-stats.html for the four cards from your screenshot: Big Mac Burner, Ice Cream Scoops, Around the World, and Central Park Loops.
Food now uses natural colors: golden bun/cone, brown patties, green lettuce, yellow cheese, and vanilla scoops. The blue ingredient and cone variants are not included.
Open slides-report-icons.html for Slides/Report navigation icons, running-injury risk, coach debate, physio review/veto, and code-enforced safety.
FunDataStats.tsx + FunDataStats.css accept your real computed values; the HTML demo repeats screenshot values only.
SlidesReportIcons.tsx is a small optional React wrapper. DataIcons.tsx and ProjectIcons.tsx include all added assets.
These are icons and preview fragments, not newly authored presentation or report files.
No live application files were edited. All earlier PNG assets remain included.
