import { formatPgc } from '../lib/pacer'
import { expectedPgc, highestMetLc, pgcChipTone, type LcCurves } from '../lib/settings'

type Props = {
  value: number | null | undefined
  level?: string | null
  targetPgc?: number
  lcCurves?: LcCurves
  atTarget?: boolean
  expected?: number
  size?: 'sm' | 'lg'
}

const TONE_CLASS = {
  at: 'bg-emerald-100 text-emerald-800',
  stretch: 'bg-sky-100 text-sky-800',
  below: 'bg-rose-50 text-rose-800',
} as const

export function PgcStatus({
  value,
  level,
  targetPgc,
  lcCurves,
  atTarget,
  expected,
  size = 'sm',
}: Props) {
  if (value == null) return <span className="text-slate-400">—</span>
  const pad = size === 'lg' ? 'px-2.5 py-1 text-2xl' : 'px-2 py-0.5 text-sm'
  const canRank = targetPgc != null && lcCurves != null
  const tone = canRank ? pgcChipTone(value, level, targetPgc, lcCurves) : atTarget ? 'at' : 'below'
  if (tone === 'empty') return <span className="text-slate-400">—</span>
  const ownExpect = expected ?? (canRank ? expectedPgc(targetPgc, level, lcCurves) : null)
  const met = canRank ? highestMetLc(value, level, targetPgc, lcCurves) : null
  const title =
    tone === 'stretch' && met != null && canRank
      ? `Beating ${met} expect ${formatPgc(expectedPgc(targetPgc, met, lcCurves))}`
      : tone === 'at'
        ? `At or above ${level ?? 'LC'} expect ${ownExpect != null ? formatPgc(ownExpect) : ''}`.trim()
        : `Below ${level ?? 'LC'} expect ${ownExpect != null ? formatPgc(ownExpect) : ''}`.trim()
  return (
    <span className={`inline-flex items-center rounded-full font-semibold tabular-nums ${TONE_CLASS[tone]} ${pad}`} title={title}>
      {formatPgc(value)}
    </span>
  )
}
