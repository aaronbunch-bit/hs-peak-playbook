import { isHighSchoolName } from './highSchoolWorkGroup'
import type { RoutingGroup } from '../lib/types'

/** Looker Rep Manager (`supervisor`) for the Training bucket. Peak names still win Primary. */
export const TRAINING_MANAGER = 'John Paul Riordan'

/**
 * Cross-trained: screenshot roster minus named exclusions, plus adds.
 * Exclusions (never Cross-trained): Tina Chazin, Patricia Bujnarowski, Autumn Drayer,
 * Jessica Mason Byers, Kallie Palmer, Lorena Baltzell-Jefcoat, Shakena Dunn,
 * Marcelle Aquino-Bodden, Liliana Gutierrez-Pino, Brianna Cooper, Camille Graves,
 * Gina Reyna, Kendra Brown.
 */
export const CROSS_TRAINED_NAMES = [
  'Alexis Inguaggiato',
  'Angela Thomas',
  'Brandy Mattas',
  'Bryce Schwanke',
  'Christina Buchanan',
  'Christopher Cole',
  'Chloe DeMott',
  'Courtney Ortwein',
  'Dorinda Collins',
  'Emilio Tatis',
  'Laura Hayne',
  'Maria Jacovo',
  'Mariz Soliman',
  'Melissa Steinberg',
  'Michael Shunk',
  'Sabeen Chhipa',
  'Shelby Degenaars',
  'Terry Miller',
] as const

const CROSS_TRAINED_SET = new Set(CROSS_TRAINED_NAMES.map((n) => n.toLowerCase()))

/** Looker managers whose people should not appear in Overflow. */
export const OVERFLOW_EXCLUDED_MANAGERS = [
  'Ashley Roos',
  'Tamaira Kaster',
  'Tamaria Kaster',
  'Margaret Etzel',
  'Ronaldo Felix',
] as const

const OVERFLOW_EXCLUDED_MANAGER_SET = new Set(OVERFLOW_EXCLUDED_MANAGERS.map((n) => n.trim().toLowerCase()))

export const ROUTING_OVERALL_META = {
  id: 'overall' as const,
  label: 'Overall',
  hint: 'All four pools combined',
}

export const ROUTING_GROUP_META: Array<{ id: Exclude<RoutingGroup, 'overall'>; label: string; hint: string }> = [
  { id: 'primary', label: 'Primary', hint: 'High School Peak' },
  { id: 'training', label: 'Training', hint: 'John Paul Riordan' },
  { id: 'cross-trained', label: 'Cross-trained', hint: 'Named cross-train list' },
  { id: 'overflow', label: 'Overflow', hint: 'Everyone else with HS/K12 volume' },
]

function managerKey(manager: string | null | undefined): string {
  return (manager ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function isTrainingManager(manager: string | null | undefined): boolean {
  return managerKey(manager) === TRAINING_MANAGER.toLowerCase()
}

export function isOverflowExcludedManager(manager: string | null | undefined): boolean {
  const key = managerKey(manager)
  if (!key) return false
  if (OVERFLOW_EXCLUDED_MANAGER_SET.has(key)) return true
  return key.endsWith(' kaster') && (key.includes('tamaira') || key.includes('tamaria'))
}

export function isCrossTrainedName(name: string): boolean {
  return CROSS_TRAINED_SET.has(name.trim().toLowerCase())
}

/** Exclusive: Primary → Training → Cross-trained → Overflow. */
export function assignRoutingGroup(name: string, manager: string | null | undefined): RoutingGroup {
  if (isHighSchoolName(name)) return 'primary'
  if (isTrainingManager(manager)) return 'training'
  if (isCrossTrainedName(name)) return 'cross-trained'
  return 'overflow'
}
