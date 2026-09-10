import { addDays, daysSundayThroughToday, lastCompleteWeekStart, sundayWeekStart, toIsoDate, yesterday } from './calendar'
import { HIGH_SCHOOL_WORK_GROUP, canonicalHighSchoolName, lookerRepNameFilter, overlayHighSchoolRoster } from '../data/highSchoolWorkGroup'
import { seed } from '../data/seed'
import { emptyIntraday, parseIntradayCsv, parseIntradayFromCsv } from './intraday'
import {
  applyDashboardDefaultFilters,
  dailyFieldsFor,
  dailyFillFields,
  dash7699Filters,
  DEFAULT_LOOKER_DASHBOARD_ID,
  exploreFromQuery,
  pickDashboardQuery,
  queryIdFromElement,
  toLookerQuery,
  type LookerDashboard,
  type LookerExplore,
  type LookerQuery,
} from './lookerDashboard'
import { factToWeekly, parseLookerPlaybook } from './lookerExport'
import { emptyPayload, SLICE_LOOKER_FILTERS } from './lookerShared'
import { resolveOverflowAllowlist, serializeAllowlist, snapshotAllowlistAsOf, snapshotOverflowAllowlist } from './overflowAllowlist'
import { clearSharedOverflowChips, readSharedOverflowChips, writeSharedOverflowChips } from './overflowStore'
import { factsToRouting } from './routing'
import { clampRange } from './routingRange'
import type { DailyRow, IntradayPayload, LookerFact, PacerPayload, RoutingRangePayload, Slice, Staffing } from './types'


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

function dashboardId(): string {
  return env('LOOKER_DASHBOARD_ID') || DEFAULT_LOOKER_DASHBOARD_ID
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

async function fetchDashboardJson(token: string, id: string): Promise<LookerDashboard | null> {
  for (const path of [`/dashboards/${id}`, `/dashboards/${encodeURIComponent(id)}`]) {
    const res = await lookerFetch(token, path)
    if (res.ok) return (await res.json()) as LookerDashboard
  }
  const search = await lookerFetch(token, `/dashboards/search?id=${encodeURIComponent(id)}`)
  if (search.ok) {
    const list = (await search.json()) as LookerDashboard[]
    if (list[0]) return list[0]
  }
  const name = id.includes('::') ? id.split('::')[1] : id
  const byTitle = await lookerFetch(token, `/dashboards/search?title=${encodeURIComponent(name)}`)
  if (!byTitle.ok) return null
  const titled = (await byTitle.json()) as LookerDashboard[]
  return titled.find((d) => d.id === id || d.id?.endsWith(`::${name}`)) ?? titled[0] ?? null
}

async function hydrateDashboardElements(token: string, dashboard: LookerDashboard, id: string): Promise<LookerDashboard> {
  if (dashboard.dashboard_elements?.some((el) => toLookerQuery(el.query) || toLookerQuery(el.result_maker?.query))) {
    return dashboard
  }
  const search = await lookerFetch(token, `/dashboard_elements/search?dashboard_id=${encodeURIComponent(id)}`)
  if (!search.ok) return dashboard
  const elements = (await search.json()) as LookerDashboard['dashboard_elements']
  return { ...dashboard, dashboard_elements: elements ?? dashboard.dashboard_elements }
}

async function resolveElementQuery(token: string, dashboard: LookerDashboard): Promise<LookerQuery | null> {
  const picked = pickDashboardQuery(dashboard)
  if (picked?.fields?.length) return picked
  for (const element of dashboard.dashboard_elements ?? []) {
    const queryId = queryIdFromElement(element)
    if (!queryId) continue
    const res = await lookerFetch(token, `/queries/${queryId}`)
    if (!res.ok) continue
    const query = toLookerQuery((await res.json()) as LookerQuery)
    if (query?.fields?.length) return query
  }
  return picked
}

async function loadExplore(token: string): Promise<LookerExplore> {
  const id = dashboardId()
  const dash = await fetchDashboardJson(token, id).catch(() => null)
  if (dash) {
    const hydrated = await hydrateDashboardElements(token, dash, dash.id ?? id).catch(() => dash)
    const query = await resolveElementQuery(token, hydrated)
    if (query?.model && query.view && query.fields?.length) {
      return exploreFromQuery(applyDashboardDefaultFilters(query, hydrated.dashboard_filters), `Looker dashboard ${id}`)
    }
  }
  const fallback = await lookQuery(token)
  return exploreFromQuery(fallback, `Looker look ${lookId()} · High School Peak by Rep Name`)
}

type QueryExtra = {
  fields?: string[]
  filters?: Record<string, string>
  sorts?: string[]
  peakNames?: boolean
  limit?: string
  fillFields?: string[]
}

async function runQueryCsv(
  token: string,
  explore: LookerExplore,
  timeFilter: string,
  extra?: QueryExtra,
): Promise<string> {
  const res = await lookerFetch(token, '/queries/run/csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(queryBody(explore, timeFilter, extra)),
  })
  if (!res.ok) throw new Error(`Looker query failed (${res.status})`)
  return res.text()
}

async function runQueryCsvWithOptional7699(
  token: string,
  explore: LookerExplore,
  timeFilter: string,
  extra?: QueryExtra,
): Promise<string> {
  try {
    return await runQueryCsv(token, explore, timeFilter, {
      ...extra,
      filters: { ...dash7699Filters(explore), ...(extra?.filters ?? {}) },
    })
  } catch {
    return runQueryCsv(token, explore, timeFilter, extra)
  }
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

function queryBody(
  explore: LookerExplore,
  timeFilter: string,
  extra?: QueryExtra,
): Record<string, unknown> {
  const query = explore.query
  const filters: Record<string, string> = {
    ...membershipAgnosticFilters(query.filters ?? {}),
    [explore.timeFilter]: timeFilter,
    ...membershipAgnosticFilters(extra?.filters ?? {}),
  }
  if (extra?.peakNames === false) {
    delete filters[explore.repNameField]
  } else {
    filters[explore.repNameField] = lookerRepNameFilter()
  }
  return {
    model: query.model,
    view: query.view,
    fields: extra?.fields ?? query.fields,
    pivots: query.pivots,
    filters,
    sorts: extra?.sorts ?? query.sorts,
    limit: extra?.limit ?? (extra?.peakNames === false ? '10000' : (query.limit ?? '5000')),
    dynamic_fields: query.dynamic_fields,
    query_timezone: query.query_timezone,
    fill_fields: extra?.fillFields ?? (extra?.fields ? dailyFillFields(explore) : query.fill_fields),
  }
}

async function runClosedWeeks(
  token: string,
  explore: LookerExplore,
  extra?: QueryExtra,
): Promise<{ csv: string; savedLook: boolean }> {
  try {
    return { csv: await runQueryCsv(token, explore, CLOSED_WEEKS_FILTER, extra), savedLook: false }
  } catch {
    return { csv: await runSavedLook(token), savedLook: true }
  }
}

async function runWtd(token: string, explore: LookerExplore, extra?: QueryExtra): Promise<string> {
  const today = toIsoDate(new Date())
  const sunday = sundayWeekStart()
  return runQueryCsvWithOptional7699(token, explore, `${sunday} to ${today}`, {
    peakNames: extra?.peakNames,
  })
}

async function runDod(token: string, explore: LookerExplore, extra?: QueryExtra): Promise<string> {
  const today = toIsoDate(new Date())
  const sunday = sundayWeekStart()
  return runQueryCsvWithOptional7699(token, explore, `${sunday} to ${today}`, {
    fields: dailyFieldsFor(explore),
    sorts: [`${explore.dateField} desc`, explore.repNameField],
    peakNames: extra?.peakNames,
  })
}

async function runRoutingRange(token: string, explore: LookerExplore, start: string, end: string): Promise<string> {
  return runQueryCsvWithOptional7699(token, explore, `${start} to ${addDays(end, 1)}`, {
    fields: dailyFieldsFor(explore),
    sorts: [`${explore.dateField} desc`, explore.repNameField],
    peakNames: false,
    limit: '50000',
  })
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

async function runLegacyIntradayCsv(token: string, query: LookerQuery): Promise<string> {
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

async function runDashboardIntradayCsv(token: string, explore: LookerExplore): Promise<string> {
  return runQueryCsvWithOptional7699(token, explore, 'today', {
    fields: dailyFieldsFor(explore),
    sorts: [explore.repNameField],
    peakNames: false,
    limit: '10000',
  })
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
  const explore = await loadExplore(token)
  let source = `${explore.sourceLabel} · today`
  let rows = parseIntradayFromCsv(await runDashboardIntradayCsv(token, explore), resolved.allowlist)
  if (rows.length === 0) {
    try {
      const query = await lookQueryFor(token, intradayLookId())
      rows = parseIntradayCsv(await runLegacyIntradayCsv(token, query), resolved.allowlist)
      if (rows.length > 0) source = `Looker look ${intradayLookId()}`
    } catch {
      // Keep the dashboard empty result; the saved look is only a fallback.
    }
  }
  if (rows.length === 0) {
    return { ...emptyIntraday('No people with HS/K12 CC90 yet today.'), ...allowlistMeta }
  }
  return {
    source,
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
  const explore = await loadExplore(token)
  const csv = await runRoutingRange(token, explore, range.start, range.end)
  return {
    start: range.start,
    end: range.end,
    facts: factsToRouting(parseLookerPlaybook(csv), resolved.allowlist),
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
  const explore = await loadExplore(token)
  const [closed, wtdCsv, dodCsv] = await Promise.all([
    runClosedWeeks(token, explore),
    runWtd(token, explore).catch(() => ''),
    runDod(token, explore).catch(() => ''),
  ])
  let facts = restrictToHighSchool(parseLookerPlaybook(closed.csv))
  let wtdFacts = restrictToHighSchool(wtdCsv ? parseLookerPlaybook(wtdCsv) : [])
  let dailyFacts = restrictToHighSchool(dodCsv ? parseLookerPlaybook(dodCsv) : [])
  if (facts.length === 0 && dailyFacts.length === 0) {
    const [closedAll, wtdAll, dodAll] = await Promise.all([
      runClosedWeeks(token, explore, { peakNames: false }).catch(() => ({ csv: '', savedLook: false })),
      runWtd(token, explore, { peakNames: false }).catch(() => ''),
      runDod(token, explore, { peakNames: false }).catch(() => ''),
    ])
    facts = restrictToHighSchool(parseLookerPlaybook(closedAll.csv))
    wtdFacts = restrictToHighSchool(wtdAll ? parseLookerPlaybook(wtdAll) : wtdFacts)
    dailyFacts = restrictToHighSchool(dodAll ? parseLookerPlaybook(dodAll) : dailyFacts)
  }
  return payloadFromFacts(
    slice,
    facts,
    wtdFacts,
    `${explore.sourceLabel} · High School Peak by Rep Name`,
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
