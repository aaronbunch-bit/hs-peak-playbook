import { canonicalHighSchoolName } from '../data/highSchoolWorkGroup'
import { assignRoutingGroup, isOverflowExcludedManager } from '../data/routingGroups'
import { toIsoDate } from './calendar'
import { canonicalManager, parseCsv } from './lookerExport'
import { expectedPgc, type LcCurves, type Targets, targetForSlice } from './settings'
import type { IntradayPayload, IntradayRepRow, IntradayRow } from './types'

export function emptyIntraday(reason: string): IntradayPayload {
  return {
    source: 'looker-stub',
    asOf: toIsoDate(new Date()),
    rows: [],
    empty: true,
    emptyReason: reason,
  }
}

function parseCount(raw: string): number {
  const t = raw.replace(/,/g, '').trim()
  if (!t) return 0
  const n = Number(t)
  return Number.isFinite(n) ? n : 0
}

function headerIndex(headers: string[], test: (h: string) => boolean): number {
  return headers.findIndex((h) => test(h.toLowerCase()))
}

function audienceKey(raw: string): 'hs' | 'k12' | null {
  const t = raw.trim().toLowerCase()
  if (t === 'hs-stem' || t === 'hs stem') return 'hs'
  if (t === 'k12 test prep' || t === 'k12tp') return 'k12'
  return null
}

type Acc = {
  name: string
  manager: string | null
  hsSold: number
  hsCc90: number
  k12Sold: number
  k12Cc90: number
}

function pgc(sold: number, cc90: number): number | null {
  if (cc90 <= 0) return null
  return sold / cc90
}

export function parseIntradayCsv(csv: string): IntradayRow[] {
  const table = parseCsv(csv)
  if (table.length < 2) return []
  const headers = table[0]
  const nameCol = headerIndex(headers, (h) => h.includes('manager') && !h.includes('regional'))
  const rdCol = headerIndex(headers, (h) => h.includes('regional'))
  const audCol = headerIndex(headers, (h) => h.includes('audience'))
  const cc90Col = headerIndex(headers, (h) => h.includes('cc90') && !h.includes('sale') && !h.includes('closed'))
  const soldCol = headerIndex(
    headers,
    (h) => h.includes('closed client') || (h.includes('sale') && h.includes('count')),
  )
  if (nameCol < 0 || audCol < 0 || cc90Col < 0 || soldCol < 0) return []

  const byName = new Map<string, Acc>()
  for (const cols of table.slice(1)) {
    const rawName = (cols[nameCol] ?? '').trim()
    const name = canonicalHighSchoolName(rawName) ?? rawName
    if (!name) continue
    const audience = audienceKey(cols[audCol] ?? '')
    if (!audience) continue
    const cc90 = parseCount(cols[cc90Col] ?? '')
    const sold = parseCount(cols[soldCol] ?? '')
    const key = name.toLowerCase()
    const prev = byName.get(key)
    const manager = canonicalManager((rdCol >= 0 ? cols[rdCol] : '')?.trim() || null)
    if (!prev) {
      byName.set(key, {
        name,
        manager,
        hsSold: audience === 'hs' ? sold : 0,
        hsCc90: audience === 'hs' ? cc90 : 0,
        k12Sold: audience === 'k12' ? sold : 0,
        k12Cc90: audience === 'k12' ? cc90 : 0,
      })
      continue
    }
    if (audience === 'hs') {
      prev.hsSold += sold
      prev.hsCc90 += cc90
    } else {
      prev.k12Sold += sold
      prev.k12Cc90 += cc90
    }
    if (manager) prev.manager = manager
  }

  return [...byName.values()]
    .map((row) => {
      const routingGroup = assignRoutingGroup(row.name, row.manager)
      if (routingGroup === 'overflow' && isOverflowExcludedManager(row.manager)) return null
      const superCc90 = row.hsCc90 + row.k12Cc90
      const superSold = row.hsSold + row.k12Sold
      return {
        name: row.name,
        manager: row.manager,
        routingGroup,
        hsPgc: pgc(row.hsSold, row.hsCc90),
        hsCc90: row.hsCc90,
        k12Pgc: pgc(row.k12Sold, row.k12Cc90),
        k12Cc90: row.k12Cc90,
        superPgc: pgc(superSold, superCc90),
        superCc90,
      }
    })
    .filter((row): row is IntradayRow => row != null && row.superCc90 > 0)
}

export function buildIntradayRows(
  rows: IntradayRow[],
  roster: Array<{ name: string; manager: string | null; level: string | null }>,
  targets: Targets,
  lcCurves: LcCurves,
): IntradayRepRow[] {
  const byName = new Map(roster.map((r) => [r.name, r]))
  return rows.map((row) => {
    const rosterRow = byName.get(row.name)
    const level = rosterRow?.level ?? null
    return {
      ...row,
      manager: rosterRow?.manager ?? row.manager,
      level,
      expectedHs: expectedPgc(targetForSlice('hs-stem', targets), level, lcCurves),
      expectedK12: expectedPgc(targetForSlice('k12tp', targets), level, lcCurves),
      expectedSuper: expectedPgc(targetForSlice('supergroup', targets), level, lcCurves),
    }
  })
}
