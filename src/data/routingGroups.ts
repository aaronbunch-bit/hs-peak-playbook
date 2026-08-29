import { isHighSchoolName } from './highSchoolWorkGroup'
import type { DedicatedChips } from '../lib/overflowAllowlist'
import type { RoutingGroup, Slice } from '../lib/types'

/** Looker Rep Manager (`supervisor`) for the Training bucket. Peak names still win Primary. */
export const TRAINING_MANAGER = 'John Paul Riordan'

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
  { id: 'cross-trained', label: 'Cross-trained', hint: 'Overflow Configs dedicated CT' },
  { id: 'overflow', label: 'Overflow', hint: 'Everyone else with HS/K12 volume' },
  { id: 'training', label: 'Training', hint: 'John Paul Riordan' },
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

export function isDedicatedForSlice(chips: DedicatedChips, slice: Slice): boolean {
  if (slice === 'hs-stem') return chips.dedicatedHs
  if (slice === 'k12tp') return chips.dedicatedK12
  return chips.dedicatedHs || chips.dedicatedK12
}

/**
 * Exclusive: Primary → Training → Cross-trained (Overflow Configs chip for this slice) → Overflow.
 * Peak names always win Primary even if they also have Overflow chips.
 */
export function assignRoutingGroup(
  name: string,
  manager: string | null | undefined,
  chips: DedicatedChips,
  slice: Slice,
): RoutingGroup {
  if (isHighSchoolName(name)) return 'primary'
  if (isTrainingManager(manager)) return 'training'
  if (isDedicatedForSlice(chips, slice)) return 'cross-trained'
  return 'overflow'
}
