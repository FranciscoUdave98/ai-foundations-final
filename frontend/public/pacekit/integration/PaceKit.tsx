import type { CSSProperties } from 'react'
/** Copy to src/components. Assets remain in public/pacekit. */
export function PaceIcon({ name, size = 24, color = 'currentColor', label }: {name: string; size?: number; color?: string; label?: string}) {
 return <svg width={size} height={size} style={{color} as CSSProperties} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}><use href={'/pacekit/pacekit-sprite.svg#pl-' + name}/></svg>
}
export function CoachEmblem({ name, size = 64, label }: {name: string; size?: number; label?: string}) {
 return <img src={'/pacekit/coaches/' + name + '.svg'} width={size} height={size} alt={label || ''}/>
}
/** Import /pacekit/loading/loading.css in the app's entry HTML, or copy it to src. */
export function PaceLoading({label = 'Getting your team ready.', detail = 'Your next chapter starts with a smarter plan.'}: {label?: string; detail?: string}) {
 return <div className="pace-loading" role="status" aria-live="polite"><div className="pace-loading__inner"><div className="pace-loading__label">PaceLab / Your AI coaching staff</div><img className="pace-loading__track" src="/pacekit/loading/track-loop.svg" width="440" height="260" alt=""/><h1>{label}</h1><p>{detail}</p><div className="pace-loading__dots" aria-hidden="true"><i/><i/><i/></div></div></div>
}
