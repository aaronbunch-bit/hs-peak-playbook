import type { RosterEntry } from '../lib/types'

/** High School work group. Names and Peak managers only — no emails or IDs. */
export const HIGH_SCHOOL_WORK_GROUP = 'High School'

export const HIGH_SCHOOL_ROSTER: Array<{ name: string; manager: string }> = [
  { name: 'Amanda Schaefer', manager: 'Aaron Bunch' },
  { name: 'Amy Barnett', manager: 'Jamie Forrest' },
  { name: 'Amy Mireles', manager: 'Emily Lopez' },
  { name: 'Angela Mattina', manager: 'Emily Lopez' },
  { name: 'Ayesha Motan', manager: 'Emily Lopez' },
  { name: 'Becky Ruffer', manager: 'Aaron Bunch' },
  { name: 'Bianca Thompson', manager: 'Jamie Forrest' },
  { name: 'Brandon Pascucci', manager: 'Emily Lopez' },
  { name: 'Brandy Kezar', manager: 'Angela Damon' },
  { name: 'Brenda Wong', manager: 'Aaron Bunch' },
  { name: 'Brittney Abrams', manager: 'Emily Lopez' },
  { name: 'Caniyah Lowe', manager: 'Jamie Forrest' },
  { name: 'Carla Hutcherson', manager: 'Angela Damon' },
  { name: 'Charlotte Shea', manager: 'Emily Lopez' },
  { name: 'Chris Jones', manager: 'Aaron Bunch' },
  { name: 'David Valverde', manager: 'Aaron Bunch' },
  { name: 'Del Ali', manager: 'Aaron Bunch' },
  { name: 'Eliza Olson', manager: 'Angela Damon' },
  { name: 'Hector Juarez', manager: 'Emily Lopez' },
  { name: 'Jenna Salupo', manager: 'Aaron Bunch' },
  { name: 'Jensen Ricke', manager: 'Angela Damon' },
  { name: 'Jordan Sturdivant', manager: 'Aaron Bunch' },
  { name: 'Jym Nixon', manager: 'Jamie Forrest' },
  { name: 'Kay Onyekwere', manager: 'Angela Damon' },
  { name: 'Kimberly Wismar', manager: 'Angela Damon' },
  { name: 'Kodi Haynes', manager: 'Jamie Forrest' },
  { name: 'Kristine Treijs', manager: 'Angela Damon' },
  { name: 'Lexann Romonosky', manager: 'Emily Lopez' },
  { name: 'Liz Weiss', manager: 'Aaron Bunch' },
  { name: 'Mark Crane', manager: 'Emily Lopez' },
  { name: 'Michele Long', manager: 'Aaron Bunch' },
  { name: 'Molly Russell', manager: 'Emily Lopez' },
  { name: 'Natalie Cardenas', manager: 'Emily Lopez' },
  { name: 'Nicki Sorrentino', manager: 'Aaron Bunch' },
  { name: 'Raven Tolbert', manager: 'Jamie Forrest' },
  { name: 'Rebecca Kennard', manager: 'Emily Lopez' },
  { name: 'Ryan Cuellar', manager: 'Angela Damon' },
  { name: 'Sandra McIntyre', manager: 'Angela Damon' },
  { name: 'Shana McNeil', manager: 'Emily Lopez' },
  { name: 'Sharon Razzore', manager: 'Jamie Forrest' },
  { name: 'Stephanie Kegley', manager: 'Jamie Forrest' },
  { name: 'Timothy Carr', manager: 'Aaron Bunch' },
  { name: 'Timothy Girdlestone', manager: 'Jamie Forrest' },
  { name: 'Tyrae Jones', manager: 'Jamie Forrest' },
  { name: 'Victoria Milani', manager: 'Jamie Forrest' },
  { name: 'Virginia Bailey-Barnes', manager: 'Angela Damon' },
  { name: 'Walter Adams', manager: 'Jamie Forrest' },
]

export const HIGH_SCHOOL_NAMES = HIGH_SCHOOL_ROSTER.map((r) => r.name)

/** Looker Consultant spellings that differ from HR `mgr_name`. */
export const LOOKER_REP_NAME_ALIASES = ['Delair Ali', 'Domenica Sorrentino', 'Elizabeth Weiss'] as const

const LOOKER_ALIASES: Record<string, string> = {
  'delair ali': 'Del Ali',
  'domenica sorrentino': 'Nicki Sorrentino',
  'elizabeth weiss': 'Liz Weiss',
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
