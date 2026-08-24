import type { RosterEntry } from './types'

export const LC_LEVELS = ['LC1', 'LC2', 'LC3', 'LC4'] as const
export type LcLevel = (typeof LC_LEVELS)[number]

const KEY = 'hs-peak-playbook:roster-levels-v1'

export function isLcLevel(value: string | null | undefined): value is LcLevel {
  return !!value && (LC_LEVELS as readonly string[]).includes(value)
}

export function loadRosterLevels(): Record<string, string | null> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string | null>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveRosterLevels(levels: Record<string, string | null>): void {
  localStorage.setItem(KEY, JSON.stringify(levels))
}

export function applyRosterLevels(
  roster: RosterEntry[],
  levels: Record<string, string | null>,
): RosterEntry[] {
  return roster.map((entry) =>
    Object.prototype.hasOwnProperty.call(levels, entry.name)
      ? { ...entry, level: levels[entry.name] }
      : entry,
  )
}

export function setRosterLevel(
  levels: Record<string, string | null>,
  name: string,
  level: string | null,
): Record<string, string | null> {
  return { ...levels, [name]: level }
}
