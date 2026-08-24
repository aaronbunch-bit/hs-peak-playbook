import { sundayWeekStart, toIsoDate } from './calendar'
import type { PacerPayload, Slice } from './types'

export const SLICE_LOOKER_FILTERS: Record<
  Slice,
  { label: string; notes: string; filters: Record<string, string> }
> = {
  'hs-stem': {
    label: 'HS-STEM',
    notes: 'Audience = HS-STEM. pGC and CC90 from that pivot; mix is share of the rep’s CC90.',
    filters: {
      Audience: 'HS-STEM',
      'Call Created At Week': 'complete Sunday week',
    },
  },
  k12tp: {
    label: 'K12TP',
    notes: 'Audience = K12 Test Prep on the same look. Empty pGC when CC90 is 0.',
    filters: {
      Audience: 'K12 Test Prep',
      'Call Created At Week': 'complete Sunday week',
    },
  },
  supergroup: {
    label: 'Supergroup',
    notes: 'Looker Total pGC — volume-weighted HS-STEM + K12 Test Prep. Not a fourth overall rollup.',
    filters: {
      'Call Created At Week': 'complete Sunday week',
    },
  },
}

const DEFAULT_TARGET_PGC = 0.2
const DEFAULT_IMPROVE_PTS = 0.03
const DEFAULT_DEGRADE_PTS = -0.03

export function emptyPayload(slice: Slice, reason: string): PacerPayload {
  const meta = SLICE_LOOKER_FILTERS[slice]
  return {
    source: 'looker-stub',
    slice,
    sliceLabel: meta.label,
    targetPgc: DEFAULT_TARGET_PGC,
    improvePts: DEFAULT_IMPROVE_PTS,
    degradePts: DEFAULT_DEGRADE_PTS,
    weeks: [],
    roster: [],
    weekly: [],
    wtd: [],
    wtdWeek: sundayWeekStart(),
    wtdAsOf: toIsoDate(new Date()),
    focusLog: [],
    empty: true,
    emptyReason: reason,
  }
}
