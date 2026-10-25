/** A race route drawing itself toward a finish flag, a dot running along it. Used by every loading state.
 *  Colors from theme tokens; motion in flow.css, stopped under prefers-reduced-motion. */
const ROUTE = 'M12 58 C 40 58, 44 22, 76 22 S 110 54, 140 50 S 176 18, 204 26'

export function RouteLoader({ size = 'md', label = 'Loading' }: { size?: 'sm' | 'md'; label?: string }) {
  const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <svg className={`route-loader route-${size}`} viewBox="0 0 224 72" role="img" aria-label={label}>
      <path className="rl-base" d={ROUTE} />
      <path className="rl-draw" d={ROUTE} pathLength={100} />
      <circle className="rl-start" cx="12" cy="58" r="4" />
      <g className="rl-flag" transform="translate(204 26)">
        <line x1="0" y1="0" x2="0" y2="-20" />
        <path d="M0 -20 L 13 -15.5 L 0 -11 Z" />
      </g>
      {!still && (
        <circle className="rl-dot" r="5">
          <animateMotion dur="1.8s" repeatCount="indefinite" path={ROUTE} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.55 1" />
        </circle>
      )}
    </svg>
  )
}
