import { formatPgc } from '../lib/pacer'

type Props = {
  value: number | null | undefined
  atTarget: boolean
  expected?: number
  size?: 'sm' | 'lg'
}

export function PgcStatus({ value, atTarget, expected, size = 'sm' }: Props) {
  if (value == null) return <span className="text-slate-400">—</span>
  const pad = size === 'lg' ? 'px-2.5 py-1 text-2xl' : 'px-2 py-0.5 text-sm'
  const title =
    expected != null
      ? atTarget
        ? `At or above LC expect ${formatPgc(expected)}`
        : `Below LC expect ${formatPgc(expected)}`
      : atTarget
        ? 'At or above target'
        : 'Below target'
  if (atTarget) {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-emerald-100 font-semibold text-emerald-800 tabular-nums ${pad}`}
        title={title}
      >
        {formatPgc(value)}
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center rounded-full bg-slate-100 text-slate-600 tabular-nums ${pad}`}
      title={title}
    >
      {formatPgc(value)}
    </span>
  )
}
