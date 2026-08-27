import { isIsoDate } from './calendar'
import {
  COHORTS,
  ROUTING_GROUPS,
  ROUTING_PERIODS,
  SLICES,
  STAFFINGS,
  type Cohort,
  type RoutingGroup,
  type RoutingPeriod,
  type Slice,
  type Staffing,
} from './types'
import { periodMatchingRange, rangeForRoutingPeriod } from './routingRange'

export type AppTab = 'playbook' | 'wtd' | 'roster' | 'focus' | 'routing'

export type HashState = {
  slice: Slice
  cohort: Cohort
  staffing: Staffing
  manager: string | null
  tab: AppTab
  week: string | null
  routingPeriod: RoutingPeriod
  routingGroup: RoutingGroup | null
  routingFrom: string
  routingTo: string
}

const DEFAULT: HashState = {
  slice: 'hs-stem',
  cohort: 'all',
  staffing: 'primary',
  manager: null,
  tab: 'playbook',
  week: null,
  routingPeriod: 'yesterday',
  routingGroup: null,
  routingFrom: '',
  routingTo: '',
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

function parseTab(v: string | null): AppTab {
  if (v === 'yesterday' || v === 'audience' || v === 'routing') return 'routing'
  if (v === 'playbook' || v === 'wtd' || v === 'roster' || v === 'focus') return v
  return DEFAULT.tab
}

function isRoutingPeriod(v: string | null): v is RoutingPeriod {
  return !!v && (ROUTING_PERIODS as readonly string[]).includes(v)
}

function isRoutingGroup(v: string | null): v is RoutingGroup {
  return !!v && (ROUTING_GROUPS as readonly string[]).includes(v)
}

/** This look has no staffing / overflow flag. Cross Train stays an empty stub. */
export function staffingAllowed(_slice: Slice): boolean {
  return false
}

function routingFromHash(periodParam: string | null, fromParam: string | null, toParam: string | null) {
  if (isIsoDate(fromParam) && isIsoDate(toParam)) {
    const range = rangeForRoutingPeriod('custom', fromParam, toParam)
    return {
      routingPeriod: periodMatchingRange(range.start, range.end),
      routingFrom: range.start,
      routingTo: range.end,
    }
  }
  const period = isRoutingPeriod(periodParam) ? periodParam : DEFAULT.routingPeriod
  const range = rangeForRoutingPeriod(period, fromParam, toParam)
  return {
    routingPeriod: period === 'custom' ? periodMatchingRange(range.start, range.end) : period,
    routingFrom: range.start,
    routingTo: range.end,
  }
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
  const routing = routingFromHash(params.get('period'), params.get('from'), params.get('to'))
  const groupParam = params.get('group')
  return {
    slice,
    cohort: isCohort(cohortParam) ? cohortParam : DEFAULT.cohort,
    staffing: staffingAllowed(slice) && isStaffing(staffingRaw) ? staffingRaw : 'primary',
    manager,
    tab: parseTab(tabParam),
    week: params.get('week'),
    routingGroup: isRoutingGroup(groupParam) ? groupParam : null,
    ...routing,
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
  if (state.tab === 'routing') {
    if (state.routingPeriod !== 'yesterday') params.set('period', state.routingPeriod)
    if (state.routingPeriod === 'custom') {
      params.set('from', state.routingFrom)
      params.set('to', state.routingTo)
    }
    if (state.routingGroup) params.set('group', state.routingGroup)
  }
  const next = `#${params.toString()}`
  if (window.location.hash !== next) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}${next}`)
  }
}

/** 0 = in-progress WTD week. 1 = newest closed week. */
export function weekCursorFromHash(tab: AppTab, week: string | null, weeks: string[]): number {
  if (tab === 'wtd' || week === 'wtd') return 0
  if (week && weeks.length) {
    const i = weeks.indexOf(week)
    if (i >= 0) return i + 1
  }
  return 1
}
