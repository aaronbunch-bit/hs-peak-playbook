export type CollegeFact = { date: string; name: string; audience: 'HS-STEM' | 'K12 Test Prep'; cc90: number | null; closes: number | null }
export type CollegePayload = { roster: string[]; facts: CollegeFact[]; refreshedAt: string; today: string; source: string; membership: string }
export const COLLEGE_CUTOFF = '2026-10-01'
export const COLLEGE_BASELINE = '2026-09-03'
export function collegeTotal(facts: CollegeFact[]) {
  const cc90 = facts.some(f => f.cc90 == null) ? null : facts.reduce((s, f) => s + f.cc90!, 0)
  const closes = facts.some(f => f.closes == null) ? null : facts.reduce((s, f) => s + f.closes!, 0)
  return { cc90, closes, pgc: cc90 != null && cc90 > 0 && closes != null ? closes / cc90 : null }
}
