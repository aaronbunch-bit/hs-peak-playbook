import type { FocusLogEntry } from './types'

const KEY = 'hs-peak-playbook:focus-v2'
const LEGACY_KEY = 'hs-peak-playbook:focus-v1'

export type FocusStore = {
  byWeek: Record<string, string[]>
}

const EMPTY: FocusStore = { byWeek: {} }

function unique(names: string[]): string[] {
  return [...new Set(names.filter(Boolean))]
}

export function loadFocus(): FocusStore {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as FocusStore
      return { byWeek: parsed.byWeek ?? {} }
    }
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (!legacy) return EMPTY
    const old = JSON.parse(legacy) as { names?: string[]; history?: FocusLogEntry[] }
    const byWeek: Record<string, string[]> = {}
    for (const h of old.history ?? []) {
      if (!h.week || !h.rep) continue
      byWeek[h.week] = unique([...(byWeek[h.week] ?? []), h.rep])
    }
    return { byWeek }
  } catch {
    return EMPTY
  }
}

export function saveFocus(store: FocusStore): void {
  localStorage.setItem(KEY, JSON.stringify(store))
}

export function namesForWeek(store: FocusStore, week: string): string[] {
  return store.byWeek[week] ?? []
}

export function toggleFocus(store: FocusStore, name: string, week: string): FocusStore {
  const current = store.byWeek[week] ?? []
  const on = current.includes(name)
  const next = on ? current.filter((n) => n !== name) : unique([...current, name])
  return {
    byWeek: {
      ...store.byWeek,
      [week]: next,
    },
  }
}

export function historyFromStore(store: FocusStore): FocusLogEntry[] {
  const entries: FocusLogEntry[] = []
  for (const [week, names] of Object.entries(store.byWeek)) {
    for (const rep of names) {
      entries.push({ week, rep, type: 'Focus', owner: null, note: null })
    }
  }
  return entries.sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : a.rep.localeCompare(b.rep)))
}

/** Most recent closed/focus week before `week` that included this rep. */
export function lastFocusWeekBefore(store: FocusStore, name: string, week: string): string | null {
  const weeks = Object.keys(store.byWeek)
    .filter((w) => w < week && (store.byWeek[w] ?? []).includes(name))
    .sort()
  return weeks.at(-1) ?? null
}
