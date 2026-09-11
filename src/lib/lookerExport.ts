import type { LookerFact, Slice, WeeklyRow } from './types'

/**
 * Connected Looker look: HS Peak Playbook.
 *
 * Grain: Call Created At Week (Sunday) × Consultant.
 * Pivot: Audience = HS-STEM | K12 Test Prep.
 *
 * CSV has two header rows:
 *   1. Audience groups (HS-STEM ×3, K12 Test Prep ×3)
 *   2. Field names (Week, Super Group, Consultant, Manager,
 *      CC90 / Closed Client Count / pGC / CC90 Mix for each audience, Total pGC)
 *
 * Total pGC is the volume-weighted blend of HS-STEM and K12 Test Prep
 * for that person-week. That is Supergroup pGC — there is no separate
 * Overall.
 *
 * WTD rollup uses the same look with Call Created At Date = this Sunday → now.
 * WTD DoD swaps the week dimension for Call Created At Date (one row per day)
 * and filters Consultant / Rep Name to the High School Peak list.
 */

export const LOOKER_PLAYBOOK_FIELDS = [
  'Call Created At Week',
  'Work Super Group',
  'Consultant',
  'Rep Manager',
  'HS-STEM CC90 Count',
  'HS-STEM pGC',
  'HS-STEM CC90 Mix',
  'K12 Test Prep CC90 Count',
  'K12 Test Prep pGC',
  'K12 Test Prep CC90 Mix',
  'Total pGC',
] as const

const MANAGER_ALIASES: Record<string, string> = {
  'angie damon': 'Angela Damon',
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

export function parsePgc(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  if (t.endsWith('%')) {
    const n = Number(t.slice(0, -1).replace(/,/g, ''))
    return Number.isFinite(n) ? round4(n / 100) : null
  }
  const n = Number(t.replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  if (n > 1) return round4(n / 100)
  return n
}

function parseCount(raw: string): number {
  const t = raw.replace(/,/g, '').trim()
  if (!t) return 0
  const n = Number(t)
  return Number.isFinite(n) ? n : 0
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^\ufeff/, '')

  const pushCell = () => {
    row.push(cell)
    cell = ''
  }
  const pushRow = () => {
    if (row.some((c) => c.trim())) rows.push(row)
    row = []
  }

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"') {
      quoted = true
      continue
    }
    if (ch === ',') {
      pushCell()
      continue
    }
    if (ch === '\n') {
      pushCell()
      pushRow()
      continue
    }
    if (ch === '\r') continue
    cell += ch
  }
  pushCell()
  pushRow()
  return rows
}

export function canonicalManager(name: string | null): string | null {
  if (!name) return null
  return MANAGER_ALIASES[name.trim().toLowerCase()] ?? name.trim()
}

function isPlaybookHeader(rows: string[][]): boolean {
  const joined = rows.slice(0, 2).flat().join(' ').toLowerCase()
  return joined.includes('hs-stem') && joined.includes('total pgc')
}

type Cols = {
  week: number
  superGroup: number
  name: number
  manager: number
  hsCc90: number
  hsImpact: number
  hsPgc: number
  hsMix: number
  k12Cc90: number
  k12Impact: number
  k12Pgc: number
  k12Mix: number
  totalPgc: number
}

const VIS_COLS: Cols = {
  week: 0,
  superGroup: 1,
  name: 2,
  manager: 3,
  hsCc90: 4,
  hsImpact: -1,
  hsPgc: 5,
  hsMix: 6,
  k12Cc90: 7,
  k12Impact: -1,
  k12Pgc: 8,
  k12Mix: 9,
  totalPgc: 10,
}

/** Raw query CSV includes Closed Client Count (sold) between CC90 and pGC for each audience. */
const RAW_COLS: Cols = {
  week: 0,
  superGroup: 1,
  name: 2,
  manager: 3,
  hsCc90: 4,
  hsImpact: 5,
  hsPgc: 6,
  hsMix: 7,
  k12Cc90: 8,
  k12Impact: 9,
  k12Pgc: 10,
  k12Mix: 11,
  totalPgc: 12,
}

function layoutFromHeader(rows: string[][]): Cols {
  const joined = rows.slice(0, 2).flat().join(' ').toLowerCase()
  if (joined.includes('closed client')) return RAW_COLS
  return VIS_COLS
}

function isHeaderRow(row: string[] | undefined): boolean {
  if (!row?.length) return false
  if (row.some((cell) => /^\d{4}-\d{2}-\d{2}/.test(cell.trim()))) return false
  return row.some((cell) => /pgc|cc90|consultant|rep|week|date|audience|super\s?group|closed client/i.test(cell))
}

export function headerRowCount(rows: string[][]): number {
  if (!isHeaderRow(rows[0])) return 0
  return isHeaderRow(rows[1]) ? 2 : 1
}

/**
 * Column label per index: the audience group from the pivot row is carried forward and
 * joined to the field name, so `HS-STEM` + `CC90 Count` reads as `hs-stem cc90 count`.
 */
function headerLabels(rows: string[][], headerRows: number): string[] {
  const top = headerRows > 1 ? (rows[0] ?? []) : []
  const fields = rows[headerRows - 1] ?? []
  const width = Math.max(top.length, fields.length)
  const labels: string[] = []
  let group = ''
  for (let i = 0; i < width; i++) {
    const heading = (top[i] ?? '').trim()
    if (heading) group = heading
    const field = (fields[i] ?? '').trim()
    labels.push(`${group} ${field}`.trim().toLowerCase().replace(/\s+/g, ' '))
  }
  return labels
}

function findCol(labels: string[], test: (label: string) => boolean): number {
  return labels.findIndex((label) => Boolean(label) && test(label))
}

function audienceCols(labels: string[], audience: RegExp) {
  const of = (test: (label: string) => boolean) => findCol(labels, (l) => audience.test(l) && test(l))
  return {
    cc90: of((l) => l.includes('cc90') && !l.includes('mix')),
    pgc: of((l) => l.includes('pgc')),
    mix: of((l) => l.includes('cc90 mix') || l.includes('mix')),
    impact: of((l) => l.includes('closed client')),
  }
}

/**
 * Resolve columns by header text. Looker column order shifts whenever a field is added or
 * renamed upstream, and the fixed layouts below silently parse to zero rows when it does.
 */
function layoutFromLabels(labels: string[]): Cols | null {
  const hs = audienceCols(labels, /hs-?\s?stem/)
  const k12 = audienceCols(labels, /k12|k-12/)
  const week = findCol(labels, (l) => /(^| )(week|date)$/.test(l) || l.includes('created at'))
  const name = findCol(
    labels,
    (l) => !l.includes('manager') && /^(consultant|rep name|sales rep|name)$/.test(l),
  )
  const layout: Cols = {
    week,
    superGroup: findCol(labels, (l) => l.includes('super group') || l.includes('supergroup')),
    name,
    manager: findCol(labels, (l) => l.includes('manager') && !l.includes('id')),
    hsCc90: hs.cc90,
    hsImpact: hs.impact,
    hsPgc: hs.pgc,
    hsMix: hs.mix,
    k12Cc90: k12.cc90,
    k12Impact: k12.impact,
    k12Pgc: k12.pgc,
    k12Mix: k12.mix,
    totalPgc: findCol(labels, (l) => l.includes('total pgc')),
  }
  const hasAudience = [hs.cc90, hs.pgc, k12.cc90, k12.pgc].some((col) => col >= 0)
  if (week < 0 || name < 0 || !hasAudience) return null
  return layout
}

function impactCount(raw: string | undefined, pgc: number | null, cc90: number, col: number): number {
  if (col >= 0) return parseCount(raw ?? '')
  if (pgc == null || cc90 <= 0) return 0
  return Math.round(pgc * cc90)
}

function rowToFact(cols: string[], layout: Cols): LookerFact | null {
  const week = (cols[layout.week] ?? '').trim().slice(0, 10)
  const name = (cols[layout.name] ?? '').trim()
  if (!week || !name || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return null
  const hsPgc = parsePgc(cols[layout.hsPgc] ?? '')
  const k12Pgc = parsePgc(cols[layout.k12Pgc] ?? '')
  const hsCc90 = parseCount(cols[layout.hsCc90] ?? '')
  const k12Cc90 = parseCount(cols[layout.k12Cc90] ?? '')
  return {
    week,
    superGroup: (cols[layout.superGroup] ?? '').trim() || null,
    name,
    manager: canonicalManager((cols[layout.manager] ?? '').trim() || null),
    hsCc90,
    hsPgc,
    hsMix: parsePgc(cols[layout.hsMix] ?? ''),
    hsImpact: impactCount(cols[layout.hsImpact], hsPgc, hsCc90, layout.hsImpact),
    k12Cc90,
    k12Pgc,
    k12Mix: parsePgc(cols[layout.k12Mix] ?? ''),
    k12Impact: impactCount(cols[layout.k12Impact], k12Pgc, k12Cc90, layout.k12Impact),
    totalPgc: parsePgc(cols[layout.totalPgc] ?? ''),
  }
}

function nameCol(rows: string[][], fallback: number): number {
  for (const header of rows.slice(0, 2)) {
    const i = header.findIndex((h) => /^(consultant|rep name)$/i.test(h.trim()))
    if (i >= 0) return i
  }
  return fallback
}

export function parseLookerPlaybook(input: string | string[][]): LookerFact[] {
  const rows = typeof input === 'string' ? parseCsv(input) : input
  const headers = headerRowCount(rows)
  const byLabel = headers > 0 ? layoutFromLabels(headerLabels(rows, headers)) : null
  const start = byLabel ? headers : isPlaybookHeader(rows) ? 2 : 0
  let layout = byLabel
  if (!layout) {
    layout = { ...layoutFromHeader(rows) }
    layout.name = nameCol(rows, layout.name)
  }
  const out: LookerFact[] = []
  for (const cols of rows.slice(start)) {
    const fact = rowToFact(cols, layout)
    if (fact) out.push(fact)
  }
  return out
}

export function impliedImpact(pgc: number | null | undefined, cc90: number | null | undefined, impact?: number | null): number {
  if (impact != null) return impact
  if (pgc == null || cc90 == null || cc90 <= 0) return 0
  return Math.round(pgc * cc90)
}

export function projectFact(
  fact: LookerFact,
  slice: Slice,
): { pgc: number | null; cc90: number; mix: number | null; impact: number } {
  const hsImpact = impliedImpact(fact.hsPgc, fact.hsCc90, fact.hsImpact)
  const k12Impact = impliedImpact(fact.k12Pgc, fact.k12Cc90, fact.k12Impact)
  if (slice === 'hs-stem') return { pgc: fact.hsPgc, cc90: fact.hsCc90, mix: fact.hsMix, impact: hsImpact }
  if (slice === 'k12tp') return { pgc: fact.k12Pgc, cc90: fact.k12Cc90, mix: fact.k12Mix, impact: k12Impact }
  return { pgc: fact.totalPgc, cc90: fact.hsCc90 + fact.k12Cc90, mix: fact.hsMix, impact: hsImpact + k12Impact }
}

export function factHasSlice(fact: LookerFact, slice: Slice): boolean {
  const { pgc, cc90 } = projectFact(fact, slice)
  return pgc != null || cc90 > 0
}

export function factToWeekly(fact: LookerFact, slice: Slice): WeeklyRow | null {
  const { pgc, cc90, mix, impact } = projectFact(fact, slice)
  if (pgc == null && cc90 <= 0) return null
  if (pgc == null) return null
  return {
    week: fact.week,
    rep: fact.name,
    pgc,
    cc90,
    impact,
    mix,
    hsCc90: fact.hsCc90,
    hsPgc: fact.hsPgc,
    hsMix: fact.hsMix,
    k12Cc90: fact.k12Cc90,
    k12Pgc: fact.k12Pgc,
    k12Mix: fact.k12Mix,
    totalPgc: fact.totalPgc,
  }
}
