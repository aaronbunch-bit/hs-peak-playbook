import { addDays, daysSundayThroughToday, lastCompleteWeekStart, sundayWeekStart, toIsoDate, yesterday } from './calendar'
import { HIGH_SCHOOL_WORK_GROUP, canonicalHighSchoolName, lookerRepNameFilter, overlayHighSchoolRoster } from '../data/highSchoolWorkGroup'
import { seed } from '../data/seed'
import { factToWeekly, parseLookerPlaybook } from './lookerExport'
import { emptyPayload, SLICE_LOOKER_FILTERS } from './lookerShared'
import { factsToRouting } from './routing'
import type { DailyRow, LookerFact, PacerPayload, Slice, Staffing } from './types'

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

async function lookQuery(token: string): Promise<LookerQuery> {
  const lookRes = await lookerFetch(token, `/looks/${lookId()}?fields=query`)
  if (!lookRes.ok) throw new Error(`Looker look metadata failed (${lookRes.status})`)
  const look = (await lookRes.json()) as { query?: LookerQuery }
  if (!look.query) throw new Error('Looker look has no query')
  return look.query
}

type QueryExtra = {
  fields?: string[]
  filters?: Record<string, string>
  sorts?: string[]
  peakNames?: boolean
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

function queryBody(
  query: LookerQuery,
  timeFilter: string,
  extra?: QueryExtra,
): Record<string, unknown> {
  const filters: Record<string, string> = {
    ...membershipAgnosticFilters(query.filters ?? {}),
    [LOOKER_TIME_FILTER]: timeFilter,
    ...membershipAgnosticFilters(extra?.filters ?? {}),
  }
  if (extra?.peakNames === false) {
    delete filters[REP_NAME_FIELD]
  } else {
    filters[REP_NAME_FIELD] = lookerRepNameFilter()
  }
  return {
    model: query.model,
    view: query.view,
    fields: extra?.fields ?? query.fields,
    pivots: query.pivots,
    filters,
    sorts: extra?.sorts ?? query.sorts,
    limit: extra?.peakNames === false ? '10000' : (query.limit ?? '5000'),
    dynamic_fields: query.dynamic_fields,
    query_timezone: query.query_timezone,
    fill_fields: query.fill_fields,
  }
}

function dailyFields(query: LookerQuery): string[] {
  return (query.fields ?? []).map((field) => (field === WEEK_FIELD ? DATE_FIELD : field))
}

async function runClosedWeeks(token: string, query: LookerQuery): Promise<{ csv: string; savedLook: boolean }> {
  try {
    return { csv: await runQueryCsv(token, query, CLOSED_WEEKS_FILTER), savedLook: false }
  } catch {
    return { csv: await runSavedLook(token), savedLook: true }
  }
}

async function runWtd(token: string, query: LookerQuery): Promise<string> {
  const today = toIsoDate(new Date())
  const sunday = sundayWeekStart()
  return runQueryCsv(token, query, `${sunday} to ${today}`, {
    filters: DASHBOARD_7699_FILTERS,
  })
}

async function runDod(token: string, query: LookerQuery): Promise<string> {
  const today = toIsoDate(new Date())
  const sunday = sundayWeekStart()
  return runQueryCsv(token, query, `${sunday} to ${today}`, {
    fields: dailyFields(query),
    filters: DASHBOARD_7699_FILTERS,
    sorts: [`${DATE_FIELD} desc`, 'call_data_with_coselling.mgr_name'],
  })
}

async function runYesterday(token: string, query: LookerQuery): Promise<string> {
  return runQueryCsv(token, query, 'yesterday', {
    fields: dailyFields(query),
    filters: DASHBOARD_7699_FILTERS,
    sorts: [`${DATE_FIELD} desc`, REP_NAME_FIELD],
    peakNames: false,
  })
}

async function runLastCompleteWeek(token: string, query: LookerQuery): Promise<string> {
  const start = lastCompleteWeekStart()
  const end = addDays(start, 6)
  return runQueryCsv(token, query, `${start} to ${end}`, {
    filters: DASHBOARD_7699_FILTERS,
    sorts: [WEEK_FIELD, REP_NAME_FIELD],
    peakNames: false,
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
    }))
}

export function payloadFromFacts(
  slice: Slice,
  facts: LookerFact[],
  wtdFacts: LookerFact[],
  source: string,
  dailyFacts: LookerFact[] = [],
  routing?: { yesterday: LookerFact[]; lastWeek: LookerFact[] },
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
    }))
  const rosterFacts = [...facts, ...dailyFacts, ...wtdFacts]
  const yesterdayDate = yesterday()
  const lastWeekStart = lastCompleteWeekStart()
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
    yesterdayDate,
    yesterdayFacts: factsToRouting(routing?.yesterday ?? []),
    lastWeekStart,
    lastWeekFacts: factsToRouting(routing?.lastWeek ?? []),
    focusLog: seed.focusLog,
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
  const [closed, wtdCsv, dodCsv, yesterdayCsv, lastWeekCsv] = await Promise.all([
    runClosedWeeks(token, query),
    runWtd(token, query).catch(() => ''),
    runDod(token, query).catch(() => ''),
    runYesterday(token, query).catch(() => ''),
    runLastCompleteWeek(token, query).catch(() => ''),
  ])
  const facts = restrictToHighSchool(parseLookerPlaybook(closed.csv))
  const wtdFacts = restrictToHighSchool(wtdCsv ? parseLookerPlaybook(wtdCsv) : [])
  const dailyFacts = restrictToHighSchool(dodCsv ? parseLookerPlaybook(dodCsv) : [])
  const payload = payloadFromFacts(
    slice,
    facts,
    wtdFacts,
    `Looker look ${lookId()} · High School Peak by Rep Name`,
    dailyFacts,
    {
      yesterday: yesterdayCsv ? parseLookerPlaybook(yesterdayCsv) : [],
      lastWeek: lastWeekCsv ? parseLookerPlaybook(lastWeekCsv) : [],
    },
  )
  if (payload.weekly.length === 0 && payload.daily.length === 0) {
    return emptyPayload(slice, `No rows for ${SLICE_LOOKER_FILTERS[slice].label} from Looker look ${lookId()}.`)
  }
  return payload
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
    const payload = await fetchLookerPayload(safeSlice, staffing)
    return Response.json(payload, { status: payload.empty ? 200 : 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Looker request failed'
    return Response.json(emptyPayload(safeSlice, message), { status: 200 })
  }
}
