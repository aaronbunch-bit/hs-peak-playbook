import type { Slice } from './types'

export const SLICE_LABELS: Record<Slice, string> = {
  'hs-stem': 'HS-STEM',
  k12tp: 'K12TP',
  supergroup: 'Supergroup',
}

export const SLICE_SHORT: Record<Slice, string> = {
  'hs-stem': 'HS',
  k12tp: 'K12',
  supergroup: 'SG',
}

export const FOCUS_SLICES: Slice[] = ['hs-stem', 'k12tp', 'supergroup']
