# PaceKit

Original SVG assets for PaceLab. Preview: http://localhost:5173/pacekit/preview.html
Full-screen loader: http://localhost:5173/pacekit/loading-demo.html

## Contents
- coaches/: 7 original 64×64 portrait emblems. Recommended display 40–80 px. Use the utility icons below 32 px.
- icons/: 18 consistent 24×24 standalone icons, including 3 athlete profiles. Transparent background, electric blue strokes.
- brand/mark.svg: original PaceLab mark.
- loading/track-loop.svg: animated running track, with reduced-motion support.
- pacekit-sprite.svg: interface symbols using currentColor.
- integration/PaceKit.tsx: optional React wrappers. Copy into src/components when ready.
- loading/loading.css: scoped styles for the optional PaceLoading component.

## React integration
Copy integration/PaceKit.tsx to src/components/PaceKit.tsx. Leave assets in public/pacekit.
Add <link rel="stylesheet" href="/pacekit/loading/loading.css"> to frontend/index.html (or copy CSS to src and import).

<CoachEmblem name="head-coach" size={64} label="Head Coach" />
<PaceIcon name="council" size={24} color="var(--brand)" />
<PaceLoading label="Getting your team ready." />

Agent mappings: monk → head-coach; whisperer → race-scout; wallbreaker → plan-builder; taper → injury-guard; kickstarter → race-day; guru → strength-coach; marshal → safety-checker.

Use decorative images with alt="". Keep visible job titles next to coach emblems. The loading animation expresses activity, not measured progress. Drive real step text from your existing loading state. No fake percentages or extra minimum wait.

The running application has not been modified. This folder is an asset kit plus isolated previews.
Designed for dark asphalt surfaces, with blue primary accents per AGENTS.md; existing lime retained for the brand and Head Coach. No fonts, external images, trackers, network requests or new dependencies.
