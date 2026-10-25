
/** Full-screen while the app first loads: the wordmark and a route drawing itself to the finish. */
export function LoadingScreen({ fading }: { fading?: boolean }) {
  return (
    <div className={`loading-screen${fading ? ' fading' : ''}`} role="status" aria-live="polite">
      <div className="loading-inner">
        <div className="loading-mark">
          <img className="brand-mark" src="/pacekit-png/brand/pacelab-mark.png" alt="" />
          <span>PaceLab</span>
        </div>
        <img className="loading-mascot" src="/pacekit-png/loading/shoe-mascot.png" alt="" width={300} height={200} />
        <p className="loading-tip">Getting your coaching staff ready…</p>
      </div>
    </div>
  )
}
