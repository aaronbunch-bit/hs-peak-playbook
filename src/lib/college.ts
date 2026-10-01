export type WorkDirection = 'college-to-hs' | 'hs-to-college'
export const WORK_DIRECTIONS = {
  'college-to-hs': { label: 'College → HS/K12', group: 'College', audiences: ['HS-STEM', 'K12 Test Prep'] },
  'hs-to-college': { label: 'HS → COL/GTP', group: 'High School', audiences: ['Col-STEM', 'Grad Test Prep'] },
} as const
export type DateRange = { start: string; end: string }
export type CollegeSelection = { direction: WorkDirection; audience: string; before: DateRange; after: DateRange }
export type CollegeCounts = { cc90: number | null; closes: number | null; firstConnects: number | null; escvrCloses: number | null }
export type CollegeScore = CollegeCounts & { pgc: number | null; escvr: number | null }
export type CollegeDaily = CollegeCounts & { date: string; repId?: string }
export type CollegePeriod = {
  range: DateRange; overall: CollegeCounts
  audiences: { audience: string; counts: CollegeCounts }[]
  reps: { repId: string; counts: CollegeCounts }[]
  daily: CollegeDaily[]; repDaily: CollegeDaily[]
}
export type CollegePayload = {
  selection: CollegeSelection; roster: { id: string; name: string }[]
  before: CollegePeriod; after: CollegePeriod
  refreshedAt: string; today: string; source: string; membership: string
  rosterAsOf: string[]; excludedTerminated: number; excludedUnknown: number; escvrNotice: string
}
export const COLLEGE_CUTOFF = '2026-10-01'
export const COLLEGE_BASELINE = '2026-09-03'
export const EMPTY_COUNTS: CollegeCounts = { cc90: null, closes: null, firstConnects: null, escvrCloses: null }
export function scoreCounts(counts: CollegeCounts = EMPTY_COUNTS): CollegeScore {
  const { cc90, closes, firstConnects, escvrCloses } = counts
  return { ...counts,
    pgc: cc90 != null && cc90 > 0 && closes != null ? closes / cc90 : null,
    escvr: firstConnects != null && firstConnects > 0 && escvrCloses != null ? escvrCloses / firstConnects : null,
  }
}
export function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export function validDate(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(Date.parse(iso)) && new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) === iso
}
export function validateSelection(selection: CollegeSelection, today: string): string | null {
  for (const [label, range] of [['Before', selection.before], ['After', selection.after]] as const) {
    if (!validDate(range.start) || !validDate(range.end)) return `${label}: enter valid start and end dates.`
    if (range.start > range.end) return `${label}: the start must be on or before the end.`
    if (range.end > today) return `${label}: future dates are not available.`
    if ((Date.parse(range.end) - Date.parse(range.start)) / 86400000 >= 366) return `${label}: choose a range of 366 days or fewer.`
  }
  if (!Object.hasOwn(WORK_DIRECTIONS, selection.direction)) return 'Choose a valid direction.'
  const config = WORK_DIRECTIONS[selection.direction]
  if (!config || (selection.audience !== 'All' && !(config.audiences as readonly string[]).includes(selection.audience))) return 'Choose a valid direction and audience.'
  return null
}
export function defaultSelection(today: string): CollegeSelection {
  return { direction: 'college-to-hs', audience: 'All', before: { start: COLLEGE_BASELINE, end: '2026-09-30' }, after: { start: COLLEGE_CUTOFF, end: today } }
}
export function selectionFromParams(params: URLSearchParams, today: string): CollegeSelection {
  const selection = defaultSelection(today)
  const direction = params.get('direction') ?? selection.direction
  if (!Object.hasOwn(WORK_DIRECTIONS, direction)) throw new Error('Unknown work direction.')
  selection.direction = direction as WorkDirection
  selection.audience = params.get('audience') ?? 'All'
  for (const period of ['before', 'after'] as const) for (const bound of ['start', 'end'] as const) {
    selection[period][bound] = params.get(`${period}_${bound}`) ?? selection[period][bound]
  }
  const error = validateSelection(selection, today)
  if (error) throw new Error(error)
  return selection
}
export function selectionParams(selection: CollegeSelection): URLSearchParams {
  return new URLSearchParams({ view: 'college', direction: selection.direction, audience: selection.audience,
    before_start: selection.before.start, before_end: selection.before.end, after_start: selection.after.start, after_end: selection.after.end })
}
export type ComparisonRow = { id: string; name: string; before: CollegeScore; after: CollegeScore; deltaPgc: number | null; deltaEscvr: number | null }
export function comparisonRow(id: string, name: string, before?: CollegeCounts, after?: CollegeCounts): ComparisonRow {
  const a = scoreCounts(before), b = scoreCounts(after)
  return { id, name, before: a, after: b,
    deltaPgc: a.pgc == null || b.pgc == null ? null : b.pgc - a.pgc,
    deltaEscvr: a.escvr == null || b.escvr == null ? null : b.escvr - a.escvr }
}
export type PerformanceMetric = 'pgc' | 'escvr'
export type ComparisonSort = 'name' | 'deltaPgc' | 'deltaEscvr' | `${'before' | 'after'}.${keyof CollegeScore}`
/** Nulls stay last in both directions. Ties resolve predictably by name then stable ID. */
export function sortComparisons(rows: ComparisonRow[], key: ComparisonSort, descending: boolean): ComparisonRow[] {
  const value = (row: ComparisonRow): number | string | null => {
    if (key === 'name' || key === 'deltaPgc' || key === 'deltaEscvr') return row[key]
    const [period, metric] = key.split('.') as ['before' | 'after', keyof CollegeScore]
    return row[period][metric]
  }
  return [...rows].sort((a, b) => {
    const av = value(a), bv = value(b)
    if (av == null && bv != null) return 1
    if (bv == null && av != null) return -1
    const delta = av == null || bv == null ? 0 : typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : Number(av) - Number(bv)
    return (descending ? -delta : delta) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  })
}
/** Lowest ceil(25% × eligible reps), including all ties at the boundary. */
export function bottomQuartile(rows: ComparisonRow[], period: 'before' | 'after', metric: PerformanceMetric, minimum: number) {
  const denominator = metric === 'pgc' ? 'cc90' : 'firstConnects'
  const eligible = rows.filter(r => r[period][metric] != null && (r[period][denominator] ?? 0) >= minimum)
  const ranked = sortComparisons(eligible, `${period}.${metric}`, false)
  if (ranked.length < 4) return { ids: new Set<string>(), eligibleCount: ranked.length, cutoff: null as number | null }
  const cutoff = ranked[Math.ceil(ranked.length / 4) - 1][period][metric]!
  return { ids: new Set(ranked.filter(r => r[period][metric]! <= cutoff).map(r => r.id)), eligibleCount: ranked.length, cutoff }
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
