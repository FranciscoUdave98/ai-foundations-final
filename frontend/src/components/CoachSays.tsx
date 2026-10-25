import type { ReactNode } from 'react'
import { AGENTS, AgentIcon } from '../agents'
import type { Persona } from '../types'

/** A coach's portrait with a speech bubble: the one-line voice that explains each page. */
export function CoachSays({ id, children, size = 'md', className = '' }: { id: Persona; children: ReactNode; size?: 'md' | 'lg'; className?: string }) {
  return (
    <div className={`coach-says cs-${size} ${className}`}>
      <AgentIcon id={id} size="lg" />
      <div className="scout-bubble">
        <span className="scout-name" style={{ color: `var(--agent-${id})` }}>{AGENTS[id].title} <small>{AGENTS[id].nick}</small></span>
        <p>{children}</p>
      </div>
    </div>
  )
}
