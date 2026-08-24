import { FOCUS_SLICES } from './slices'
import type { FocusLogEntry, Slice } from './types'

const KEY = 'hs-peak-playbook:focus-v3'
const V2_KEY = 'hs-peak-playbook:focus-v2'
const V1_KEY = 'hs-peak-playbook:focus-v1'

export type FocusStore = {
  byWeek: Record<string, Partial<Record<Slice, string[]>>>
}

const EMPTY: FocusStore = { byWeek: {} }

function unique(names: string[]): string[] {
  return [...new Set(names.filter(Boolean))]
}

function namesOf(value: unknown): string[] {
  if (Array.isArray(value)) return unique(value.filter((n): n is string => typeof n === 'string'))
  if (typeof value === 'string' && value.trim()) return [value]
  return []
}

function weekMap(store: FocusStore, week: string): Partial<Record<Slice, string[]>> {
  return store.byWeek[week] ?? {}
}

function fromV2(byWeek: Record<string, unknown>): FocusStore {
  const next: FocusStore = { byWeek: {} }
  for (const [week, value] of Object.entries(byWeek)) {
    if (Array.isArray(value)) {
      // Pre-audience tags were global. Park them on HS-STEM so Super/K12 don't inherit them.
      next.byWeek[week] = { 'hs-stem': unique(value.filter((n): n is string => typeof n === 'string')) }
      continue
    }
    if (value && typeof value === 'object') {
      const slices = value as Partial<Record<Slice, string[]>>
      next.byWeek[week] = {}
      for (const slice of FOCUS_SLICES) {
        const names = namesOf(slices[slice])
        if (names.length) next.byWeek[week][slice] = names
      }
    }
  }
  return next
}

export function loadFocus(): FocusStore {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(V2_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { byWeek?: Record<string, unknown> }
      return fromV2(parsed.byWeek ?? {})
    }
    const legacy = localStorage.getItem(V1_KEY)
    if (!legacy) return EMPTY
    const old = JSON.parse(legacy) as { names?: string[]; history?: FocusLogEntry[] }
    const byWeek: Record<string, string[]> = {}
    for (const h of old.history ?? []) {
      if (!h.week || !h.rep) continue
      byWeek[h.week] = unique([...(byWeek[h.week] ?? []), h.rep])
    }
    return fromV2(byWeek)
  } catch {
    return EMPTY
  }
}

export function saveFocus(store: FocusStore): void {
  localStorage.setItem(KEY, JSON.stringify(store))
}

export function namesForWeek(store: FocusStore, week: string, slice: Slice): string[] {
  return namesOf(weekMap(store, week)[slice])
}

export function slicesForRep(store: FocusStore, name: string, week: string): Slice[] {
  const map = weekMap(store, week)
  return FOCUS_SLICES.filter((slice) => (map[slice] ?? []).includes(name))
}

export function focusedThisWeek(store: FocusStore, week: string): Array<{ name: string; slices: Slice[] }> {
  const map = weekMap(store, week)
  const names = new Set<string>()
  for (const slice of FOCUS_SLICES) {
    for (const name of map[slice] ?? []) names.add(name)
  }
  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, slices: slicesForRep(store, name, week) }))
}

export function toggleFocus(store: FocusStore, name: string, week: string, slice: Slice): FocusStore {
  const current = namesOf(weekMap(store, week)[slice])
  const on = current.includes(name)
  // Marking one rep never clears another. Off only removes this name.
  const nextNames = on ? current.filter((n) => n !== name) : unique([...current, name])
  const nextWeek = { ...weekMap(store, week), [slice]: nextNames }
  if (nextNames.length === 0) delete nextWeek[slice]
  const byWeek = { ...store.byWeek, [week]: nextWeek }
  if (Object.keys(nextWeek).length === 0) delete byWeek[week]
  return { byWeek }
}

export function historyFromStore(store: FocusStore): FocusLogEntry[] {
  const entries: FocusLogEntry[] = []
  for (const [week, slices] of Object.entries(store.byWeek)) {
    for (const slice of FOCUS_SLICES) {
      for (const rep of slices[slice] ?? []) {
        entries.push({ week, rep, slice, type: 'Focus', owner: null, note: null })
      }
    }
  }
  return entries.sort((a, b) => {
    if (a.week !== b.week) return a.week < b.week ? 1 : -1
    if (a.rep !== b.rep) return a.rep.localeCompare(b.rep)
    return (a.slice ?? '').localeCompare(b.slice ?? '')
  })
}

/** Most recent week before `week` where this rep was focused on this audience. */
export function lastFocusWeekBefore(
  store: FocusStore,
  name: string,
  week: string,
  slice: Slice,
): string | null {
  const weeks = Object.keys(store.byWeek)
    .filter((w) => w < week && (store.byWeek[w]?.[slice] ?? []).includes(name))
    .sort()
  return weeks.at(-1) ?? null
}
