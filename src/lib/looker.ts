import { HIGH_SCHOOL_WORK_GROUP, isHighSchoolName, overlayHighSchoolRoster } from '../data/highSchoolWorkGroup'
import { getSiteAccessToken } from './auth'
import { daysSundayThroughToday, lastCompleteWeekStart, sundayWeekStart, toIsoDate, yesterday } from './calendar'
import { factHasSlice, factToWeekly } from './lookerExport'
import { emptyPayload, SLICE_LOOKER_FILTERS } from './lookerShared'
import { emptyIntraday } from './intraday'
import { serializeAllowlist, snapshotAllowlistAsOf, snapshotOverflowAllowlist } from './overflowAllowlist'
import { factsToRouting } from './routing'
import { clampRange } from './routingRange'
import type { IntradayPayload, PacerPayload, RoutingRangePayload, Slice, Staffing } from './types'
import type { UploadedOverflowChips } from './overflowCsv'

export { emptyPayload, SLICE_LOOKER_FILTERS }

export type OverflowChipsPayload = UploadedOverflowChips & {
  source: 'upload' | 'live' | 'snapshot'
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = await getSiteAccessToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export async function fetchOverflowChips(): Promise<OverflowChipsPayload | null> {
  try {
    const res = await fetch('/.netlify/functions/looker?view=overflow-chips', { headers: await authHeaders() })
    if (!res.ok) return null
    return (await res.json()) as OverflowChipsPayload
  } catch {
    return null
  }
}

export async function saveOverflowChips(chips: UploadedOverflowChips): Promise<OverflowChipsPayload> {
  const res = await fetch('/.netlify/functions/looker?view=overflow-chips', {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(chips),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string } & Partial<OverflowChipsPayload>
  if (!res.ok) throw new Error(body.error ?? 'Could not save Overflow Configs chips.')
  return body as OverflowChipsPayload
}

export async function clearOverflowChips(): Promise<void> {
  const res = await fetch('/.netlify/functions/looker?view=overflow-chips', {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not clear Overflow Configs chips.')
  }
}

export async function fetchPacerData(slice: Slice, staffing: Staffing = 'primary'): Promise<PacerPayload> {
  try {
    const qs = new URLSearchParams({ slice, staffing })
    const headers: HeadersInit = {}
    const token = await getSiteAccessToken()
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(`/.netlify/functions/looker?${qs}`, { headers })
    if (res.status === 401 || res.status === 403) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return emptyPayload(slice, body.error ?? 'Sign in with Google to load playbook data.')
    }
    if (res.ok) {
      const data = (await res.json()) as PacerPayload
      if (data.weekly?.length || data.daily?.length || data.empty) return data
    }
  } catch {
    // Local Vite uses the seed if the Looker proxy is not running.
  }

  if (import.meta.env.PROD) {
    return emptyPayload(slice, 'Looker did not return this slice. Refresh after sign-in, or check Netlify env vars.')
  }

  if (staffing === 'cross-train') {
    return emptyPayload(
      slice,
      'Cross Train / overflow is not in this Looker look. It needs a staffing or overflow flag on the same grain.',
    )
  }

  const { seed } = await import('../data/seed')
  const facts = seed.facts.filter((f) => isHighSchoolName(f.name))
  const weekly = facts.map((f) => factToWeekly(f, slice)).filter((row) => row != null)
  const weeks = [...new Set(facts.map((f) => f.week))].sort((a, b) => (a < b ? 1 : -1))
  if (weekly.length === 0) {
    return emptyPayload(slice, `No rows for ${SLICE_LOOKER_FILTERS[slice].label} in the Looker extract.`)
  }
  return {
    source: seed.source,
    slice,
    sliceLabel: SLICE_LOOKER_FILTERS[slice].label,
    targetPgc: seed.targetPgc,
    improvePts: seed.improvePts,
    degradePts: seed.degradePts,
    weeks,
    roster: overlayHighSchoolRoster(seed.roster.map((r) => ({ ...r, workGroup: HIGH_SCHOOL_WORK_GROUP }))),
    weekly,
    wtd: [],
    daily: [],
    dailyDays: daysSundayThroughToday(),
    wtdWeek: sundayWeekStart(),
    wtdAsOf: toIsoDate(new Date()),
    yesterdayDate: yesterday(),
    yesterdayFacts: [],
    lastWeekStart: weeks[0] ?? lastCompleteWeekStart(),
    lastWeekFacts: [],
    focusLog: seed.focusLog,
  }
}

export async function fetchRoutingData(start: string, end: string): Promise<RoutingRangePayload> {
  const range = clampRange(start, end)
  try {
    const qs = new URLSearchParams({ from: range.start, to: range.end })
    const headers: HeadersInit = {}
    const token = await getSiteAccessToken()
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(`/.netlify/functions/looker?${qs}`, { headers })
    if (res.status === 401 || res.status === 403) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return { ...range, facts: [], empty: true, emptyReason: body.error ?? 'Sign in with Google to load routing data.' }
    }
    if (res.ok) {
      const data = (await res.json()) as RoutingRangePayload
      if (Array.isArray(data.facts) && (!data.empty || import.meta.env.PROD)) {
        return {
          start: data.start ?? range.start,
          end: data.end ?? range.end,
          facts: data.facts,
          empty: data.empty,
          emptyReason: data.emptyReason,
          allowlist: data.allowlist,
          allowlistAsOf: data.allowlistAsOf,
          allowlistSource: data.allowlistSource,
        }
      }
    }
  } catch {
    // Local Vite uses the seed if the Looker proxy is not running.
  }

  if (import.meta.env.PROD) {
    return {
      ...range,
      facts: [],
      empty: true,
      emptyReason: 'Looker did not return this range. Refresh after sign-in, or check Netlify env vars.',
    }
  }

  const { seed } = await import('../data/seed')
  const inRange = seed.facts.filter((f) => f.week >= range.start && f.week <= range.end)
  const facts = inRange.length ? inRange : seed.facts
  const allowlist = snapshotOverflowAllowlist()
  return {
    ...range,
    facts: factsToRouting(facts, allowlist),
    allowlist: serializeAllowlist(allowlist),
    allowlistAsOf: snapshotAllowlistAsOf(),
    allowlistSource: 'snapshot',
  }
}

export async function fetchIntradayData(): Promise<IntradayPayload> {
  try {
    const headers: HeadersInit = {}
    const token = await getSiteAccessToken()
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(`/.netlify/functions/looker?view=intraday`, { headers })
    if (res.status === 401 || res.status === 403) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return emptyIntraday(body.error ?? 'Sign in with Google to load playbook data.')
    }
    if (res.ok) {
      const data = (await res.json()) as IntradayPayload
      if (Array.isArray(data.rows)) return data
    }
  } catch {
    // Local Vite uses the Looker proxy; if it is down there is no seed for this look.
  }

  if (import.meta.env.PROD) {
    return emptyIntraday('Looker did not return today. Refresh after sign-in, or check Netlify env vars.')
  }
  return emptyIntraday('Looker did not return today. Start Vite with Looker credentials to load Intraday.')
}

export { factHasSlice }
