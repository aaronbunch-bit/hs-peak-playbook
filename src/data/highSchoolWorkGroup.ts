/** Active High School work-group names (HR `work_group`). Names only — no emails or IDs. */
export const HIGH_SCHOOL_WORK_GROUP = 'High School'

export const HIGH_SCHOOL_NAMES = [
  'Amanda Schaefer',
  'Amy Barnett',
  'Amy Mireles',
  'Angela Mattina',
  'Ayesha Motan',
  'Becky Ruffer',
  'Bianca Thompson',
  'Brandon Pascucci',
  'Brandy Kezar',
  'Brenda Wong',
  'Brittney Abrams',
  'Caniyah Lowe',
  'Carla Hutcherson',
  'Charlotte Shea',
  'Chris Jones',
  'David Valverde',
  'Del Ali',
  'Eliza Olson',
  'Hector Juarez',
  'Jenna Salupo',
  'Jensen Ricke',
  'Jordan Sturdivant',
  'Jym Nixon',
  'Kay Onyekwere',
  'Kimberly Wismar',
  'Kodi Haynes',
  'Kristine Treijs',
  'Lexann Romonosky',
  'Liz Weiss',
  'Mark Crane',
  'Michele Long',
  'Molly Russell',
  'Natalie Cardenas',
  'Nicki Sorrentino',
  'Raven Tolbert',
  'Rebecca Kennard',
  'Ryan Cuellar',
  'Sandra McIntyre',
  'Shana McNeil',
  'Sharon Razzore',
  'Stephanie Kegley',
  'Timothy Carr',
  'Timothy Girdlestone',
  'Tyrae Jones',
  'Victoria Milani',
  'Virginia Bailey-Barnes',
  'Walter Adams',
] as const

/** Looker Consultant spellings that differ from HR `mgr_name`. */
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
