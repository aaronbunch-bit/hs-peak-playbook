import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { UploadedOverflowChips } from './overflowCsv'

const BLOB_STORE = 'peak-playbook'
const BLOB_KEY = 'overflow-chips'
const MAX_NAMES = 400

function env(name: string): string {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } }
  return (g.process?.env?.[name] ?? '').trim()
}

function onNetlifyProduction(): boolean {
  return env('NETLIFY') === 'true' && env('NETLIFY_DEV') !== 'true'
}

function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function localPath(): string {
  const g = globalThis as { process?: { cwd?: () => string } }
  const cwd = g.process?.cwd?.() ?? '.'
  return join(cwd, '.data', 'overflow-chips.json')
}

function cleanNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const names = new Set<string>()
  for (const value of raw) {
    const name = String(value ?? '').trim()
    if (name) names.add(name)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

export function normalizeOverflowChips(raw: unknown): UploadedOverflowChips {
  const row = (raw ?? {}) as Partial<UploadedOverflowChips>
  const hs = cleanNames(row.hs)
  const k12 = cleanNames(row.k12)
  if (hs.length === 0 && k12.length === 0) {
    throw new Error('No HS-STEM or K12 Test Prep chips to save.')
  }
  if (hs.length > MAX_NAMES || k12.length > MAX_NAMES) {
    throw new Error('That list is larger than Peak expects. Check the CSV.')
  }
  const asOf = typeof row.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.asOf) ? row.asOf : todayIso()
  return { asOf, hs, k12 }
}

function asChips(raw: unknown): UploadedOverflowChips | null {
  try {
    const chips = normalizeOverflowChips(raw)
    return chips
  } catch {
    return null
  }
}

async function readBlob(): Promise<UploadedOverflowChips | null> {
  try {
    const { getStore } = await import('@netlify/blobs')
    const store = getStore(BLOB_STORE)
    const data = await store.get(BLOB_KEY, { type: 'json' })
    return asChips(data)
  } catch {
    return null
  }
}

async function writeBlob(chips: UploadedOverflowChips): Promise<boolean> {
  try {
    const { getStore } = await import('@netlify/blobs')
    const store = getStore(BLOB_STORE)
    await store.setJSON(BLOB_KEY, chips)
    return true
  } catch {
    return false
  }
}

async function deleteBlob(): Promise<void> {
  try {
    const { getStore } = await import('@netlify/blobs')
    const store = getStore(BLOB_STORE)
    await store.delete(BLOB_KEY)
  } catch {
    // Local Vite has no blob store.
  }
}

async function readLocalFile(): Promise<UploadedOverflowChips | null> {
  try {
    const text = await readFile(localPath(), 'utf8')
    return asChips(JSON.parse(text))
  } catch {
    return null
  }
}

async function writeLocalFile(chips: UploadedOverflowChips): Promise<void> {
  const path = localPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(chips, null, 2))
}

async function deleteLocalFile(): Promise<void> {
  try {
    await unlink(localPath())
  } catch {
    // Missing file is fine.
  }
}

/** Shared Overflow Configs chips (all Peak users). */
export async function readSharedOverflowChips(): Promise<UploadedOverflowChips | null> {
  return (await readBlob()) ?? (await readLocalFile())
}

export async function writeSharedOverflowChips(raw: unknown): Promise<UploadedOverflowChips> {
  const chips = normalizeOverflowChips(raw)
  const blobOk = await writeBlob(chips)
  if (blobOk) return chips
  if (onNetlifyProduction()) {
    throw new Error('Could not save the shared list. Netlify Blobs is not available on this site.')
  }
  await writeLocalFile(chips)
  return chips
}

export async function clearSharedOverflowChips(): Promise<void> {
  await deleteBlob()
  await deleteLocalFile()
}
