import { canonicalHighSchoolName } from '../data/highSchoolWorkGroup'
import { assignRoutingGroup, isOverflowExcludedManager } from '../data/routingGroups'
import { impliedImpact } from './lookerExport'
import { chipsForName, type OverflowAllowlist } from './overflowAllowlist'
import { clientImpact } from './pacer'
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
  dedicatedHs: boolean
  dedicatedK12: boolean
  pgc: number | null
  cc90: number
  sold: number
  impact: number | null
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

export function factsToRouting(facts: LookerFact[], allowlist: OverflowAllowlist): RoutingFact[] {
  type Acc = {
    name: string
    manager: string | null
    dedicatedHs: boolean
    dedicatedK12: boolean
    hsSold: number
    hsImpact: number
    hsCc90: number
    k12Sold: number
    k12Impact: number
    k12Cc90: number
    date: string
  }
  const byName = new Map<string, Acc>()
  const ordered = [...facts].sort((a, b) => a.week.localeCompare(b.week))
  for (const fact of ordered) {
    const name = canonicalHighSchoolName(fact.name) ?? fact.name.trim()
    if (!name || !hasHsK12Volume(fact)) continue
    const chips = chipsForName(allowlist, name)
    // Exclude overflow-blocked managers unless they land in Primary / Training / Cross-trained on some slice.
    // Final group is slice-aware in buildRoutingRows; here we only drop people who can never be CT/Primary/Training.
    const provisional = assignRoutingGroup(name, fact.manager, chips, 'supergroup')
    if (provisional === 'overflow' && isOverflowExcludedManager(fact.manager)) continue
    const key = name.toLowerCase()
    const hsSold = (fact.hsPgc ?? 0) * fact.hsCc90
    const k12Sold = (fact.k12Pgc ?? 0) * fact.k12Cc90
    const hsImpact = impliedImpact(fact.hsPgc, fact.hsCc90, fact.hsImpact)
    const k12Impact = impliedImpact(fact.k12Pgc, fact.k12Cc90, fact.k12Impact)
    const prev = byName.get(key)
    if (!prev) {
      byName.set(key, {
        name,
        manager: fact.manager,
        dedicatedHs: chips.dedicatedHs,
        dedicatedK12: chips.dedicatedK12,
        hsSold,
        hsImpact,
        hsCc90: fact.hsCc90,
        k12Sold,
        k12Impact,
        k12Cc90: fact.k12Cc90,
        date: fact.week,
      })
      continue
    }
    prev.hsSold += hsSold
    prev.hsImpact += hsImpact
    prev.hsCc90 += fact.hsCc90
    prev.k12Sold += k12Sold
    prev.k12Impact += k12Impact
    prev.k12Cc90 += fact.k12Cc90
    prev.manager = fact.manager
    prev.dedicatedHs = chips.dedicatedHs
    prev.dedicatedK12 = chips.dedicatedK12
    prev.date = fact.week
  }
  return [...byName.values()].map((row) => ({
    date: row.date,
    name: row.name,
    manager: row.manager,
    dedicatedHs: row.dedicatedHs,
    dedicatedK12: row.dedicatedK12,
    hsCc90: row.hsCc90,
    hsPgc: row.hsCc90 > 0 ? row.hsSold / row.hsCc90 : null,
    hsImpact: row.hsImpact,
    k12Cc90: row.k12Cc90,
    k12Pgc: row.k12Cc90 > 0 ? row.k12Sold / row.k12Cc90 : null,
    k12Impact: row.k12Impact,
    totalPgc: row.hsCc90 + row.k12Cc90 > 0 ? (row.hsSold + row.k12Sold) / (row.hsCc90 + row.k12Cc90) : null,
  }))
}

function audienceVolume(
  fact: RoutingFact,
  kind: 'hs' | 'k12' | 'super',
): RoutingVolume {
  if (kind === 'hs') {
    const cc90 = fact.hsCc90
    const closedClients = fact.hsImpact
    const sold = closedClients > 0 ? closedClients : (fact.hsPgc ?? 0) * cc90
    return { sold, cc90, pgc: fact.hsPgc ?? (cc90 > 0 ? sold / cc90 : null) }
  }
  if (kind === 'k12') {
    const cc90 = fact.k12Cc90
    const closedClients = fact.k12Impact
    const sold = closedClients > 0 ? closedClients : (fact.k12Pgc ?? 0) * cc90
    return { sold, cc90, pgc: fact.k12Pgc ?? (cc90 > 0 ? sold / cc90 : null) }
  }
  const cc90 = fact.hsCc90 + fact.k12Cc90
  const closedClients = fact.hsImpact + fact.k12Impact
  const sold = closedClients > 0 ? closedClients : (fact.hsPgc ?? 0) * fact.hsCc90 + (fact.k12Pgc ?? 0) * fact.k12Cc90
  return { sold, cc90, pgc: fact.totalPgc ?? (cc90 > 0 ? sold / cc90 : null) }
}

/**
 * Slice volume for pGC. Cross-trained on Supergroup uses only dedicated audiences
 * (HS-only, K12-only, or both when both chips are set).
 */
export function volumeForSlice(fact: RoutingFact, slice: Slice, routingGroup: RoutingGroup): RoutingVolume {
  if (slice === 'hs-stem') return audienceVolume(fact, 'hs')
  if (slice === 'k12tp') return audienceVolume(fact, 'k12')
  if (routingGroup === 'cross-trained') {
    if (fact.dedicatedHs && fact.dedicatedK12) return audienceVolume(fact, 'super')
    if (fact.dedicatedHs) return audienceVolume(fact, 'hs')
    if (fact.dedicatedK12) return audienceVolume(fact, 'k12')
  }
  return audienceVolume(fact, 'super')
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
    const chips = { dedicatedHs: fact.dedicatedHs, dedicatedK12: fact.dedicatedK12 }
    const routingGroup = assignRoutingGroup(fact.name, fact.manager, chips, slice)
    if (routingGroup === 'overflow' && isOverflowExcludedManager(fact.manager)) continue
    const vol = volumeForSlice(fact, slice, routingGroup)
    if (vol.cc90 <= 0 && vol.pgc == null) continue
    const rosterRow = byName.get(fact.name)
    const level = rosterRow?.level ?? null
    rows.push({
      name: fact.name,
      manager: rosterRow?.manager ?? fact.manager,
      level,
      expectedPgc: expectedPgc(targetPgc, level, lcCurves),
      routingGroup,
      dedicatedHs: fact.dedicatedHs,
      dedicatedK12: fact.dedicatedK12,
      pgc: vol.pgc,
      cc90: vol.cc90,
      sold: vol.sold,
      impact: clientImpact(vol.pgc, targetPgc, vol.cc90),
    })
  }
  return rows
}

export function groupWeightedPgc(rows: Array<{ sold: number; cc90: number }>): number | null {
  const cc90 = rows.reduce((sum, r) => sum + r.cc90, 0)
  if (cc90 <= 0) return null
  return rows.reduce((sum, r) => sum + r.sold, 0) / cc90
}

export function routingGroupStats(
  rows: Array<{ sold: number; cc90: number; routingGroup: RoutingGroup }>,
  group: RoutingGroup,
): RoutingGroupStats {
  const scoped = group === 'overall' ? rows : rows.filter((r) => r.routingGroup === group)
  return {
    group,
    pgc: groupWeightedPgc(scoped),
    cc90: scoped.reduce((sum, r) => sum + r.cc90, 0),
    n: scoped.length,
  }
}
