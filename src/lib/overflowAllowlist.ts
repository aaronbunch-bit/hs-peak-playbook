import { OVERFLOW_CONFIGS_ALLOWLIST } from '../data/overflowConfigsAllowlist'
import { canonicalHighSchoolName } from '../data/highSchoolWorkGroup'

/** Overflow Configs chips for High School dedicated cross-train. */
export type OverflowAllowlist = {
  /** Lowercased canonical names with an HS-STEM chip. */
  hs: Set<string>
  /** Lowercased canonical names with a K12 Test Prep chip. */
  k12: Set<string>
}

export type DedicatedChips = {
  dedicatedHs: boolean
  dedicatedK12: boolean
}

const EMPTY: OverflowAllowlist = { hs: new Set(), k12: new Set() }

function env(name: string): string {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } }
  return (g.process?.env?.[name] ?? '').trim()
}

function nameKey(name: string): string {
  const canonical = canonicalHighSchoolName(name) ?? name.trim()
  return canonical.toLowerCase()
}

export function emptyOverflowAllowlist(): OverflowAllowlist {
  return { hs: new Set(), k12: new Set() }
}

/** High School chips from Overflow Configs (bundled; used when live read is empty). */
export function snapshotOverflowAllowlist(): OverflowAllowlist {
  return deserializeAllowlist(OVERFLOW_CONFIGS_ALLOWLIST)
}

export function chipsForName(allowlist: OverflowAllowlist, name: string): DedicatedChips {
  const key = nameKey(name)
  return {
    dedicatedHs: allowlist.hs.has(key),
    dedicatedK12: allowlist.k12.has(key),
  }
}

export function supabaseConfigured(): boolean {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL')
  const key = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY')
  return Boolean(url && key)
}

/**
 * Dedicated CT chips: Overflow Configs High School list.
 * Tries a live table read when env is set; otherwise uses the Overflow Configs snapshot.
 */
export async function fetchOverflowAllowlist(): Promise<OverflowAllowlist> {
  const live = await fetchLiveAllowlist().catch(() => null)
  if (live && (live.hs.size > 0 || live.k12.size > 0)) return live
  return snapshotOverflowAllowlist()
}

async function fetchLiveAllowlist(): Promise<OverflowAllowlist | null> {
  const url = (env('SUPABASE_URL') || env('VITE_SUPABASE_URL')).replace(/\/$/, '')
  const key = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY')
  if (!url || !key) return null

  const endpoint =
    `${url}/rest/v1/overflow_allowlist` +
    `?select=rep_name,audience_subject` +
    `&audience_subject=in.(HS-STEM,K12%20Test%20Prep)` +
    `&order=rep_name.asc`

  const res = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    throw new Error(`overflow_allowlist failed (${res.status})`)
  }
  const rows = (await res.json()) as Array<{ rep_name?: string; audience_subject?: string }>
  const hs = new Set<string>()
  const k12 = new Set<string>()
  for (const row of rows) {
    const name = (row.rep_name ?? '').trim()
    if (!name) continue
    const keyName = nameKey(name)
    const audience = (row.audience_subject ?? '').trim()
    if (audience === 'HS-STEM') hs.add(keyName)
    else if (audience === 'K12 Test Prep') k12.add(keyName)
  }
  return { hs, k12 }
}

/** JSON-safe shape for API payloads (Sets do not serialize). */
export function serializeAllowlist(allowlist: OverflowAllowlist): { hs: string[]; k12: string[] } {
  return {
    hs: [...allowlist.hs].sort(),
    k12: [...allowlist.k12].sort(),
  }
}

export function deserializeAllowlist(raw: { hs?: string[]; k12?: string[] } | null | undefined): OverflowAllowlist {
  if (!raw) return emptyOverflowAllowlist()
  return {
    hs: new Set((raw.hs ?? []).map((n) => nameKey(n))),
    k12: new Set((raw.k12 ?? []).map((n) => nameKey(n))),
  }
}

export { EMPTY as EMPTY_OVERFLOW_ALLOWLIST }
