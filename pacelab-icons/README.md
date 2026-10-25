# PaceLab — Blue Hour

30 custom interface SVGs, seven coach emblems, a brand mark, animated track, and a React loading-screen replacement.

Open preview.html directly in your browser. No packages or network required.

## Icons
All interface icons use a 24 × 24 viewBox, 1.7 px stroke and currentColor. Recommended sizes: 20 or 24 px. Inline SVG or the icons.svg sprite inherits CSS color; SVG used through an img tag does not inherit currentColor (defaults to black). Use the colored agent emblems for img tags on dark backgrounds, at 40–64 px. Agent titles remain visible in the app; mark adjacent decorative icons aria-hidden.

## Agent mapping
- monk: agents/monk.svg — Head Coach (interface version: icons/head-coach.svg)
- whisperer: agents/whisperer.svg — Race Scout (interface version: icons/race-scout.svg)
- wallbreaker: agents/wallbreaker.svg — Plan Builder (interface version: icons/plan-builder.svg)
- taper: agents/taper.svg — Injury Guard (interface version: icons/injury-guard.svg)
- kickstarter: agents/kickstarter.svg — Race-Day Planner (interface version: icons/race-day-planner.svg)
- guru: agents/guru.svg — Strength Coach (interface version: icons/strength-coach.svg)
- marshal: agents/marshal.svg — Safety Checker (interface version: icons/safety-checker.svg)

## Loading screen
Copy loading/LoadingScreen.tsx and loading/loading.css together into frontend/src/components/, replacing the existing LoadingScreen.tsx only after reviewing. Its existing fading prop is preserved. The SVG track animation respects reduced motion. No fake percentages or claims about completed backend work. Keep existing App.tsx lifecycle and error handling. Repeated instances of the component would need unique SVG gradient IDs.

## Design
Blue Hour: ink navy #09111E, electric blue #75B4FF, soft white #E5EFFF, lime #D2F53C as a small motion accent. Coaches share a technical badge silhouette, with unique job symbols and restrained secondary colors. Original vector paths, no fonts or external assets.

These assets are supplied separately. No existing application files were modified.
