import { RunnerScene } from './RunnerScene'

/** Full-screen while something slow happens: a runner on a night road and the steps so far. */
export function LoadingScreen({ title, steps, current, tip, fading }: { title: string; steps: string[]; current: number; tip?: string; fading?: boolean }) {
  return (
    <div className={`loading-screen${fading ? ' fading' : ''}`} role="status" aria-live="polite">
      <div className="loading-inner">
        <RunnerScene />
        <h2>{title}</h2>
        {steps.length > 0 && (
          <ol className="loading-steps">
            {steps.map((s, i) => <li key={s} className={i < current ? 'done' : i === current ? 'now' : 'todo'}>{s}</li>)}
          </ol>
        )}
        {tip && <p className="loading-tip">{tip}</p>}
      </div>
    </div>
  )
}
