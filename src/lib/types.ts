export const SLICES = ['hs-stem', 'k12tp', 'supergroup'] as const
export type Slice = (typeof SLICES)[number]

export const COHORTS = ['all', 'lc1-3', 'lc4'] as const
export type Cohort = (typeof COHORTS)[number]

export const STAFFINGS = ['primary', 'cross-train'] as const
export type Staffing = (typeof STAFFINGS)[number]

export type Trend = 'up' | 'down' | 'stagnant'

export type RosterEntry = {
  name: string
  level: string | null
  manager: string | null
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
  k12Cc90: number
  k12Pgc: number | null
  k12Mix: number | null
  totalPgc: number | null
}

export type WeeklyRow = {
  week: string
  rep: string
  pgc: number
  cc90: number | null
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
  wtdWeek: string | null
  wtdAsOf: string | null
  focusLog: FocusLogEntry[]
  empty?: boolean
  emptyReason?: string
}

export type WeekPoint = {
  week: string
  pgc: number | null
  cc90: number | null
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
  mix: number | null
  expectedPgc: number
  deltaWow: number | null
  delta3wk: number | null
  trend: Trend | null
  atTarget: boolean
  wtdPgc: number | null
  wtdCc90: number | null
  wtdVsLast: number | null
  wtdAtTarget: boolean
  weeks: WeekPoint[]
  focusHistory: FocusLogEntry[]
}
