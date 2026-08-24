import { getSiteAccessToken } from './auth'
import { sundayWeekStart, toIsoDate } from './calendar'
import { factHasSlice, factToWeekly } from './lookerExport'
import { emptyPayload, SLICE_LOOKER_FILTERS } from './lookerShared'
import type { PacerPayload, Slice, Staffing } from './types'

export { emptyPayload, SLICE_LOOKER_FILTERS }

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
      if (data.weekly?.length || data.empty) return data
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
  const weekly = seed.facts.map((f) => factToWeekly(f, slice)).filter((row) => row != null)
  const names = new Set(weekly.map((w) => w.rep))
  const weeks = [...new Set(seed.facts.map((f) => f.week))].sort((a, b) => (a < b ? 1 : -1))
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
    roster: seed.roster.filter((r) => names.has(r.name)),
    weekly,
    wtd: [],
    wtdWeek: sundayWeekStart(),
    wtdAsOf: toIsoDate(new Date()),
    focusLog: seed.focusLog,
  }
}

export { factHasSlice }
