// km | mi across the app. The backend works in km; the front end converts for display only.
import { useSyncExternalStore } from 'react'

export type Units = 'km' | 'mi'
const KEY = 'pacelab.units'
const MI = 1.609344
const listeners = new Set<() => void>()

export function getUnits(): Units {
  return (localStorage.getItem(KEY) as Units) === 'mi' ? 'mi' : 'km'
}

export function setUnits(u: Units): void {
  localStorage.setItem(KEY, u)
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

function paceSec(text: string): number {
  const [m, s] = text.split(':').map(Number)
  return m * 60 + s
}

function fmtSec(sec: number): string {
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function formatters(units: Units) {
  const mi = units === 'mi'
  return {
    units,
    unit: mi ? 'mi' : 'km',
    /** 62.9 km -> "62.9 km" or "39.1 mi" */
    dist: (km: number | null | undefined, digits = 1) => km == null ? '—' : `${(mi ? km / MI : km).toFixed(digits)} ${mi ? 'mi' : 'km'}`,
    num: (km: number, digits = 1) => (mi ? km / MI : km).toFixed(digits),
    /** "4:59–5:34/km" -> "8:01–8:57/mi"; leaves other text alone */
    pace: (label: string | null | undefined) => {
      if (!label) return ''
      if (!mi) return label
      return label.replace(/(\d{1,2}:\d{2})/g, (t) => fmtSec(paceSec(t) * MI)).replace('/km', '/mi')
    },
  }
}

export function useUnits() {
  const units = useSyncExternalStore(subscribe, getUnits)
  return formatters(units)
}
