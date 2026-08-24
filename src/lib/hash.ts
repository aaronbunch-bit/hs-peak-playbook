import { COHORTS, SLICES, STAFFINGS, type Cohort, type Slice, type Staffing } from './types'

export type AppTab = 'playbook' | 'roster' | 'focus'

export type HashState = {
  slice: Slice
  cohort: Cohort
  staffing: Staffing
  manager: string | null
  tab: AppTab
  week: string | null
}

const DEFAULT: HashState = {
  slice: 'hs-stem',
  cohort: 'all',
  staffing: 'primary',
  manager: null,
  tab: 'playbook',
  week: null,
}

function isSlice(v: string | null): v is Slice {
  if (v === 'overall') return false
  return !!v && (SLICES as readonly string[]).includes(v)
}

function isCohort(v: string | null): v is Cohort {
  return !!v && (COHORTS as readonly string[]).includes(v)
}

function isStaffing(v: string | null): v is Staffing {
  return !!v && (STAFFINGS as readonly string[]).includes(v)
}

function isTab(v: string | null): v is AppTab {
  return v === 'playbook' || v === 'roster' || v === 'focus'
}

/** This look has no staffing / overflow flag. Cross Train stays an empty stub. */
export function staffingAllowed(_slice: Slice): boolean {
  return false
}

export function readHash(): HashState {
  const raw = window.location.hash.replace(/^#/, '')
  const params = new URLSearchParams(raw)
  const sliceParam = params.get('slice') === 'overall' ? 'supergroup' : params.get('slice')
  const cohortParam = params.get('cohort')
  const slice: Slice = isSlice(sliceParam) ? sliceParam : DEFAULT.slice
  const staffingRaw = params.get('staffing')
  const manager = params.get('manager')?.trim() || null
  const tabParam = params.get('tab')
  return {
    slice,
    cohort: isCohort(cohortParam) ? cohortParam : DEFAULT.cohort,
    staffing: staffingAllowed(slice) && isStaffing(staffingRaw) ? staffingRaw : 'primary',
    manager,
    tab: isTab(tabParam) ? tabParam : DEFAULT.tab,
    week: params.get('week'),
  }
}

export function writeHash(state: HashState): void {
  const params = new URLSearchParams()
  params.set('slice', state.slice)
  params.set('cohort', state.cohort)
  if (state.tab !== 'playbook') params.set('tab', state.tab)
  if (state.manager) params.set('manager', state.manager)
  if (staffingAllowed(state.slice) && state.staffing !== 'primary') {
    params.set('staffing', state.staffing)
  }
  if (state.week) params.set('week', state.week)
  const next = `#${params.toString()}`
  if (window.location.hash !== next) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}${next}`)
  }
}
