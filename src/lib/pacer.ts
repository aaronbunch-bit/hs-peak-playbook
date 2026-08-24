import { expectedPgc, type LcCurves } from './settings'
import type {
  Cohort,
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

function avgNums(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/**
 * avg(newest 3 consecutive) − avg(next 3 consecutive) when six calendar weeks exist.
 * If a week is missing, falls back to this week vs the average of the prior 3 populated weeks.
 */
export function delta3wk(newestFirst: Array<number | null | undefined>): number | null {
  const first = newestFirst.slice(0, 3)
  const second = newestFirst.slice(3, 6)
  if (
    first.length === 3 &&
    second.length === 3 &&
    first.every((v) => v != null) &&
    second.every((v) => v != null)
  ) {
    return avgNums(first as number[]) - avgNums(second as number[])
  }
  const populated = newestFirst.filter((v): v is number => v != null)
  if (populated.length < 4) return null
  return populated[0] - avgNums(populated.slice(1, 4))
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

export function weekKpis(rows: RepRow[], focusNames: Set<string>): WeekKpis {
  const withVol = rows.filter((r) => r.pgc != null && r.cc90 != null && r.cc90 > 0)
  const withPgc = rows.filter((r) => r.pgc != null)
  const teamPgc =
    withVol.length > 0
      ? withVol.reduce((sum, r) => sum + (r.pgc ?? 0) * (r.cc90 ?? 0), 0) /
        withVol.reduce((sum, r) => sum + (r.cc90 ?? 0), 0)
      : withPgc.length === 0
        ? null
        : withPgc.reduce((sum, r) => sum + (r.pgc ?? 0), 0) / withPgc.length
  return {
    teamPgc,
    atTarget: rows.filter((r) => r.atTarget).length,
    improving: rows.filter((r) => r.trend === 'up').length,
    slipping: rows.filter((r) => r.trend === 'down').length,
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
      const fromSelected = weeksSeries.slice(weekIndex)
      const delta3 = delta3wk(fromSelected.map((w) => w.pgc))
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
        delta3wk: delta3,
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
    .filter((row) => row.pgc != null || (row.cc90 != null && row.cc90 > 0))
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
