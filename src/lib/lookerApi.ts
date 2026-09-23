import { addDays, daysSundayThroughToday, lastCompleteWeekStart, sundayWeekStart, toIsoDate, yesterday } from './calendar'
import { HIGH_SCHOOL_WORK_GROUP, canonicalHighSchoolName, lookerRepNameFilter, overlayHighSchoolRoster } from '../data/highSchoolWorkGroup'
import { seed } from '../data/seed'
import { emptyIntraday, parseIntradayCsv } from './intraday'
import { factToWeekly, parseLookerPlaybook } from './lookerExport'
import { emptyPayload, SLICE_LOOKER_FILTERS } from './lookerShared'
import { resolveOverflowAllowlist, serializeAllowlist, snapshotAllowlistAsOf, snapshotOverflowAllowlist } from './overflowAllowlist'
import { clearSharedOverflowChips, readSharedOverflowChips, writeSharedOverflowChips } from './overflowStore'
import { factsToRouting } from './routing'
import { clampRange } from './routingRange'
import type { DailyRow, IntradayPayload, LookerFact, PacerPayload, RoutingRangePayload, Slice, Staffing } from './types'

/**
 * The app has to agree with the dashboard the team reads, so it queries that dashboard's
 * own explore instead of cloning a saved look:
 * sales::call_duration_per_rep_by_supergroup -> sales / gld_sales_manager_funnel.
 *
 * Look 26564 sits on decompositions/call_data_with_coselling, which is a different model
 * that loads roughly a day behind and reports slightly different CC90 counts, so
 * yesterday is always empty there while the dashboard shows a full day. It stays as the
 * fallback for when this explore cannot be read.
 */
const SOURCE_MODEL = 'sales'
const SOURCE_EXPLORE = 'gld_sales_manager_funnel'

const LOOKER_TIME_FILTER = `${SOURCE_EXPLORE}.started_time`
const DATE_FIELD = `${SOURCE_EXPLORE}.started_date`
const REP_NAME_FIELD = `${SOURCE_EXPLORE}.mgr_name`

/**
 * The dashboard's own filter defaults. The field behind each one is named differently per
 * explore -- the cc90 flag is `is_cc90` here and `consultant_cc90` on the look's model --
 * so they are resolved against whichever explore is answering.
 */
const DASHBOARD_FILTERS = [
  { label: 'Business', names: ['business'], value: 'International,VT Core' },
  { label: 'Expert Type', names: ['expert_type'], value: '-Dropped Expert' },
  { label: 'Consultant cc90', names: ['is_cc90', 'consultant_cc90'], value: 'Yes' },
] as const

type DashboardFilter = { label: string; field: string }

type LookerQuery = {
  model?: string
  view?: string
  fields?: string[]
  pivots?: string[]
  filters?: Record<string, string>
  sorts?: string[]
  limit?: string | number
  dynamic_fields?: string
  query_timezone?: string
  fill_fields?: string[]
  vis_config?: unknown
}

function env(name: string): string {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } }
  return (g.process?.env?.[name] ?? '').trim()
}

function apiBase(): string {
  const raw = env('LOOKER_BASE_URL') || 'https://varsitytutors.looker.com'
  return `${raw.replace(/\/$/, '')}/api/4.0`
}

function lookId(): string {
  return env('LOOKER_LOOK_ID') || '26564'
}

export function lookerConfigured(): boolean {
  return Boolean(env('LOOKER_CLIENT_ID') && env('LOOKER_CLIENT_SECRET'))
}

async function login(): Promise<string> {
  const res = await fetch(`${apiBase()}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('LOOKER_CLIENT_ID'),
      client_secret: env('LOOKER_CLIENT_SECRET'),
    }),
  })
  if (!res.ok) {
    throw new Error(`Looker login failed (${res.status})`)
  }
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error('Looker login returned no token')
  return data.access_token
}

async function lookerFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `token ${token}`)
  return fetch(`${apiBase()}${path}`, { ...init, headers })
}

/** Saved look is 4 complete weeks; clone farther back so the drawer sparkline has history. */
const CLOSED_WEEKS_FILTER = '12 week ago for 12 week'

async function runSavedLook(token: string): Promise<string> {
  const res = await lookerFetch(token, `/looks/${lookId()}/run/csv?apply_vis=true`)
  if (!res.ok) throw new Error(`Looker run look failed (${res.status})`)
  return res.text()
}

function intradayLookId(): string {
  return env('LOOKER_INTRADAY_LOOK_ID') || '26569'
}

async function lookQueryFor(token: string, id: string): Promise<LookerQuery> {
  const lookRes = await lookerFetch(token, `/looks/${id}?fields=query`)
  if (!lookRes.ok) throw new Error(`Looker look metadata failed (${lookRes.status})`)
  const look = (await lookRes.json()) as { query?: LookerQuery }
  if (!look.query) throw new Error('Looker look has no query')
  return look.query
}

async function lookQuery(token: string): Promise<LookerQuery> {
  return lookQueryFor(token, lookId())
}

/**
 * The dashboard's explore, described directly. Nothing here is cloned from a saved look,
 * so no pivot, table calculation or presentation choice of someone else's can travel into
 * a re-windowed query. A field that is renamed upstream fails the probe below loudly
 * instead of returning an empty range.
 */
function exploreQuery(): LookerQuery {
  const v = `${SOURCE_EXPLORE}.`
  return {
    model: SOURCE_MODEL,
    view: SOURCE_EXPLORE,
    fields: [
      `${v}started_week`,
      `${v}cc90_count`,
      `${v}closed_client_count_this_call`,
      `${v}mgr_name`,
      `${v}supervisor`,
      `${v}audience_subject`,
    ],
    // Replaced by every clone; it is here so the time grain is discoverable.
    filters: { [`${v}started_time`]: CLOSED_WEEKS_FILTER },
    limit: '5000',
  }
}

/** The dashboard explore if it answers, otherwise the saved look. */
async function sourceQuery(token: string): Promise<LookerQuery> {
  const preferred = exploreQuery()
  await discoverExplore(token, preferred)
  const answers = await runQueryCsv(token, preferred, CLOSED_WEEKS_FILTER, {
    peakNames: false,
    plain: true,
    limit: '1',
  })
    .then((run) => run.csv.trim().length > 0)
    .catch(() => false)
  if (answers) return preferred
  const fallback = await lookQuery(token)
  await discoverExplore(token, fallback)
  return fallback
}

type QueryExtra = {
  fields?: string[]
  filters?: Record<string, string>
  sorts?: string[]
  peakNames?: boolean
  limit?: string
  /** Drop the saved look's own filters, leaving only the time window. */
  ignoreSavedFilters?: boolean
  /** Scope to HS-STEM and K12 Test Prep, and group by audience when the explore can. */
  audience?: AudienceUse
  /** Drop the look's presentation layer: pivots, table calculations, dimension fill. */
  plain?: boolean
}

/** The CSV plus the projection behind it, so the parser never has to guess its columns. */
type QueryRun = { csv: string; fields: string[] }

async function runQueryCsv(
  token: string,
  query: LookerQuery,
  timeFilter: string,
  extra?: QueryExtra,
): Promise<QueryRun> {
  const res = await lookerFetch(token, '/queries/run/csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(queryBody(query, timeFilter, extra)),
  })
  if (!res.ok) throw new Error(`Looker query failed (${res.status})`)
  return { csv: await res.text(), fields: csvColumnOrder(query, projectionFor(query, extra)) ?? [] }
}

/** Roster is the Rep Name list. Looker manager / work-group fields lag HR. */
function membershipAgnosticFilters(filters: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(filters)) {
    const field = key.split('.').pop() ?? key
    if (field === 'supervisor' || field === 'work_group' || field === 'work_group_blended') continue
    out[key] = value
  }
  return out
}

/**
 * Every clone re-windows the query, so any other granularity of the same call-created
 * dimension the saved look happened to filter on would AND with the window we asked
 * for and silently empty the range.
 */
function withoutCompetingTimeFilters(
  filters: Record<string, string>,
  timeField: string,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(filters)) {
    if (key !== timeField && isTimeishField(key)) continue
    out[key] = value
  }
  return out
}

/**
 * A call-date dimension at some granularity. Anchored, so a neighbouring timestamp like
 * `bot_started_time` is never mistaken for the one the report is dated by.
 */
function isTimeishField(key: string): boolean {
  const field = key.split('.').pop() ?? key
  return /^(started|call_created_at|created_at)_(time|date|week|month)$/.test(field)
}

/**
 * The look owns which view the call-created dimension lives on. Hardcoding it means a
 * rename or re-model upstream leaves us filtering on a field the query cannot see,
 * which Looker answers with a header and no rows rather than an error.
 */
function resolveTimeField(query: LookerQuery, projection?: string[]): string {
  const dims = discoveredDimensions(query)
  const groups = [
    (projection ?? []).filter(isTimeishField),
    Object.keys(query.filters ?? {}).filter(isTimeishField),
    (query.fields ?? []).filter(isTimeishField),
    dims.filter((d) => isTimeishField(d.name)).map((d) => d.name),
    dims.filter((d) => /created at/.test(d.label)).map((d) => d.name),
  ]
  // Grain beats provenance. A week dimension carries the week's start date, so an absolute
  // `2026-09-22 to 2026-09-24` window only matches a week that happens to begin inside it —
  // every other range comes back empty. Take the finest grain any pool offers before
  // settling for the week the saved look selected.
  for (const suffix of ['_time', '_date']) {
    for (const candidates of groups) {
      const hit = candidates.find((key) => key.endsWith(suffix))
      if (hit) return hit
    }
  }
  for (const candidates of groups) {
    if (candidates.length === 0) continue
    const week = candidates.find((key) => key.endsWith('_week')) ?? candidates[0]
    const twin = week.replace(/_week$/, '_date')
    return twin !== week && dims.some((d) => d.name === twin) ? twin : week
  }
  return LOOKER_TIME_FILTER
}

/** The rep-name dimension, never the manager one. `mgr_name` is this model's rep name. */
function isRepNameField(key: string): boolean {
  const field = key.split('.').pop() ?? key
  return /^(rep_name|consultant|sales_rep|mgr_name)$/.test(field)
}

function resolveRepNameField(query: LookerQuery): string {
  const fromQuery = (query.fields ?? []).find(isRepNameField)
  if (fromQuery) return fromQuery
  const dims = discoveredDimensions(query)
  return (
    dims.find((d) => isRepNameField(d.name))?.name ??
    dims.find((d) => /(^| )(rep name|consultant|sales rep)$/.test(d.label))?.name ??
    REP_NAME_FIELD
  )
}

type ExploreField = { name: string; label: string }

let exploreCache: { key: string; dims: ExploreField[]; measures: string[]; at: number } | null = null

/**
 * The order Looker actually returns columns in: every dimension first, then every measure,
 * each in the order it was requested. The projection order is not the CSV order, and
 * reading columns in the order we asked for them silently shifts the whole row.
 * Null when the explore could not be read, since then we cannot tell the two apart.
 */
function csvColumnOrder(query: LookerQuery, projection: string[] | undefined): string[] | null {
  if (!projection?.length) return null
  const cache = exploreCache?.key === exploreKey(query) ? exploreCache : null
  if (!cache || (cache.dims.length === 0 && cache.measures.length === 0)) return null
  const measures = new Set(cache.measures)
  return [...projection.filter((f) => !measures.has(f)), ...projection.filter((f) => measures.has(f))]
}

/** Day grain: swap whichever call-created week dimension the look selected for its date twin. */
function dailyFields(query: LookerQuery): string[] {
  return (query.fields ?? []).map((field) =>
    isTimeishField(field) && field.endsWith('_week') ? field.replace(/_week$/, '_date') : field,
  )
}

/**
 * The date, the rep, and the measures. Every other dimension the look selects is a join
 * Looker has to satisfy before a row can come back, so this is the projection to fall back
 * to when the full one returns nothing. Anything the explore does not list as a dimension
 * is a measure, which is what makes this narrower than the look rather than emptier.
 */
function bareFields(query: LookerQuery): string[] {
  const dims = new Set(discoveredDimensions(query).map((d) => d.name))
  const fields = dailyFields(query)
  const kept = fields.filter((f) => !dims.has(f) || isTimeishField(f) || isRepNameField(f))
  return kept.length > 1 ? kept : fields
}

function exploreKey(query: LookerQuery): string {
  return `${query.model ?? ''}|${query.view ?? ''}`
}

/** Dimensions of the look's explore, resolved once so field IDs never have to be guessed. */
function discoveredDimensions(query: LookerQuery): ExploreField[] {
  return exploreCache?.key === exploreKey(query) ? exploreCache.dims : []
}

/**
 * The saved look's query does not always carry the field IDs behind the columns it
 * returns, so read them from the explore itself and resolve by name or column label.
 */
async function discoverExplore(token: string, query: LookerQuery): Promise<void> {
  const key = exploreKey(query)
  if (exploreCache?.key === key && Date.now() - exploreCache.at < AUDIENCE_CACHE_MS) return
  if (!query.model || !query.view) return
  const res = await lookerFetch(
    token,
    `/lookml_models/${encodeURIComponent(query.model)}/explores/${encodeURIComponent(query.view)}`,
  ).catch(() => null)
  if (!res?.ok) return
  type Field = { name?: string; label?: string; label_short?: string; hidden?: boolean }
  const data = (await res.json().catch(() => null)) as {
    fields?: { dimensions?: Field[]; measures?: Field[] }
  } | null
  const dims = (data?.fields?.dimensions ?? [])
    .filter((d) => d.name && !d.hidden)
    .map((d) => ({
      name: d.name as string,
      label: (d.label ?? d.label_short ?? '').trim().toLowerCase().replace(/\s+/g, ' '),
    }))
  // Measures are kept only to tell them apart from dimensions when reading the CSV, so
  // hidden ones count too: selecting one still puts a column after every dimension.
  const measures = (data?.fields?.measures ?? []).map((m) => m.name).filter((n): n is string => Boolean(n))
  exploreCache = { key, dims, measures, at: Date.now() }
}

/** The exact field list a clone selects, shared so the parser can be told the columns. */
function projectionFor(query: LookerQuery, extra?: QueryExtra): string[] | undefined {
  // An empty list is not the same as "no opinion": Looker rejects a query selecting nothing.
  const base = (extra?.fields ?? query.fields)?.length ? (extra?.fields ?? query.fields) : undefined
  const audience = extra?.audience
  return audience?.group && base && !base.includes(audience.field) ? [...base, audience.field] : base
}

function queryBody(
  query: LookerQuery,
  timeFilter: string,
  extra?: QueryExtra,
): Record<string, unknown> {
  const audience = extra?.audience
  const projection = projectionFor(query, extra)
  const timeField = resolveTimeField(query, projection)
  const filters: Record<string, string> = {
    ...(extra?.ignoreSavedFilters
      ? {}
      : withoutCompetingTimeFilters(membershipAgnosticFilters(query.filters ?? {}), timeField)),
    [timeField]: timeFilter,
    ...membershipAgnosticFilters(extra?.filters ?? {}),
  }
  if (audience) filters[audience.field] = AUDIENCE_VALUES
  if (extra?.peakNames === false) {
    for (const key of Object.keys(filters)) {
      if (isRepNameField(key)) delete filters[key]
    }
  } else {
    filters[resolveRepNameField(query)] = lookerRepNameFilter()
  }
  // The look's pivot, table calculations and dimension fill are all written against the
  // week dimension it selects. Re-point the query at a day window and they still apply,
  // which Looker answers with a header row and no data instead of an error. Dropping them
  // turns the pivoted audience into a plain row dimension, which we fold back together
  // while parsing, and leaves pGC to be computed from Closed Clients over CC90.
  const plain = extra?.plain === true
  return {
    model: query.model,
    view: query.view,
    fields: projection,
    pivots: plain ? undefined : query.pivots,
    filters,
    sorts: selectableSorts(extra?.sorts ?? query.sorts, projection),
    limit: extra?.limit ?? (extra?.peakNames === false ? '10000' : (query.limit ?? '5000')),
    dynamic_fields: plain ? undefined : query.dynamic_fields,
    query_timezone: query.query_timezone,
    fill_fields: plain ? undefined : query.fill_fields,
  }
}

/**
 * The look decides which mgr_name / date fields exist, so a sort we hardcode can name a
 * field the clone never selected. Looker rejects or empties those rather than ignoring
 * them, so keep only sorts on fields actually in the projection.
 */
function selectableSorts(sorts: string[] | undefined, fields: string[] | undefined): string[] | undefined {
  if (!sorts?.length || !fields?.length) return sorts
  const selected = new Set(fields)
  const kept = sorts.filter((sort) => selected.has(sort.trim().split(/\s+/)[0]))
  return kept.length === sorts.length ? sorts : kept
}

/** The date dimension as it appears in the day-grain projection, for sorting. */
function dailyDateField(query: LookerQuery): string {
  return dailyFields(query).find((field) => isTimeishField(field) && field.endsWith('_date')) ?? DATE_FIELD
}

const AUDIENCE_VALUES = 'HS-STEM,K12 Test Prep'

/** How to use the explore's audience dimension: always filter, group only if it splits. */
type AudienceUse = { field: string; group: boolean }

/** Audience dimensions worth trying, the look's own first, then whatever the explore has. */
function audienceCandidates(query: LookerQuery): string[] {
  const own = [...Object.keys(query.filters ?? {}), ...(query.fields ?? [])].filter((key) =>
    /audience/.test(key.split('.').pop() ?? key),
  )
  const discovered = discoveredDimensions(query)
    .filter((d) => /audience/.test(`${d.name} ${d.label}`))
    .map((d) => d.name)
  return [
    ...new Set([
      ...own,
      ...discovered,
      // The Intraday query already groups by this one on the same model.
      'contact_audience_subject_calls.audience_subject',
      'call_data_with_coselling.audience',
    ]),
  ].slice(0, 8)
}

let audienceFieldCache: { key: string; use: AudienceUse | null; at: number } | null = null

/** Re-probe periodically so a warm container does not sit on "no audience field" forever. */
const AUDIENCE_CACHE_MS = 10 * 60 * 1000

/**
 * Which audience dimension this explore has. A field it does not expose errors out; one it
 * exposes but cannot split by still returns rows, and is worth keeping as a filter so the
 * numbers stay scoped to HS-STEM and K12 Test Prep the way the dashboard scoped them.
 * Cached per look because otherwise every load re-probes every candidate.
 */
async function audienceFieldFor(token: string, query: LookerQuery): Promise<AudienceUse | null> {
  const key = `${lookId()}|${query.model ?? ''}|${query.view ?? ''}`
  const fresh = audienceFieldCache && Date.now() - audienceFieldCache.at < AUDIENCE_CACHE_MS
  if (fresh && audienceFieldCache?.key === key) return audienceFieldCache.use
  const candidates = audienceCandidates(query)
  const probes = await Promise.all(
    candidates.map(async (field) => {
      const run = await runQueryCsv(token, query, CLOSED_WEEKS_FILTER, {
        audience: { field, group: true },
        peakNames: false,
        plain: true,
        limit: '1',
      }).catch(() => ({ csv: '', fields: [] }))
      const facts = parseLookerPlaybook(run.csv, run.fields)
      return { field, exists: run.csv.trim().length > 0, splits: facts.some((fact) => fact.totalCc90 == null) }
    }),
  )
  const best = probes.find((p) => p.splits) ?? probes.find((p) => p.exists)
  audienceFieldCache = {
    key,
    use: best ? { field: best.field, group: best.splits } : null,
    at: Date.now(),
  }
  return audienceFieldCache.use
}

async function runClosedWeeks(
  token: string,
  query: LookerQuery,
  extra?: QueryExtra,
): Promise<QueryRun & { savedLook: boolean }> {
  try {
    const run = await runQueryCsv(token, query, CLOSED_WEEKS_FILTER, { plain: true, ...extra })
    return { ...run, savedLook: false }
  } catch {
    // The saved look's own layout, so its columns have to be read from its labels.
    return { csv: await runSavedLook(token), fields: [], savedLook: true }
  }
}

async function runWtd(token: string, query: LookerQuery, extra?: QueryExtra): Promise<QueryRun> {
  const today = toIsoDate(new Date())
  const sunday = sundayWeekStart()
  return runQueryCsv(token, query, `${sunday} to ${today}`, {
    filters: dashboardFilters(query),
    peakNames: extra?.peakNames,
    audience: extra?.audience,
    plain: true,
  })
}

async function runDod(token: string, query: LookerQuery, extra?: QueryExtra): Promise<QueryRun> {
  const today = toIsoDate(new Date())
  const sunday = sundayWeekStart()
  return runQueryCsv(token, query, `${sunday} to ${today}`, {
    fields: dailyFields(query),
    filters: dashboardFilters(query),
    sorts: [`${dailyDateField(query)} desc`, resolveRepNameField(query)],
    peakNames: extra?.peakNames,
    audience: extra?.audience,
    plain: true,
  })
}

async function runRoutingRange(
  token: string,
  query: LookerQuery,
  start: string,
  end: string,
  extra?: QueryExtra,
): Promise<QueryRun> {
  return runQueryCsv(token, query, `${start} to ${addDays(end, 1)}`, {
    fields: dailyFields(query),
    filters: dashboardFilters(query),
    sorts: [`${dailyDateField(query)} desc`, resolveRepNameField(query)],
    peakNames: false,
    plain: true,
    limit: '50000',
    ...extra,
  })
}

/** The dashboard's filters as this explore names them, dropping any it does not have. */
function dashboardFilterFields(query: LookerQuery): DashboardFilter[] {
  const dims = discoveredDimensions(query)
  const out: DashboardFilter[] = []
  for (const spec of DASHBOARD_FILTERS) {
    const found = spec.names
      .map((name) => dims.find((d) => (d.name.split('.').pop() ?? '') === name)?.name)
      .find((name) => name != null)
    // Before the explore has been read, assume the field sits on the query's own view.
    const field = found ?? (query.view ? `${query.view}.${spec.names[0]}` : null)
    if (field) out.push({ label: spec.label, field })
  }
  return out
}

function dashboardFilters(query: LookerQuery): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { label, field } of dashboardFilterFields(query)) {
    out[field] = DASHBOARD_FILTERS.find((s) => s.label === label)!.value
  }
  return out
}

function droppedNotice(labels: string[], timeOnly = false): string {
  const names = labels.join(', ')
  const scope = timeOnly ? `${names}, and the source’s own filters` : names
  return `Heads up: ${scope} matched no rows for this range, so these numbers ignore ${
    labels.length > 1 || timeOnly ? 'them' : 'it'
  } and will read wider than the Looker dashboard.`
}

/**
 * Tightest scoping first, so a healthy range always uses the dashboard's own filters.
 * A filter value that stops matching upstream empties the range without erroring, so
 * peel the filters off one at a time rather than showing a blank tab. Each relaxed
 * stage carries a notice because its totals no longer match the dashboard.
 */
type RoutingStage = {
  label: string
  extra: QueryExtra
  notice: string | null
  /** Reject a result that came back blended, so the blended stages own that outcome. */
  requiresSplit?: boolean
  /** Never scoped by audience, so there is always a stage a bad audience field cannot break. */
  lastResort?: boolean
}

const NO_AUDIENCE_NOTICE =
  'Looker returned no audience split for this range, so HS-STEM and K12 Test Prep are combined.'

const BARE_NOTICE =
  'Heads up: every filter the Looker dashboard applies matched no rows for this range, so these numbers count all calls and will read wider than the dashboard.'

/**
 * Audience-split first, so HS-STEM and K12 Test Prep have their own numbers. The blended
 * stages below are the fallback for a look or explore with no audience dimension.
 */
function routingStages(query: LookerQuery, audience: AudienceUse | null): RoutingStage[] {
  const blended = [...blendedStages(query), bareStage(query)]
  if (!audience) return blended
  // Even without a split the filter belongs on every fallback, so the blended number
  // stays scoped to the two audiences rather than counting the whole business. The bare
  // last resorts stay unscoped so a wrong audience field can never empty every stage.
  const scoped = blended.map((stage) =>
    stage.lastResort
      ? stage
      : { ...stage, extra: { ...stage.extra, audience: { field: audience.field, group: false } } },
  )
  if (!audience.group) return scoped
  return [
    {
      label: `audience split on ${audience.field}`,
      extra: { audience },
      notice: null,
      requiresSplit: true,
    },
    ...scoped,
  ]
}

/**
 * Nothing left but the date window and the measures. If even this is empty then the range
 * genuinely has no calls, rather than the clone having inherited something from the look
 * that quietly filters every row away.
 */
function bareStage(query: LookerQuery): RoutingStage {
  return {
    label: 'date, rep, and measures only',
    extra: { filters: {}, ignoreSavedFilters: true, fields: bareFields(query), sorts: [] },
    notice: `${BARE_NOTICE} ${NO_AUDIENCE_NOTICE}`,
    lastResort: true,
  }
}

function blendedStages(query: LookerQuery): RoutingStage[] {
  const all = dashboardFilterFields(query)
  const filters = dashboardFilters(query)
  const pick = (label: string) => all.filter((f) => f.label === label)
  const drops = [pick('Consultant cc90'), pick('Expert Type'), pick('Business'), all].filter(
    (keys) => keys.length > 0,
  )
  const without = (keys: DashboardFilter[]) => {
    const out = { ...filters }
    for (const { field } of keys) delete out[field]
    return out
  }
  const timeOnlyNotice = droppedNotice(
    all.map((f) => f.label),
    true,
  )
  return [
    { label: 'dashboard filters', extra: { filters }, notice: NO_AUDIENCE_NOTICE },
    ...drops.map((keys) => ({
      label: `without ${keys.map((k) => k.label).join(' / ')}`,
      extra: { filters: without(keys) },
      notice: droppedNotice(keys.map((k) => k.label)),
    })),
    {
      label: 'time window only',
      extra: { filters: {}, ignoreSavedFilters: true },
      notice: timeOnlyNotice,
      lastResort: true,
    },
    {
      // Closest thing to the source's own query over this range: its own projection, no
      // sorts of ours, nothing but the date window.
      label: 'source fields, time window only, no sorts',
      extra: { filters: {}, ignoreSavedFilters: true, fields: undefined, sorts: [] },
      notice: timeOnlyNotice,
      lastResort: true,
    },
  ]
}

/**
 * The most recent day the explore has any calls at all. Call data loads a day or two
 * behind, so an empty range is usually just a range Looker has not caught up to yet, and
 * that is worth saying plainly rather than leaving it to be read out of a field dump.
 */
async function latestDayWithVolume(token: string, query: LookerQuery): Promise<string | null> {
  const date = dailyDateField(query)
  const run = await runQueryCsv(token, query, '30 days', {
    fields: [date],
    filters: {},
    ignoreSavedFilters: true,
    sorts: [`${date} desc`],
    peakNames: false,
    plain: true,
    limit: '1',
  }).catch(() => ({ csv: '', fields: [] }))
  const cell = run.csv.trim().split('\n')[1]?.split(',')[0]?.trim()
  return cell && /^\d{4}-\d{2}-\d{2}$/.test(cell) ? cell : null
}

/** First line of the CSV, so an empty range can show what Looker actually replied. */
function firstLine(csv: string): string {
  const line = csv.trim().split('\n')[0]?.trim() ?? ''
  return line.length > 400 ? `${line.slice(0, 400)}…` : line
}

function restrictToHighSchool(facts: LookerFact[]): LookerFact[] {
  const out: LookerFact[] = []
  for (const fact of facts) {
    const name = canonicalHighSchoolName(fact.name)
    if (!name) continue
    out.push(name === fact.name ? fact : { ...fact, name })
  }
  return out
}

function rosterFromFacts(facts: LookerFact[]) {
  const byName = new Map(seed.roster.map((r) => [r.name, r]))
  const names = [...new Set(facts.map((f) => f.name))].sort((a, b) => a.localeCompare(b))
  return names.map((name) => {
    const prior = byName.get(name)
    const sample = facts.find((f) => f.name === name)
    return {
      name,
      level: prior?.level ?? null,
      manager: sample?.manager ?? prior?.manager ?? null,
      workGroup: HIGH_SCHOOL_WORK_GROUP,
    }
  })
}

function dailyFromFacts(facts: LookerFact[], slice: Slice): DailyRow[] {
  return facts
    .map((f) => factToWeekly(f, slice))
    .filter((row) => row != null)
    .map((row) => ({
      date: row.week,
      rep: row.rep,
      pgc: row.pgc,
      cc90: row.cc90,
      impact: row.impact ?? null,
    }))
}

export function payloadFromFacts(
  slice: Slice,
  facts: LookerFact[],
  wtdFacts: LookerFact[],
  source: string,
  dailyFacts: LookerFact[] = [],
): PacerPayload {
  const weekly = facts.map((f) => factToWeekly(f, slice)).filter((row) => row != null)
  const weeks = [...new Set(facts.map((f) => f.week))].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  const wtdWeek = sundayWeekStart()
  const wtd = wtdFacts
    .map((f) => factToWeekly(f, slice))
    .filter((row) => row != null)
    .map((row) => ({
      week: wtdWeek,
      asOf: toIsoDate(new Date()),
      rep: row.rep,
      pgc: row.pgc,
      cc90: row.cc90,
      impact: row.impact ?? null,
    }))
  const rosterFacts = [...facts, ...dailyFacts, ...wtdFacts]
  return {
    source,
    slice,
    sliceLabel: SLICE_LOOKER_FILTERS[slice].label,
    targetPgc: seed.targetPgc,
    improvePts: seed.improvePts,
    degradePts: seed.degradePts,
    weeks,
    roster: overlayHighSchoolRoster(rosterFromFacts(rosterFacts)),
    weekly,
    wtd,
    daily: dailyFromFacts(dailyFacts, slice),
    dailyDays: daysSundayThroughToday(),
    wtdWeek,
    wtdAsOf: toIsoDate(new Date()),
    yesterdayDate: yesterday(),
    yesterdayFacts: [],
    lastWeekStart: lastCompleteWeekStart(),
    lastWeekFacts: [],
    focusLog: seed.focusLog,
  }
}

async function resolvedOverflow(): Promise<{
  allowlist: ReturnType<typeof snapshotOverflowAllowlist>
  asOf: string
  source: 'upload' | 'live' | 'snapshot'
}> {
  const shared = await readSharedOverflowChips().catch(() => null)
  return resolveOverflowAllowlist(shared).catch(() => ({
    allowlist: snapshotOverflowAllowlist(),
    asOf: snapshotAllowlistAsOf(),
    source: 'snapshot' as const,
  }))
}

async function runIntradayCsv(token: string, query: LookerQuery): Promise<string> {
  const filters: Record<string, string> = { ...(query.filters ?? {}) }
  delete filters['employee_directory.rd_name']
  delete filters['employee_directory.mgr_name']
  filters['call_view.call_created_at_date'] = 'today'
  filters['contact_audience_subject_calls.audience_subject'] = 'HS-STEM,K12 Test Prep'
  const res = await lookerFetch(token, '/queries/run/csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: query.model,
      view: query.view,
      fields: [
        'employee_directory.mgr_name',
        'employee_directory.rd_name',
        'contact_audience_subject_calls.audience_subject',
        'call_view.cc90_count',
        'call_view.cc90_with_sale_count',
      ],
      filters,
      sorts: ['employee_directory.mgr_name'],
      limit: '10000',
      dynamic_fields: query.dynamic_fields,
      query_timezone: query.query_timezone,
    }),
  })
  if (!res.ok) throw new Error(`Looker intraday query failed (${res.status})`)
  return res.text()
}

export async function fetchLookerIntraday(): Promise<IntradayPayload> {
  const resolved = await resolvedOverflow()
  const allowlistMeta = {
    allowlist: serializeAllowlist(resolved.allowlist),
    allowlistAsOf: resolved.asOf,
    allowlistSource: resolved.source,
  }
  if (!lookerConfigured()) {
    return {
      ...emptyIntraday('Looker is not configured. Set LOOKER_CLIENT_ID and LOOKER_CLIENT_SECRET.'),
      ...allowlistMeta,
    }
  }
  const token = await login()
  const query = await lookQueryFor(token, intradayLookId())
  const csv = await runIntradayCsv(token, query)
  const rows = parseIntradayCsv(csv, resolved.allowlist)
  if (rows.length === 0) {
    return { ...emptyIntraday('No people with HS/K12 CC90 yet today.'), ...allowlistMeta }
  }
  return {
    source: `Looker look ${intradayLookId()}`,
    asOf: toIsoDate(new Date()),
    rows,
    ...allowlistMeta,
  }
}

export async function fetchLookerRouting(from: string, to: string): Promise<RoutingRangePayload> {
  const range = clampRange(from, to)
  const resolved = await resolvedOverflow()
  const allowlistMeta = {
    allowlist: serializeAllowlist(resolved.allowlist),
    allowlistAsOf: resolved.asOf,
    allowlistSource: resolved.source,
  }
  if (!lookerConfigured()) {
    return {
      ...range,
      facts: [],
      empty: true,
      emptyReason: 'Looker is not configured. Set LOOKER_CLIENT_ID and LOOKER_CLIENT_SECRET.',
      ...allowlistMeta,
    }
  }
  const token = await login()
  const query = await sourceQuery(token)
  await discoverExplore(token, query)

  const cachedAudience = audienceFieldCache
  const audience = await audienceFieldFor(token, query)
  let stages = routingStages(query, audience)
  const attempt = async (stage: RoutingStage) => {
    const run = await runRoutingRange(token, query, range.start, range.end, stage.extra).catch(
      (err: unknown) => (err instanceof Error ? err.message : 'failed'),
    )
    const failed = typeof run === 'string'
    const parsed = failed ? [] : parseLookerPlaybook(run.csv, run.fields)
    const routed = failed ? [] : factsToRouting(parsed, resolved.allowlist)
    const blended = routed.length > 0 && routed.every((fact) => fact.totalCc90 != null)
    return {
      stage,
      facts: stage.requiresSplit && blended ? [] : routed,
      note: failed
        ? `${stage.label}: ${run}`
        : `${stage.label}: ${run.csv.trim() ? run.csv.trim().split('\n').length : 0} lines, ${parsed.length} rep rows`,
      header: failed ? '' : firstLine(run.csv),
    }
  }

  let lead = await attempt(stages[0])
  // A cached audience field that stopped working would poison every scoped stage, so
  // re-probe once and rebuild rather than spending the whole cascade on it.
  if (lead.facts.length === 0 && cachedAudience) {
    audienceFieldCache = null
    const reprobed = await audienceFieldFor(token, query)
    if (reprobed?.field !== audience?.field || reprobed?.group !== audience?.group) {
      stages = routingStages(query, reprobed)
      lead = await attempt(stages[0])
    }
  }
  if (lead.facts.length > 0) {
    return {
      start: range.start,
      end: range.end,
      facts: lead.facts,
      notice: stages[0].notice ?? undefined,
      ...allowlistMeta,
    }
  }

  // Concurrent so the whole cascade costs one round trip. Run sequentially and the
  // function timeout truncates the diagnosis before the most informative stage.
  const rest = await Promise.all(stages.slice(1).map(attempt))
  const winner = rest.find((result) => result.facts.length > 0)
  if (winner) {
    return {
      start: range.start,
      end: range.end,
      facts: winner.facts,
      notice: winner.stage.notice ?? undefined,
      ...allowlistMeta,
    }
  }

  const attempts = [lead, ...rest]
  const header = attempts.map((a) => a.header).find((line) => line.length > 0)
  const latest = await latestDayWithVolume(token, query)
  const asked = range.start === range.end ? range.start : `${range.start} to ${range.end}`
  const headline =
    latest && latest < range.start
      ? `Looker has no call data for ${asked} yet — its most recent day with calls is ${latest}. Pick a range ending on or before ${latest}.`
      : 'No rows for this range.'
  return {
    ...range,
    facts: [],
    empty: true,
    emptyReason: `${headline} ${attempts.map((a) => a.note).join(' · ')} · windowed on ${resolveTimeField(
      query,
      dailyFields(query),
    )} · rep name ${resolveRepNameField(query)} · source ${query.model}/${query.view} selects [${(
      query.fields ?? []
    ).join(', ')}] · bare projection [${bareFields(query).join(', ')}] · explore exposed ${
      discoveredDimensions(query).length
    } dimensions${header ? ` · Looker's columns were: ${header}` : ''}`,
    ...allowlistMeta,
  }
}

export async function fetchLookerPayload(slice: Slice, staffing: Staffing): Promise<PacerPayload> {
  if (staffing === 'cross-train') {
    return emptyPayload(
      slice,
      'Cross Train / overflow is not in this Looker look. It needs a staffing or overflow flag on the same grain.',
    )
  }
  if (!lookerConfigured()) {
    return emptyPayload(slice, 'Looker is not configured. Set LOOKER_CLIENT_ID and LOOKER_CLIENT_SECRET.')
  }

  const token = await login()
  const query = await sourceQuery(token)
  await discoverExplore(token, query)

  const trio = async (extra: QueryExtra) => {
    const empty: QueryRun = { csv: '', fields: [] }
    const [closed, wtd, dod] = await Promise.all([
      runClosedWeeks(token, query, extra).catch(() => ({ ...empty, savedLook: false })),
      runWtd(token, query, extra).catch(() => empty),
      runDod(token, query, extra).catch(() => empty),
    ])
    const parse = (run: QueryRun) => restrictToHighSchool(parseLookerPlaybook(run.csv, run.fields))
    return { facts: parse(closed), wtdFacts: parse(wtd), dailyFacts: parse(dod) }
  }
  const barren = (r: Awaited<ReturnType<typeof trio>>) => r.facts.length === 0 && r.dailyFacts.length === 0

  const audience = await audienceFieldFor(token, query)
  let run = await trio(audience ? { audience } : {})
  if (audience?.group && barren(run)) {
    // The split stopped working; keep the audience scoping but stop grouping by it.
    audienceFieldCache = null
    run = await trio({ audience: { field: audience.field, group: false } })
  }
  if (audience && barren(run)) run = await trio({})
  if (barren(run)) run = await trio({ peakNames: false, audience: audience ?? undefined })
  if (barren(run)) run = await trio({ peakNames: false })
  const { facts, wtdFacts, dailyFacts } = run
  return payloadFromFacts(
    slice,
    facts,
    wtdFacts,
    `Looker ${query.model}/${query.view} · High School Peak by Rep Name`,
    dailyFacts,
  )
}

function allowedDomains(): string[] {
  return env('ALLOWED_EMAIL_DOMAINS')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
}

function emailAllowed(email: string): boolean {
  const domains = allowedDomains()
  if (domains.length === 0) return true
  const at = email.toLowerCase().split('@')[1]
  return Boolean(at && domains.includes(at))
}

function requireAuth(): boolean {
  if (env('LOOKER_SKIP_AUTH') === 'true') return false
  if (env('NETLIFY_DEV') === 'true') return false
  return env('NETLIFY') === 'true'
}

async function identityUser(req: Request): Promise<{ email: string } | null> {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!header?.toLowerCase().startsWith('bearer ')) return null
  const site = env('URL') || env('DEPLOY_PRIME_URL') || env('SITE_URL')
  if (!site) return null
  const res = await fetch(`${site.replace(/\/$/, '')}/.netlify/identity/user`, {
    headers: { Authorization: header },
  })
  if (!res.ok) return null
  const user = (await res.json()) as { email?: string }
  return user.email ? { email: user.email } : null
}

export async function handleLookerRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const slice = (url.searchParams.get('slice') === 'overall' ? 'supergroup' : url.searchParams.get('slice')) as Slice
  const staffing = (url.searchParams.get('staffing') ?? 'primary') as Staffing
  const safeSlice: Slice = slice === 'k12tp' || slice === 'supergroup' || slice === 'hs-stem' ? slice : 'hs-stem'

  if (requireAuth()) {
    const user = await identityUser(req)
    if (!user) {
      return Response.json({ error: 'Sign in with Google to load playbook data.' }, { status: 401 })
    }
    if (!emailAllowed(user.email)) {
      return Response.json(
        { error: `Use a ${allowedDomains().join(' or ')} Google account.` },
        { status: 403 },
      )
    }
  }

  try {
    if (url.searchParams.get('view') === 'overflow-chips') {
      if (req.method === 'POST') {
        const raw = await req.json().catch(() => null)
        if (raw == null || typeof raw !== 'object') {
          return Response.json({ error: 'Upload a valid Overflow Configs CSV first.' }, { status: 400 })
        }
        try {
          const chips = await writeSharedOverflowChips(raw)
          return Response.json({ ...chips, source: 'upload' })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not save Overflow Configs chips.'
          return Response.json({ error: message }, { status: 400 })
        }
      }
      if (req.method === 'DELETE') {
        await clearSharedOverflowChips()
        return Response.json({ ok: true })
      }
      const resolved = await resolvedOverflow()
      return Response.json({
        asOf: resolved.asOf,
        ...serializeAllowlist(resolved.allowlist),
        source: resolved.source,
      })
    }
    if (url.searchParams.get('view') === 'intraday') {
      return Response.json(await fetchLookerIntraday())
    }
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    if (from && to) {
      const payload = await fetchLookerRouting(from, to)
      return Response.json(payload)
    }
    const payload = await fetchLookerPayload(safeSlice, staffing)
    return Response.json(payload, { status: payload.empty ? 200 : 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Looker request failed'
    if (url.searchParams.get('view') === 'overflow-chips') {
      return Response.json({ error: message }, { status: 500 })
    }
    if (url.searchParams.get('view') === 'intraday') {
      return Response.json(emptyIntraday(message))
    }
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    if (from && to) {
      const range = clampRange(from, to)
      return Response.json({ ...range, facts: [], empty: true, emptyReason: message })
    }
    return Response.json(emptyPayload(safeSlice, message), { status: 200 })
  }
}
