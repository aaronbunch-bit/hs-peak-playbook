import { canonicalHighSchoolName } from '../data/highSchoolWorkGroup'
import { assignRoutingGroup, isOverflowExcludedManager } from '../data/routingGroups'
import { expectedPgc, type LcCurves } from './settings'
import type { LookerFact, RoutingFact, RoutingGroup, Slice } from './types'

export type RoutingVolume = {
  sold: number
  cc90: number
  pgc: number | null
}

export type RoutingRepRow = {
  name: string
  manager: string | null
  level: string | null
  expectedPgc: number
  routingGroup: RoutingGroup
  pgc: number | null
  cc90: number
  sold: number
}

export type RoutingGroupStats = {
  group: RoutingGroup
  pgc: number | null
  cc90: number
  n: number
}

function hasHsK12Volume(fact: Pick<LookerFact, 'hsCc90' | 'k12Cc90' | 'hsPgc' | 'k12Pgc' | 'totalPgc'>): boolean {
  return (
    fact.hsCc90 > 0 ||
    fact.k12Cc90 > 0 ||
    fact.hsPgc != null ||
    fact.k12Pgc != null ||
    fact.totalPgc != null
  )
}

export function factsToRouting(facts: LookerFact[]): RoutingFact[] {
  type Acc = {
    name: string
    manager: string | null
    routingGroup: RoutingGroup
    hsSold: number
    hsCc90: number
    k12Sold: number
    k12Cc90: number
    date: string
  }
  const byName = new Map<string, Acc>()
  const ordered = [...facts].sort((a, b) => a.week.localeCompare(b.week))
  for (const fact of ordered) {
    const name = canonicalHighSchoolName(fact.name) ?? fact.name.trim()
    if (!name || !hasHsK12Volume(fact)) continue
    const routingGroup = assignRoutingGroup(name, fact.manager)
    if (routingGroup === 'overflow' && isOverflowExcludedManager(fact.manager)) continue
    const key = name.toLowerCase()
    const hsSold = (fact.hsPgc ?? 0) * fact.hsCc90
    const k12Sold = (fact.k12Pgc ?? 0) * fact.k12Cc90
    const prev = byName.get(key)
    if (!prev) {
      byName.set(key, {
        name,
        manager: fact.manager,
        routingGroup,
        hsSold,
        hsCc90: fact.hsCc90,
        k12Sold,
        k12Cc90: fact.k12Cc90,
        date: fact.week,
      })
      continue
    }
    prev.hsSold += hsSold
    prev.hsCc90 += fact.hsCc90
    prev.k12Sold += k12Sold
    prev.k12Cc90 += fact.k12Cc90
    prev.manager = fact.manager
    prev.routingGroup = routingGroup
    prev.date = fact.week
  }
  return [...byName.values()].map((row) => ({
    date: row.date,
    name: row.name,
    manager: row.manager,
    routingGroup: row.routingGroup,
    hsCc90: row.hsCc90,
    hsPgc: row.hsCc90 > 0 ? row.hsSold / row.hsCc90 : null,
    k12Cc90: row.k12Cc90,
    k12Pgc: row.k12Cc90 > 0 ? row.k12Sold / row.k12Cc90 : null,
    totalPgc: row.hsCc90 + row.k12Cc90 > 0 ? (row.hsSold + row.k12Sold) / (row.hsCc90 + row.k12Cc90) : null,
  }))
}

/** Clients sold ≈ pGC × cc90 per audience. Super is HS sold + K12 sold over HS+K12 cc90. */
export function volumeForSlice(fact: RoutingFact, slice: Slice): RoutingVolume {
  if (slice === 'hs-stem') {
    const cc90 = fact.hsCc90
    const sold = (fact.hsPgc ?? 0) * cc90
    return { sold, cc90, pgc: cc90 > 0 ? sold / cc90 : null }
  }
  if (slice === 'k12tp') {
    const cc90 = fact.k12Cc90
    const sold = (fact.k12Pgc ?? 0) * cc90
    return { sold, cc90, pgc: cc90 > 0 ? sold / cc90 : null }
  }
  const cc90 = fact.hsCc90 + fact.k12Cc90
  const sold = (fact.hsPgc ?? 0) * fact.hsCc90 + (fact.k12Pgc ?? 0) * fact.k12Cc90
  return { sold, cc90, pgc: cc90 > 0 ? sold / cc90 : null }
}

export function buildRoutingRows(
  facts: RoutingFact[],
  slice: Slice,
  targetPgc: number,
  lcCurves: LcCurves,
  roster: Array<{ name: string; manager: string | null; level: string | null }>,
): RoutingRepRow[] {
  const byName = new Map(roster.map((r) => [r.name, r]))
  const rows: RoutingRepRow[] = []
  for (const fact of facts) {
    const vol = volumeForSlice(fact, slice)
    if (vol.cc90 <= 0 && vol.pgc == null) continue
    if (fact.routingGroup === 'overflow' && isOverflowExcludedManager(fact.manager)) continue
    const rosterRow = byName.get(fact.name)
    const level = rosterRow?.level ?? null
    rows.push({
      name: fact.name,
      manager: rosterRow?.manager ?? fact.manager,
      level,
      expectedPgc: expectedPgc(targetPgc, level, lcCurves),
      routingGroup: fact.routingGroup,
      pgc: vol.pgc,
      cc90: vol.cc90,
      sold: vol.sold,
    })
  }
  return rows
}

export function groupWeightedPgc(rows: Array<{ sold: number; cc90: number }>): number | null {
  const cc90 = rows.reduce((sum, r) => sum + r.cc90, 0)
  if (cc90 <= 0) return null
  return rows.reduce((sum, r) => sum + r.sold, 0) / cc90
}

export function routingGroupStats(rows: RoutingRepRow[], group: RoutingGroup): RoutingGroupStats {
  const scoped = group === 'overall' ? rows : rows.filter((r) => r.routingGroup === group)
  return {
    group,
    pgc: groupWeightedPgc(scoped),
    cc90: scoped.reduce((sum, r) => sum + r.cc90, 0),
    n: scoped.length,
  }
}
