export type WorkDirection = 'college-to-hs' | 'hs-to-college'
export const WORK_DIRECTIONS = {
  'college-to-hs': { label: 'College → HS/K12', group: 'College', audiences: ['HS-STEM', 'K12 Test Prep'] },
  'hs-to-college': { label: 'HS → COL/GTP', group: 'High School', audiences: ['Col-STEM', 'Grad Test Prep'] },
} as const
export type CollegeFact = { date: string; repId: string; name: string; audience: string; cc90: number | null; closes: number | null }
export type CollegePayload = {
  direction: WorkDirection; roster: { id: string; name: string }[]; facts: CollegeFact[]
  refreshedAt: string; today: string; source: string; membership: string
  rosterAsOf: string[]; excludedTerminated: number; excludedUnknown: number; escvrNotice: string
}
export const COLLEGE_CUTOFF = '2026-10-01'
export const COLLEGE_BASELINE = '2026-09-03'
export function collegeTotal(facts: Pick<CollegeFact, 'cc90' | 'closes'>[]) {
  const cc90 = !facts.length || facts.some(f => f.cc90 == null) ? null : facts.reduce((s, f) => s + f.cc90!, 0)
  const closes = !facts.length || facts.some(f => f.closes == null) ? null : facts.reduce((s, f) => s + f.closes!, 0)
  return { cc90, closes, pgc: cc90 != null && cc90 > 0 && closes != null ? closes / cc90 : null }
}
/** Explicit No is required; missing flags never establish eligibility. Any Yes wins. */
export function eligibleRoster(rows: Record<string, unknown>[]) {
  const prefix = 'gld_employee_directory.'
  const byId = new Map<string, Record<string, unknown>[]>()
  for (const row of rows) {
    const id = String(row[`${prefix}mgr_id`] ?? '').trim()
    if (!/^\d+$/.test(id)) throw new Error('Employee directory returned a missing or invalid rep ID.')
    byId.set(id, [...(byId.get(id) ?? []), row])
  }
  let excludedTerminated = 0, excludedUnknown = 0
  const roster: { id: string; name: string }[] = []
  for (const [id, records] of byId) {
    const flags = records.map(r => String(r[`${prefix}is_termed`] ?? '').toLowerCase())
    if (flags.some(f => f === 'yes' || f === 'true')) { excludedTerminated++; continue }
    if (!flags.every(f => f === 'no' || f === 'false')) { excludedUnknown++; continue }
    const names = [...new Set(records.map(r => String(r[`${prefix}mgr_name`] ?? '').trim()))]
    if (names.length !== 1 || !names[0]) throw new Error('Employee directory has ambiguous rep names.')
    roster.push({ id, name: names[0] })
  }
  return { roster: roster.sort((a,b) => a.name.localeCompare(b.name)), excludedTerminated, excludedUnknown }
}
