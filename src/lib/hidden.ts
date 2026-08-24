const KEY = 'hs-peak-playbook:hidden-reps-v1'

export function loadHiddenReps(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : []
  } catch {
    return []
  }
}

export function saveHiddenReps(names: string[]): void {
  localStorage.setItem(KEY, JSON.stringify([...new Set(names)].sort((a, b) => a.localeCompare(b))))
}

export function hideRep(names: string[], name: string): string[] {
  if (names.includes(name)) return names
  return [...names, name]
}

export function showRep(names: string[], name: string): string[] {
  return names.filter((n) => n !== name)
}
