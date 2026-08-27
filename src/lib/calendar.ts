/** Looker dash 7699 uses Sunday week starts (e.g. 2026-08-09). */

export function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function sundayWeekStart(d = new Date()): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  copy.setDate(copy.getDate() - copy.getDay())
  return toIsoDate(copy)
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

export function previousSunday(iso: string): string {
  return addDays(iso, -7)
}

export function yesterday(d = new Date()): string {
  return addDays(toIsoDate(d), -1)
}

/** Sunday start of the most recently closed week. */
export function lastCompleteWeekStart(d = new Date()): string {
  return previousSunday(sundayWeekStart(d))
}

/** Inclusive Sunday → today (ISO dates) for the in-progress week. */
export function daysSundayThroughToday(d = new Date()): string[] {
  const start = sundayWeekStart(d)
  const today = toIsoDate(d)
  const out: string[] = []
  for (let iso = start; iso <= today; iso = addDays(iso, 1)) out.push(iso)
  return out
}
