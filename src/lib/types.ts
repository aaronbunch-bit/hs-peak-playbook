export const SLICES = ['hs-stem', 'k12tp', 'supergroup'] as const
export type Slice = (typeof SLICES)[number]

export const COHORTS = ['all', 'lc1-3', 'lc4'] as const
export type Cohort = (typeof COHORTS)[number]

export const STAFFINGS = ['primary', 'cross-train'] as const
export type Staffing = (typeof STAFFINGS)[number]

export const ROUTING_GROUPS = ['overall', 'primary', 'cross-trained', 'overflow', 'training'] as const
export type RoutingGroup = (typeof ROUTING_GROUPS)[number]

export const ROUTING_PERIODS = ['yesterday', 'wtd', 'week', 'mtd', 'custom'] as const
export type RoutingPeriod = (typeof ROUTING_PERIODS)[number]

export type Trend = 'up' | 'down' | 'stagnant'

export type RosterEntry = {
  name: string
  level: string | null
  manager: string | null
  workGroup?: string | null
  staffing?: Staffing | null
  lookerRepId?: number | null
}

/** One Looker row: consultant × Sunday week, with HS-STEM and K12 Test Prep audiences. Total pGC is Supergroup. */
export type LookerFact = {
  week: string
  superGroup: string | null
  name: string
  manager: string | null
  hsCc90: number
  hsPgc: number | null
  hsMix: number | null
  hsImpact?: number
  k12Cc90: number
  k12Pgc: number | null
  k12Mix: number | null
  k12Impact?: number
  totalPgc: number | null
}

export type WeeklyRow = {
  week: string
  rep: string
  pgc: number
  cc90: number | null
  impact?: number | null
  mix?: number | null
  hsCc90?: number | null
  hsPgc?: number | null
  hsMix?: number | null
  k12Cc90?: number | null
  k12Pgc?: number | null
  k12Mix?: number | null
  totalPgc?: number | null
}

export type WtdRow = {
  week: string
  asOf: string
  rep: string
  pgc: number
  cc90: number | null
  impact?: number | null
}

/** One consultant × calendar day for the in-progress week. */
export type DailyRow = {
  date: string
  rep: string
  pgc: number | null
  cc90: number | null
  impact?: number | null
}

/** Unrestricted HS/K12 person row rolled up over a routing date range. */
export type RoutingFact = {
  date: string
  name: string
  manager: string | null
  routingGroup: RoutingGroup
  hsCc90: number
  hsPgc: number | null
  hsImpact: number
  k12Cc90: number
  k12Pgc: number | null
  k12Impact: number
  totalPgc: number | null
}

export type RoutingRangePayload = {
  start: string
  end: string
  facts: RoutingFact[]
  empty?: boolean
  emptyReason?: string
}

/** Look 26569: Manager = rep, Regional Director = manager. Today so far. */
export type IntradayRow = {
  name: string
  manager: string | null
  routingGroup: RoutingGroup
  hsPgc: number | null
  hsCc90: number
  k12Pgc: number | null
  k12Cc90: number
  superPgc: number | null
  superCc90: number
}

export type IntradayRepRow = IntradayRow & {
  level: string | null
  expectedHs: number
  expectedK12: number
  expectedSuper: number
}

export type IntradayPayload = {
  source: string
  asOf: string
  rows: IntradayRow[]
  empty?: boolean
  emptyReason?: string
}

export type FocusLogEntry = {
  week: string
  rep: string
  slice?: Slice | null
  type: string | null
  owner: string | null
  note: string | null
}

export type LookerSeed = {
  source: string
  targetPgc: number
  improvePts: number
  degradePts: number
  roster: RosterEntry[]
  facts: LookerFact[]
  focusLog: FocusLogEntry[]
}

export type PacerPayload = {
  source: string
  slice: Slice | string
  sliceLabel: string
  targetPgc: number
  improvePts: number
  degradePts: number
  weeks: string[]
  roster: RosterEntry[]
  weekly: WeeklyRow[]
  wtd: WtdRow[]
  daily: DailyRow[]
  dailyDays: string[]
  wtdWeek: string | null
  wtdAsOf: string | null
  yesterdayDate: string
  yesterdayFacts: RoutingFact[]
  lastWeekStart: string
  lastWeekFacts: RoutingFact[]
  focusLog: FocusLogEntry[]
  empty?: boolean
  emptyReason?: string
}

export type WeekPoint = {
  week: string
  pgc: number | null
  cc90: number | null
  impact?: number | null
  deltaWow: number | null
  mix?: number | null
  hsPgc?: number | null
  hsCc90?: number | null
  hsMix?: number | null
  k12Pgc?: number | null
  k12Cc90?: number | null
  k12Mix?: number | null
  totalPgc?: number | null
}

export type RepRow = {
  name: string
  level: string | null
  manager: string | null
  pgc: number | null
  cc90: number | null
  impact: number | null
  mix: number | null
  expectedPgc: number
  deltaWow: number | null
  trend: Trend | null
  atTarget: boolean
  wtdPgc: number | null
  wtdCc90: number | null
  wtdImpact: number | null
  wtdVsLast: number | null
  wtdAtTarget: boolean
  weeks: WeekPoint[]
  focusHistory: FocusLogEntry[]
}
