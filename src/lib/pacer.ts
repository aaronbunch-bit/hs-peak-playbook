import { daysSundayThroughToday } from './calendar'
import { expectedPgc, type LcCurves } from './settings'
import type {
  Cohort,
  DailyRow,
  FocusLogEntry,
  PacerPayload,
  RepRow,
  Staffing,
  Trend,
  WeeklyRow,
  WeekPoint,
} from './types'

export const TARGET_PGC = 0.2
export const IMPROVE_PTS = 0.03
export const DEGRADE_PTS = -0.03

export function weekOverWeek(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null) return null
  return current - previous
}

export function trendFromDelta(deltaWow: number | null): Trend | null {
  if (deltaWow == null) return null
  if (deltaWow >= IMPROVE_PTS) return 'up'
  if (deltaWow <= DEGRADE_PTS) return 'down'
  return 'stagnant'
}

export function inCohort(level: string | null, cohort: Cohort): boolean {
  if (cohort === 'all') return true
  if (!level) return false
  if (cohort === 'lc4') return level.toUpperCase() === 'LC4'
  const n = level.toUpperCase()
  return n === 'LC1' || n === 'LC2' || n === 'LC3'
}

function seriesForRep(weeks: string[], rows: WeeklyRow[], name: string): WeekPoint[] {
  const byWeek = new Map(rows.filter((r) => r.rep === name).map((r) => [r.week, r]))
  return weeks.map((week, i) => {
    const row = byWeek.get(week)
    const prev = weeks[i + 1] ? byWeek.get(weeks[i + 1]) : undefined
    return {
      week,
      pgc: row?.pgc ?? null,
      cc90: row?.cc90 ?? null,
      deltaWow: weekOverWeek(row?.pgc, prev?.pgc),
      mix: row?.mix ?? null,
      hsPgc: row?.hsPgc ?? null,
      hsCc90: row?.hsCc90 ?? null,
      hsMix: row?.hsMix ?? null,
      k12Pgc: row?.k12Pgc ?? null,
      k12Cc90: row?.k12Cc90 ?? null,
      k12Mix: row?.k12Mix ?? null,
      totalPgc: row?.totalPgc ?? null,
    }
  })
}

export function staffingOf(entry: { staffing?: Staffing | null }): Staffing {
  return entry.staffing === 'cross-train' ? 'cross-train' : 'primary'
}

export type WeekKpis = {
  teamPgc: number | null
  atTarget: number
  improving: number
  slipping: number
  focusCount: number
  n: number
}

function weightedPgc(rows: { pgc: number | null | undefined; cc90: number | null | undefined }[]): number | null {
  const withVol = rows.filter((r) => r.pgc != null && r.cc90 != null && (r.cc90 ?? 0) > 0)
  if (withVol.length > 0) {
    return (
      withVol.reduce((sum, r) => sum + (r.pgc ?? 0) * (r.cc90 ?? 0), 0) /
      withVol.reduce((sum, r) => sum + (r.cc90 ?? 0), 0)
    )
  }
  const withPgc = rows.filter((r) => r.pgc != null)
  if (withPgc.length === 0) return null
  return withPgc.reduce((sum, r) => sum + (r.pgc ?? 0), 0) / withPgc.length
}

export function weekKpis(rows: RepRow[], focusNames: Set<string>): WeekKpis {
  return {
    teamPgc: weightedPgc(rows.map((r) => ({ pgc: r.pgc, cc90: r.cc90 }))),
    atTarget: rows.filter((r) => r.atTarget).length,
    improving: rows.filter((r) => r.trend === 'up').length,
    slipping: rows.filter((r) => r.trend === 'down').length,
    focusCount: rows.filter((r) => focusNames.has(r.name)).length,
    n: rows.length,
  }
}

export type WtdKpis = {
  teamPgc: number | null
  latestDayPgc: number | null
  latestDay: string | null
  atTarget: number
  improving: number
  focusCount: number
  n: number
}

/** Most recent day in the WTD grid that has any pGC or cc90. */
export function latestActiveDay(rows: DailyRepRow[]): string | null {
  const days = rows[0]?.days.map((d) => d.date) ?? []
  for (let i = days.length - 1; i >= 0; i--) {
    const hasVol = rows.some((r) => {
      const day = r.days[i]
      return day != null && (day.pgc != null || (day.cc90 != null && day.cc90 > 0))
    })
    if (hasVol) return days[i]
  }
  return days.at(-1) ?? null
}

export function wtdKpis(rows: RepRow[], dailyRows: DailyRepRow[], focusNames: Set<string>): WtdKpis {
  const latestDay = latestActiveDay(dailyRows)
  const latestDayPgc = latestDay
    ? weightedPgc(
        dailyRows.map((r) => {
          const day = r.days.find((d) => d.date === latestDay)
          return { pgc: day?.pgc, cc90: day?.cc90 }
        }),
      )
    : null
  return {
    teamPgc: weightedPgc(rows.map((r) => ({ pgc: r.wtdPgc, cc90: r.wtdCc90 }))),
    latestDayPgc,
    latestDay,
    atTarget: rows.filter((r) => r.wtdAtTarget).length,
    improving: dailyRows.filter((r) => {
      const day = latestDay ? r.days.find((d) => d.date === latestDay) : r.days.at(-1)
      return day?.dod != null && day.dod >= IMPROVE_PTS
    }).length,
    focusCount: rows.filter((r) => focusNames.has(r.name)).length,
    n: rows.length,
  }
}

export function buildRows(
  payload: PacerPayload,
  cohort: Cohort,
  targetPgc: number,
  options: { weekIndex?: number; staffing?: Staffing; lcCurves: LcCurves },
): RepRow[] {
  const weeks = payload.weeks
  const weekIndex = Math.min(Math.max(options.weekIndex ?? 0, 0), Math.max(weeks.length - 1, 0))
  const isLatest = weekIndex === 0
  const wtdByRep = new Map((payload.wtd ?? []).map((r) => [r.rep, r]))
  const staffing = options.staffing ?? 'primary'
  const curves = options.lcCurves
  return payload.roster
    .filter((r) => inCohort(r.level, cohort))
    .filter((r) => staffingOf(r) === staffing)
    .map((r) => {
      const weeksSeries = seriesForRep(weeks, payload.weekly, r.name)
      const point = weeksSeries[weekIndex]
      const pgc = point?.pgc ?? null
      const cc90 = point?.cc90 ?? null
      const deltaWow = point?.deltaWow ?? null
      const wtd = isLatest ? wtdByRep.get(r.name) : undefined
      const wtdPgc = wtd?.pgc ?? null
      const expect = expectedPgc(targetPgc, r.level, curves)
      return {
        name: r.name,
        level: r.level,
        manager: r.manager,
        pgc,
        cc90,
        mix: point?.mix ?? null,
        expectedPgc: expect,
        deltaWow,
        trend: trendFromDelta(deltaWow),
        atTarget: pgc != null && pgc >= expect,
        wtdPgc,
        wtdCc90: wtd?.cc90 ?? null,
        wtdVsLast: weekOverWeek(wtdPgc, pgc),
        wtdAtTarget: wtdPgc != null && wtdPgc >= expect,
        weeks: weeksSeries,
        focusHistory: payload.focusLog.filter((f) => f.rep === r.name),
      }
    })
}

export type DailyPoint = {
  date: string
  pgc: number | null
  cc90: number | null
  dod: number | null
}

export type DailyRepRow = {
  name: string
  manager: string | null
  level: string | null
  expectedPgc: number
  days: DailyPoint[]
}

export function buildDailyRows(
  payload: PacerPayload,
  cohort: Cohort,
  targetPgc: number,
  options: { staffing?: Staffing; lcCurves: LcCurves },
): DailyRepRow[] {
  const days = payload.dailyDays?.length ? payload.dailyDays : daysSundayThroughToday()
  const daily = payload.daily ?? []
  const byRep = new Map<string, DailyRow[]>()
  for (const row of daily) {
    const list = byRep.get(row.rep) ?? []
    list.push(row)
    byRep.set(row.rep, list)
  }
  const staffing = options.staffing ?? 'primary'
  const curves = options.lcCurves
  return payload.roster
    .filter((r) => inCohort(r.level, cohort))
    .filter((r) => staffingOf(r) === staffing)
    .map((r) => {
      const rows = byRep.get(r.name) ?? []
      const byDate = new Map(rows.map((row) => [row.date, row]))
      const series: DailyPoint[] = days.map((date, i) => {
        const row = byDate.get(date)
        const prev = i > 0 ? byDate.get(days[i - 1]) : undefined
        return {
          date,
          pgc: row?.pgc ?? null,
          cc90: row?.cc90 ?? null,
          dod: weekOverWeek(row?.pgc, prev?.pgc),
        }
      })
      return {
        name: r.name,
        manager: r.manager,
        level: r.level,
        expectedPgc: expectedPgc(targetPgc, r.level, curves),
        days: series,
      }
    })
}

/** Missing pGC always sorts after real values, for both asc and desc. */
export function comparePgcNullsLast(
  a: number | null | undefined,
  b: number | null | undefined,
  dir: 'asc' | 'desc',
): number {
  const aMissing = a == null
  const bMissing = b == null
  if (aMissing && bMissing) return 0
  if (aMissing) return 1
  if (bMissing) return -1
  const sign = dir === 'asc' ? 1 : -1
  if (a === b) return 0
  return sign * ((a as number) - (b as number))
}

export function pgcOnDate(row: DailyRepRow, date: string): number | null {
  return row.days.find((d) => d.date === date)?.pgc ?? null
}

export function formatPgc(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${(value * 100).toFixed(1)}%`
}

/** 1% = 100 bps. A 0.01 pGC delta (1 point) is 100 bps. */
export function formatBps(value: number | null | undefined): string {
  if (value == null) return '—'
  const bps = Math.round(value * 10000)
  const sign = bps > 0 ? '+' : ''
  return `${sign}${bps.toLocaleString('en-US')} bps`
}

export function formatWeek(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatWeekRange(start: string): string {
  const [y, m, d] = start.split('-').map(Number)
  const from = new Date(y, m - 1, d)
  const to = new Date(y, m - 1, d + 6)
  const a = from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const b = to.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${a}–${b}`
}

export function formatWeekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'short' })
}

export function mergeFocusLog(
  seed: FocusLogEntry[],
  extra: FocusLogEntry[],
): FocusLogEntry[] {
  const seen = new Set(seed.map((e) => `${e.week}|${e.rep}|${e.slice ?? ''}`))
  const merged = [...seed]
  for (const e of extra) {
    const key = `${e.week}|${e.rep}|${e.slice ?? ''}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(e)
    }
  }
  return merged.sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : a.rep.localeCompare(b.rep)))
}
