import { formatPgc } from './pacer'
import type { SuggestParams } from './settings'
import type { RepRow } from './types'

export type Suggestion = {
  name: string
  score: number
  reasons: string[]
}

export function suggestFocuses(
  rows: RepRow[],
  params: SuggestParams,
  alreadyFocused: Set<string>,
): Suggestion[] {
  const out: Suggestion[] = []

  for (const row of rows) {
    if (alreadyFocused.has(row.name)) continue
    if (row.pgc == null) continue

    const cc90 = row.weeks[0]?.cc90
    if (cc90 != null && cc90 < params.minCc90) continue

    const expect = row.expectedPgc
    const below = row.pgc < expect
    const declining = row.deltaWow != null && row.deltaWow <= -params.wowDeclinePts
    const reasons: string[] = []

    if (params.belowTarget && below) {
      const lc = row.level ?? 'full bar'
      reasons.push(`below ${formatPgc(expect)} ${lc} expect`)
    }
    if (declining) {
      reasons.push(`WoW ${((row.deltaWow ?? 0) * 100).toFixed(1)} pts`)
    }

    const qualifies =
      reasons.length > 0 &&
      (!params.belowTarget || below) &&
      (declining || (below && params.includeBelowWithoutDecline))

    if (!qualifies) continue

    const gap = Math.max(0, expect - row.pgc)
    const volume = Math.sqrt(Math.max(cc90 ?? 0, 1))
    const decline = declining ? Math.abs(row.deltaWow ?? 0) : 0
    const score = gap * 100 * volume + decline * 200

    out.push({ name: row.name, score, reasons })
  }

  return out.sort((a, b) => b.score - a.score).slice(0, params.maxSuggestions)
}
