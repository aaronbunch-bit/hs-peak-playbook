import { addDays, isIsoDate, lastCompleteWeekStart, monthStart, sundayWeekStart, toIsoDate, yesterday } from './calendar'
import type { RoutingPeriod } from './types'

/** Looker daily clones stay under this window. */
export const ROUTING_MAX_DAYS = 92

export type DateRange = { start: string; end: string }

function todayIso(): string {
  return toIsoDate(new Date())
}

export function clampRange(start: string, end: string): DateRange {
  let from = isIsoDate(start) ? start : yesterday()
  let to = isIsoDate(end) ? end : todayIso()
  if (from > to) [from, to] = [to, from]
  const today = todayIso()
  if (to > today) to = today
  if (from > to) from = to
  if (addDays(from, ROUTING_MAX_DAYS) < to) from = addDays(to, -ROUTING_MAX_DAYS)
  return { start: from, end: to }
}

export function rangeForRoutingPeriod(
  period: RoutingPeriod,
  from?: string | null,
  to?: string | null,
): DateRange {
  const today = todayIso()
  if (period === 'yesterday') {
    const y = yesterday()
    return { start: y, end: y }
  }
  if (period === 'wtd') return { start: sundayWeekStart(), end: today }
  if (period === 'week') {
    const start = lastCompleteWeekStart()
    return { start, end: addDays(start, 6) }
  }
  if (period === 'mtd') return { start: monthStart(), end: today }
  return clampRange(from ?? yesterday(), to ?? today)
}

export function periodMatchingRange(start: string, end: string): RoutingPeriod {
  const today = todayIso()
  const y = yesterday()
  if (start === y && end === y) return 'yesterday'
  if (start === sundayWeekStart() && end === today) return 'wtd'
  const weekStart = lastCompleteWeekStart()
  if (start === weekStart && end === addDays(weekStart, 6)) return 'week'
  if (start === monthStart() && end === today) return 'mtd'
  return 'custom'
}
