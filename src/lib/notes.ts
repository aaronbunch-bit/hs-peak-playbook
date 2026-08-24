const KEY = 'hs-peak-playbook:notes-v1'

export type NotesStore = {
  byWeek: Record<string, Record<string, string>>
}

const EMPTY: NotesStore = { byWeek: {} }

export function loadNotes(): NotesStore {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as NotesStore
    return parsed?.byWeek && typeof parsed.byWeek === 'object' ? { byWeek: parsed.byWeek } : EMPTY
  } catch {
    return EMPTY
  }
}

export function saveNotes(store: NotesStore): void {
  localStorage.setItem(KEY, JSON.stringify(store))
}

export function noteFor(store: NotesStore, week: string, name: string): string {
  return store.byWeek[week]?.[name] ?? ''
}

export function setNote(store: NotesStore, week: string, name: string, text: string): NotesStore {
  const trimmed = text.replace(/\s+$/, '')
  const weekNotes = { ...(store.byWeek[week] ?? {}) }
  if (!trimmed.trim()) delete weekNotes[name]
  else weekNotes[name] = text
  const byWeek = { ...store.byWeek, [week]: weekNotes }
  if (Object.keys(weekNotes).length === 0) delete byWeek[week]
  return { byWeek }
}

export function notesForRep(store: NotesStore, name: string): Array<{ week: string; text: string }> {
  const out: Array<{ week: string; text: string }> = []
  for (const [week, byName] of Object.entries(store.byWeek)) {
    const text = byName[name]
    if (text?.trim()) out.push({ week, text })
  }
  return out.sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : 0))
}
