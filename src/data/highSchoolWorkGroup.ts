import type { RosterEntry } from '../lib/types'

/** High School work group. Names and Peak managers only — no emails or IDs. */
export const HIGH_SCHOOL_WORK_GROUP = 'High School'

export const HIGH_SCHOOL_ROSTER: Array<{ name: string; manager: string }> = [
  { name: 'Amanda Schaefer', manager: 'Liz Weiss' },
  { name: 'Amy Mireles', manager: 'Emily Lopez' },
  { name: 'Angela Mattina', manager: 'Emily Lopez' },
  { name: 'Ayesha Motan', manager: 'Emily Lopez' },
  { name: 'Alyssa Schmidt', manager: 'Angela Damon' },
  { name: 'Barrington Williams', manager: 'Liz Weiss' },
  { name: 'Becky Ruffer', manager: 'Liz Weiss' },
  { name: 'Brandon Pascucci', manager: 'Emily Lopez' },
  { name: 'Brandy Kezar', manager: 'Angela Damon' },
  { name: 'Braswell Chappelle', manager: 'Emily Lopez' },
  { name: 'Brenda Wong', manager: 'Emily Lopez' },
  { name: 'Bryan Davis', manager: 'Angela Damon' },
  { name: 'Charlotte Shea', manager: 'Emily Lopez' },
  { name: 'Chris Jones', manager: 'Liz Weiss' },
  { name: 'Deja Fisher', manager: 'Angela Damon' },
  { name: 'Del Ali', manager: 'Liz Weiss' },
  { name: 'Dunte Williams', manager: 'Liz Weiss' },
  { name: 'Eliza Olson', manager: 'Angela Damon' },
  { name: 'Hector Juarez', manager: 'Emily Lopez' },
  { name: 'Jenn Babcock', manager: 'Liz Weiss' },
  { name: 'Jenna Salupo', manager: 'Liz Weiss' },
  { name: 'Jensen Ricke', manager: 'Angela Damon' },
  { name: 'Jordan Sturdivant', manager: 'Liz Weiss' },
  { name: 'Kay Onyekwere', manager: 'Angela Damon' },
  { name: 'Kodi Haynes', manager: 'Angela Damon' },
  { name: 'Kristine Treijs', manager: 'Angela Damon' },
  { name: 'Lamonica Bettes', manager: 'Angela Damon' },
  { name: 'Lexann Romonosky', manager: 'Emily Lopez' },
  { name: 'Mark Crane', manager: 'Emily Lopez' },
  { name: 'Martiez Pinnick', manager: 'Emily Lopez' },
  { name: 'Michele Long', manager: 'Liz Weiss' },
  { name: 'Molly Russell', manager: 'Emily Lopez' },
  { name: 'Morgan Glover', manager: 'Emily Lopez' },
  { name: 'Natalie Cardenas', manager: 'Emily Lopez' },
  { name: 'Nicki Sorrentino', manager: 'Liz Weiss' },
  { name: 'Rebecca Kennard', manager: 'Emily Lopez' },
  { name: 'Rebekah Ash', manager: 'Angela Damon' },
  { name: 'Ryan Cuellar', manager: 'Angela Damon' },
  { name: 'Sandra McIntyre', manager: 'Angela Damon' },
  { name: 'Shana McNeil', manager: 'Emily Lopez' },
  { name: 'Shari Turner', manager: 'Liz Weiss' },
  { name: 'Tanner Smith', manager: 'Emily Lopez' },
  { name: 'Tierra Tate', manager: 'Angela Damon' },
  { name: 'Timothy Carr', manager: 'Liz Weiss' },
  { name: 'Virginia Bailey-Barnes', manager: 'Angela Damon' },
]

export const HIGH_SCHOOL_NAMES = HIGH_SCHOOL_ROSTER.map((r) => r.name)

/** Looker Consultant spellings that differ from HR `mgr_name`. */
export const LOOKER_REP_NAME_ALIASES = [
  'Delair Ali',
  'Domenica Sorrentino',
  'Jennifer Babcock',
  'Braswell Chapelle',
] as const

const LOOKER_ALIASES: Record<string, string> = {
  'delair ali': 'Del Ali',
  'domenica sorrentino': 'Nicki Sorrentino',
  // Looker carries her legal first name; scripts/ingest-looker-playbook.py maps it the same way.
  'jennifer babcock': 'Jenn Babcock',
  // Single-p spelling shows up in roster hand-offs; keep both resolving to one rep.
  'braswell chapelle': 'Braswell Chappelle',
}

const NAME_SET = new Set(HIGH_SCHOOL_NAMES.map((n) => n.toLowerCase()))

export function canonicalHighSchoolName(name: string): string | null {
  const key = name.trim().toLowerCase()
  if (LOOKER_ALIASES[key]) return LOOKER_ALIASES[key]
  if (NAME_SET.has(key)) {
    return HIGH_SCHOOL_NAMES.find((n) => n.toLowerCase() === key) ?? name.trim()
  }
  return null
}

export function isHighSchoolName(name: string): boolean {
  return canonicalHighSchoolName(name) != null
}

/** Looker Rep Name filter: HR names plus known Consultant spellings. Work Group / manager can lag. */
export function lookerRepNameFilter(): string {
  return [...HIGH_SCHOOL_NAMES, ...LOOKER_REP_NAME_ALIASES].map((name) => `"${name}"`).join(',')
}

/** Keep every High School Peak rep on the roster, even with no Looker volume yet. */
export function overlayHighSchoolRoster(roster: RosterEntry[]): RosterEntry[] {
  const byName = new Map(roster.map((r) => [r.name.toLowerCase(), r]))
  return HIGH_SCHOOL_ROSTER.map(({ name, manager }) => {
    const prior = byName.get(name.toLowerCase())
    return {
      name,
      level: prior?.level ?? null,
      manager,
      workGroup: HIGH_SCHOOL_WORK_GROUP,
      staffing: prior?.staffing,
      lookerRepId: prior?.lookerRepId,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}
