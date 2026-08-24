import { isLcLevel, LC_LEVELS, type LcLevel } from './roster'
import type { Slice } from './types'

export type AudienceKey = 'hs' | 'k12' | 'super'

export type Targets = {
  hs: number
  k12: number
  super: number
}

/** Share of the audience pGC target that each Learning Curve is held to. LC4 is the full bar. */
export type LcCurves = Record<LcLevel, number>

export type SuggestParams = {
  belowTarget: boolean
  wowDeclinePts: number
  minCc90: number
  includeBelowWithoutDecline: boolean
  maxSuggestions: number
}

export type AppSettings = {
  targets: Targets
  lcCurves: LcCurves
  suggest: SuggestParams
}

const KEY = 'hs-peak-playbook:settings-v1'

export const DEFAULT_LC_CURVES: LcCurves = {
  LC1: 0.75,
  LC2: 0.85,
  LC3: 0.9,
  LC4: 1,
}

export const DEFAULT_SETTINGS: AppSettings = {
  targets: { hs: 0.2, k12: 0.2, super: 0.2 },
  lcCurves: { ...DEFAULT_LC_CURVES },
  suggest: {
    belowTarget: true,
    wowDeclinePts: 0.03,
    minCc90: 15,
    includeBelowWithoutDecline: true,
    maxSuggestions: 8,
  },
}

export function targetForSlice(slice: Slice, targets: Targets): number {
  if (slice === 'hs-stem') return targets.hs
  if (slice === 'k12tp') return targets.k12
  return targets.super
}

export function curveForLevel(level: string | null | undefined, curves: LcCurves): number {
  if (isLcLevel(level)) return curves[level]
  return curves.LC4
}

export function expectedPgc(baseTarget: number, level: string | null | undefined, curves: LcCurves): number {
  return baseTarget * curveForLevel(level, curves)
}

export function audienceLabel(slice: Slice): string {
  if (slice === 'hs-stem') return 'HS'
  if (slice === 'k12tp') return 'K12'
  return 'Super'
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<AppSettings> & { targets?: Targets & { overall?: number } }
    const targets = { ...DEFAULT_SETTINGS.targets, ...parsed.targets }
    if (targets.super == null && parsed.targets?.overall != null) {
      targets.super = parsed.targets.overall
    }
    const lcCurves = { ...DEFAULT_LC_CURVES, ...parsed.lcCurves }
    for (const level of LC_LEVELS) {
      const n = lcCurves[level]
      lcCurves[level] = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_LC_CURVES[level]
    }
    return {
      targets,
      lcCurves,
      suggest: { ...DEFAULT_SETTINGS.suggest, ...parsed.suggest },
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings))
}
