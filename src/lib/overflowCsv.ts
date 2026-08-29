import { parseCsv } from './lookerExport'

export type UploadedOverflowChips = {
  asOf: string
  hs: string[]
  k12: string[]
}

function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function isHsAudience(raw: string): boolean {
  const t = norm(raw)
  return t === 'hs stem' || t === 'hsstem' || t === 'hs'
}

function isK12Audience(raw: string): boolean {
  const t = norm(raw)
  return t === 'k12 test prep' || t === 'k12tp' || t === 'k12'
}

function truthyChip(raw: string): boolean {
  const t = norm(raw)
  if (!t) return false
  if (['1', 'y', 'yes', 'true', 'x', 'hs stem', 'k12 test prep', 'k12tp'].includes(t)) return true
  return isHsAudience(raw) || isK12Audience(raw)
}

function splitAudiences(raw: string): string[] {
  return raw.split(/[|;,]/).map((p) => p.trim()).filter(Boolean)
}

/**
 * Overflow Configs / Supabase-style CSV. Keeps only HS-STEM and K12 Test Prep chips.
 *
 * Accepts:
 * - long: rep_name, audience_subject
 * - wide: name + HS-STEM / K12 Test Prep columns
 * - name + a cell of comma-separated audiences
 */
export function parseOverflowConfigsCsv(text: string): UploadedOverflowChips {
  const rows = parseCsv(text)
  if (rows.length === 0) throw new Error('That CSV is empty.')

  const header = rows[0].map(norm)
  const looksLikeHeader = header.some(
    (h) =>
      /rep|name|consultant|audience|subject|hs stem|k12/.test(h) ||
      isHsAudience(h) ||
      isK12Audience(h),
  )
  const body = looksLikeHeader ? rows.slice(1) : rows
  const cols = looksLikeHeader ? header : []

  const nameIdx = cols.findIndex((h) => /^(rep name|repname|name|consultant|rep)$/.test(h) || h.endsWith(' rep name'))
  const audIdx = cols.findIndex((h) => /audience/.test(h) || h === 'subject' || h === 'chip' || h === 'chips')
  const hsCol = cols.findIndex((h) => isHsAudience(h))
  const k12Col = cols.findIndex((h) => isK12Audience(h))

  const hs = new Set<string>()
  const k12 = new Set<string>()

  const addAudiences = (name: string, pieces: string[]) => {
    for (const piece of pieces) {
      if (isHsAudience(piece)) hs.add(name)
      else if (isK12Audience(piece)) k12.add(name)
    }
  }

  for (const row of body) {
    const name = (nameIdx >= 0 ? row[nameIdx] : row[0] ?? '').trim()
    if (!name || /^rep/i.test(name)) continue

    if (audIdx >= 0) {
      addAudiences(name, splitAudiences(row[audIdx] ?? ''))
      continue
    }
    if (hsCol >= 0 || k12Col >= 0) {
      if (hsCol >= 0 && truthyChip(row[hsCol] ?? '')) hs.add(name)
      if (k12Col >= 0 && truthyChip(row[k12Col] ?? '')) k12.add(name)
      continue
    }
    addAudiences(name, row.slice(1).flatMap(splitAudiences))
  }

  if (hs.size === 0 && k12.size === 0) {
    throw new Error('No HS-STEM or K12 Test Prep chips found in that CSV.')
  }
  return {
    asOf: todayIso(),
    hs: [...hs].sort((a, b) => a.localeCompare(b)),
    k12: [...k12].sort((a, b) => a.localeCompare(b)),
  }
}
