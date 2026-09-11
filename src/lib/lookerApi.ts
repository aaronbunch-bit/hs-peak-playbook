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

const LOOKER_TIME_FILTER = 'call_data_with_coselling.call_created_at_time'
const WEEK_FIELD = 'call_data_with_coselling.call_created_at_week'
const DATE_FIELD = 'call_data_with_coselling.call_created_at_date'
const REP_NAME_FIELD = 'call_data_with_coselling.mgr_name'

/** Dashboard 7699 defaults that the DoD clone should match. */
const DASHBOARD_7699_FILTERS: Record<string, string> = {
  'call_data_with_coselling.business': 'International,VT Core',
  'call_data_with_coselling.expert_type': '-Dropped Expert',
  'call_data_with_coselling.consultant_cc90': 'Yes',
}

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

type QueryExtra = {
  fields?: string[]
  filters?: Record<string, string>
  sorts?: string[]
  peakNames?: boolean
  limit?: string
  /** Drop the saved look's own filters, leaving only the time window. */
  ignoreSavedFilters?: boolean
}

async function runQueryCsv(
  token: string,
  query: LookerQuery,
  timeFilter: string,
  extra?: QueryExtra,
): Promise<string> {
  const res = await lookerFetch(token, '/queries/run/csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(queryBody(query, timeFilter, extra)),
  })
  if (!res.ok) throw new Error(`Looker query failed (${res.status})`)
  return res.text()
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
function withoutCompetingTimeFilters(filters: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(filters)) {
    const field = key.split('.').pop() ?? key
    if (key !== LOOKER_TIME_FILTER && field.startsWith('call_created_at')) continue
    out[key] = value
  }
  return out
}

function queryBody(
  query: LookerQuery,
  timeFilter: string,
  extra?: QueryExtra,
): Record<string, unknown> {
  const filters: Record<string, string> = {
    ...(extra?.ignoreSavedFilters
      ? {}
      : withoutCompetingTimeFilters(membershipAgnosticFilters(query.filters ?? {}))),
    [LOOKER_TIME_FILTER]: timeFilter,
    ...membershipAgnosticFilters(extra?.filters ?? {}),
  }
  if (extra?.peakNames === false) {
    delete filters[REP_NAME_FIELD]
  } else {
    filters[REP_NAME_FIELD] = lookerRepNameFilter()
  }
  const fields = extra?.fields ?? query.fields
  return {
    model: query.model,
    view: query.view,
    fields,
    pivots: query.pivots,
    filters,
    sorts: selectableSorts(extra?.sorts ?? query.sorts, fields),
    limit: extra?.limit ?? (extra?.peakNames === false ? '10000' : (query.limit ?? '5000')),
    dynamic_fields: query.dynamic_fields,
    query_timezone: query.query_timezone,
    fill_fields: query.fill_fields,
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

function dailyFields(query: LookerQuery): string[] {
  return (query.fields ?? []).map((field) => (field === WEEK_FIELD ? DATE_FIELD : field))
}

async function runClosedWeeks(
  token: string,
  query: LookerQuery,
  extra?: QueryExtra,
): Promise<{ csv: string; savedLook: boolean }> {
  try {
    return { csv: await runQueryCsv(token, query, CLOSED_WEEKS_FILTER, extra), savedLook: false }
  } catch {
    return { csv: await runSavedLook(token), savedLook: true }
  }
}

async function runWtd(token: string, query: LookerQuery, extra?: QueryExtra): Promise<string> {
  const today = toIsoDate(new Date())
  const sunday = sundayWeekStart()
  return runQueryCsv(token, query, `${sunday} to ${today}`, {
    filters: DASHBOARD_7699_FILTERS,
    peakNames: extra?.peakNames,
  })
}

async function runDod(token: string, query: LookerQuery, extra?: QueryExtra): Promise<string> {
  const today = toIsoDate(new Date())
  const sunday = sundayWeekStart()
  return runQueryCsv(token, query, `${sunday} to ${today}`, {
    fields: dailyFields(query),
    filters: DASHBOARD_7699_FILTERS,
    sorts: [`${DATE_FIELD} desc`, 'call_data_with_coselling.mgr_name'],
    peakNames: extra?.peakNames,
  })
}

async function runRoutingRange(
  token: string,
  query: LookerQuery,
  start: string,
  end: string,
  extra?: QueryExtra,
): Promise<string> {
  return runQueryCsv(token, query, `${start} to ${addDays(end, 1)}`, {
    fields: dailyFields(query),
    filters: DASHBOARD_7699_FILTERS,
    sorts: [`${DATE_FIELD} desc`, REP_NAME_FIELD],
    peakNames: false,
    limit: '50000',
    ...extra,
  })
}

const FILTER_LABELS: Record<string, string> = {
  'call_data_with_coselling.consultant_cc90': 'Consultant cc90',
  'call_data_with_coselling.expert_type': 'Expert Type',
  'call_data_with_coselling.business': 'Business',
}

function without(keys: string[]): Record<string, string> {
  const out = { ...DASHBOARD_7699_FILTERS }
  for (const key of keys) delete out[key]
  return out
}

function droppedNotice(keys: string[], timeOnly = false): string {
  const names = keys.map((key) => FILTER_LABELS[key] ?? key).join(', ')
  const scope = timeOnly ? `${names}, and the saved look’s own filters` : names
  return `Heads up: ${scope} matched no rows for this range, so these numbers ignore ${
    keys.length > 1 || timeOnly ? 'them' : 'it'
  } and will read wider than the Looker dashboard.`
}

/**
 * Tightest scoping first, so a healthy range always uses the dashboard's own filters.
 * A filter value that stops matching upstream empties the range without erroring, so
 * peel the filters off one at a time rather than showing a blank tab. Each relaxed
 * stage carries a notice because its totals no longer match the dashboard.
 */
const ROUTING_STAGES: Array<{ label: string; extra: QueryExtra; notice: string | null }> = (() => {
  const cc90 = 'call_data_with_coselling.consultant_cc90'
  const expert = 'call_data_with_coselling.expert_type'
  const business = 'call_data_with_coselling.business'
  const drops = [[cc90], [expert], [business], [cc90, expert, business]]
  const timeOnlyNotice = droppedNotice([cc90, expert, business], true)
  return [
    { label: 'dashboard 7699 filters', extra: {}, notice: null },
    ...drops.map((keys) => ({
      label: `without ${keys.map((key) => FILTER_LABELS[key] ?? key).join(' / ')}`,
      extra: { filters: without(keys) },
      notice: droppedNotice(keys),
    })),
    {
      label: 'time window only',
      extra: { filters: {}, ignoreSavedFilters: true },
      notice: timeOnlyNotice,
    },
    {
      // Closest thing to running the saved look over this range: the look's own
      // projection, no sorts of ours, nothing but the date window.
      label: 'look fields, time window only, no sorts',
      extra: { filters: {}, ignoreSavedFilters: true, fields: undefined, sorts: [] },
      notice: timeOnlyNotice,
    },
  ]
})()

/** First line of the CSV, so an empty range can show what Looker actually replied. */
function firstLine(csv: string): string {
  const line = csv.trim().split('\n')[0]?.trim() ?? ''
  return line.length > 160 ? `${line.slice(0, 160)}…` : line
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
  const query = await lookQuery(token)

  const attempt = async (stage: (typeof ROUTING_STAGES)[number]) => {
    const csv = await runRoutingRange(token, query, range.start, range.end, stage.extra).catch(
      (err: unknown) => (err instanceof Error ? `!${err.message}` : '!failed'),
    )
    const failed = csv.startsWith('!')
    const parsed = failed ? [] : parseLookerPlaybook(csv)
    return {
      stage,
      facts: failed ? [] : factsToRouting(parsed, resolved.allowlist),
      note: failed
        ? `${stage.label}: ${csv.slice(1)}`
        : `${stage.label}: ${csv.trim() ? csv.trim().split('\n').length : 0} lines, ${parsed.length} rep rows`,
      header: failed ? '' : firstLine(csv),
    }
  }

  const [first] = ROUTING_STAGES
  const lead = await attempt(first)
  if (lead.facts.length > 0) {
    return { start: range.start, end: range.end, facts: lead.facts, ...allowlistMeta }
  }

  // Concurrent so the whole cascade costs one round trip. Run sequentially and the
  // function timeout truncates the diagnosis before the most informative stage.
  const rest = await Promise.all(ROUTING_STAGES.slice(1).map(attempt))
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
  return {
    ...range,
    facts: [],
    empty: true,
    emptyReason: `No rows for this range. ${attempts.map((a) => a.note).join(' · ')}${
      header ? ` · Looker's columns were: ${header}` : ''
    }`,
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
  const query = await lookQuery(token)
  const [closed, wtdCsv, dodCsv] = await Promise.all([
    runClosedWeeks(token, query),
    runWtd(token, query).catch(() => ''),
    runDod(token, query).catch(() => ''),
  ])
  let facts = restrictToHighSchool(parseLookerPlaybook(closed.csv))
  let wtdFacts = restrictToHighSchool(wtdCsv ? parseLookerPlaybook(wtdCsv) : [])
  let dailyFacts = restrictToHighSchool(dodCsv ? parseLookerPlaybook(dodCsv) : [])
  if (facts.length === 0 && dailyFacts.length === 0) {
    const [closedAll, wtdAll, dodAll] = await Promise.all([
      runClosedWeeks(token, query, { peakNames: false }).catch(() => ({ csv: '', savedLook: false })),
      runWtd(token, query, { peakNames: false }).catch(() => ''),
      runDod(token, query, { peakNames: false }).catch(() => ''),
    ])
    facts = restrictToHighSchool(parseLookerPlaybook(closedAll.csv))
    wtdFacts = restrictToHighSchool(wtdAll ? parseLookerPlaybook(wtdAll) : wtdFacts)
    dailyFacts = restrictToHighSchool(dodAll ? parseLookerPlaybook(dodAll) : dailyFacts)
  }
  return payloadFromFacts(
    slice,
    facts,
    wtdFacts,
    `Looker look ${lookId()} · High School Peak by Rep Name`,
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
