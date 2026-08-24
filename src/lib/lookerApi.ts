import { sundayWeekStart, toIsoDate } from './calendar'
import { seed } from '../data/seed'
import { factToWeekly, parseLookerPlaybook } from './lookerExport'
import { emptyPayload, SLICE_LOOKER_FILTERS } from './lookerShared'
import type { LookerFact, PacerPayload, Slice, Staffing } from './types'

const LOOKER_TIME_FILTER = 'call_data_with_coselling.call_created_at_time'

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

/** Saved look is 4 complete weeks; Δ 3wk needs six, so closed weeks clone the query farther back. */
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

async function runQueryCsv(token: string, query: LookerQuery, timeFilter: string): Promise<string> {
  const res = await lookerFetch(token, '/queries/run/csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(queryBody(query, timeFilter)),
  })
  if (!res.ok) throw new Error(`Looker query failed (${res.status})`)
  return res.text()
}

function queryBody(query: LookerQuery, timeFilter: string): Record<string, unknown> {
  const filters = { ...(query.filters ?? {}), [LOOKER_TIME_FILTER]: timeFilter }
  return {
    model: query.model,
    view: query.view,
    fields: query.fields,
    pivots: query.pivots,
    filters,
    sorts: query.sorts,
    limit: query.limit ?? '5000',
    dynamic_fields: query.dynamic_fields,
    query_timezone: query.query_timezone,
    fill_fields: query.fill_fields,
  }
}

async function runClosedWeeks(token: string, query: LookerQuery): Promise<string> {
  try {
    return await runQueryCsv(token, query, CLOSED_WEEKS_FILTER)
  } catch {
    return runSavedLook(token)
  }
}

async function runWtd(token: string, query: LookerQuery): Promise<string> {
  const today = toIsoDate(new Date())
  const sunday = sundayWeekStart()
  return runQueryCsv(token, query, `${sunday} to ${today}`)
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
    }
  })
}

export function payloadFromFacts(
  slice: Slice,
  facts: LookerFact[],
  wtdFacts: LookerFact[],
  source: string,
): PacerPayload {
  const weekly = facts.map((f) => factToWeekly(f, slice)).filter((row) => row != null)
  const names = new Set(weekly.map((w) => w.rep))
  const weeks = [...new Set(facts.map((f) => f.week))].sort((a, b) => (a < b ? 1 : -1))
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
  return {
    source,
    slice,
    sliceLabel: SLICE_LOOKER_FILTERS[slice].label,
    targetPgc: seed.targetPgc,
    improvePts: seed.improvePts,
    degradePts: seed.degradePts,
    weeks,
    roster: rosterFromFacts(facts).filter((r) => names.has(r.name)),
    weekly,
    wtd,
    wtdWeek,
    wtdAsOf: toIsoDate(new Date()),
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
  const [closedCsv, wtdCsv] = await Promise.all([
    runClosedWeeks(token, query),
    runWtd(token, query).catch(() => ''),
  ])
  const facts = parseLookerPlaybook(closedCsv)
  const wtdFacts = wtdCsv ? parseLookerPlaybook(wtdCsv) : []
  const payload = payloadFromFacts(slice, facts, wtdFacts, `Looker look ${lookId()}`)
  if (payload.weekly.length === 0) {
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
