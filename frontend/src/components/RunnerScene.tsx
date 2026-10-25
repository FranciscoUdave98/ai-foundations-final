/** A minimal runner in stride over a moving track line. Colors from theme tokens; motion in runner.css,
 *  stopped under prefers-reduced-motion. */
export function RunnerScene({ className = '' }: { className?: string }) {
  return (
    <svg className={`runner-mark ${className}`} viewBox="0 0 200 132" role="img" aria-label="A runner">
      <svg className="rm-runner" x="40" y="0" width="120" height="120" viewBox="0 0 120 120" overflow="visible">
        <g className="rm-body">
          <g className="rm-arm rm-back"><path d="M60 40 L 50 54 L 58 64" /></g>
          <g className="rm-leg rm-back"><path d="M56 70 L 50 92 L 40 104" /></g>
          <path d="M62 34 L 56 70" />
          <circle className="rm-head" cx="65" cy="22" r="8" />
          <g className="rm-leg rm-front"><path d="M56 70 L 66 90 L 62 110" /></g>
          <g className="rm-arm rm-front"><path d="M60 40 L 72 50 L 80 42" /></g>
        </g>
      </svg>
      <line className="rm-track" x1="10" y1="124" x2="190" y2="124" />
    </svg>
  )
}
