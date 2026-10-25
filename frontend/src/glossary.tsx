// ⓘ tooltips. Definitions come from the backend glossary (engine/glossary.py), the same text the coach chat uses.
import { Info as InfoIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

let cache: Record<string, string> | null = null
let pending: Promise<Record<string, string>> | null = null

function load(): Promise<Record<string, string>> {
  if (cache) return Promise.resolve(cache)
  pending ??= fetch('/api/glossary').then((r) => r.json()).then((g) => (cache = g))
  return pending
}

export function useGlossary(): Record<string, string> {
  const [g, setG] = useState<Record<string, string>>(cache ?? {})
  useEffect(() => { load().then(setG).catch(() => {}) }, [])
  return g
}

export function Info({ term }: { term: string }) {
  const g = useGlossary()
  const text = g[term]
  if (!text) return null
  return (
    <span className="info" tabIndex={0} role="note" aria-label={text}>
      <InfoIcon size={13} aria-hidden="true" /><span className="info-tip" role="tooltip">{text}</span>
    </span>
  )
}
