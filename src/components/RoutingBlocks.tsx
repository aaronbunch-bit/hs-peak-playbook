import { ROUTING_GROUP_META, ROUTING_OVERALL_META } from '../data/routingGroups'
import { formatPgc } from '../lib/pacer'
import type { RoutingGroupStats } from '../lib/routing'
import type { RoutingGroup, Slice } from '../lib/types'

type Props = {
  stats: RoutingGroupStats[]
  overall: RoutingGroupStats
  selected: RoutingGroup | null
  slice: Slice
  loading?: boolean
  onSelect: (group: RoutingGroup | null) => void
}

function overallHint(slice: Slice): string {
  if (slice === 'hs-stem') return 'All pools · HS-STEM'
  if (slice === 'k12tp') return 'All pools · K12'
  return 'All pools · Super'
}

function BlockCopy({
  label,
  hint,
  row,
  selected,
}: {
  label: string
  hint: string
  row: RoutingGroupStats
  selected: boolean
}) {
  const meta = `${row.n} · ${row.cc90 > 0 ? `${row.cc90.toLocaleString()} cc90` : '—'}${selected ? ' · list' : ''}`
  return (
    <>
      <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="routing-pgc mt-1 tabular-nums">{formatPgc(row.pgc)}</p>
      <p className="text-xs text-slate-400" title={hint}>
        {hint} · {meta}
      </p>
    </>
  )
}

export function RoutingBlocks({ stats, overall, selected, slice, loading = false, onSelect }: Props) {
  const byGroup = new Map(stats.map((s) => [s.group, s]))
  const cards: Array<{ id: RoutingGroup; label: string; hint: string; row: RoutingGroupStats }> = [
    {
      id: 'overall',
      label: ROUTING_OVERALL_META.label,
      hint: overallHint(slice),
      row: overall,
    },
    ...ROUTING_GROUP_META.map((meta) => ({
      id: meta.id,
      label: meta.label,
      hint: meta.id === 'primary' ? 'Peak' : meta.id === 'training' ? 'JP Riordan' : meta.id === 'cross-trained' ? 'Named list' : 'Everyone else',
      row: byGroup.get(meta.id) ?? { group: meta.id, pgc: null, cc90: 0, n: 0 },
    })),
  ]

  return (
    <div
      className={`mx-auto grid max-w-6xl grid-cols-3 gap-3 px-4 sm:px-6 ${loading ? 'pointer-events-none opacity-50' : ''}`}
      aria-busy={loading}
    >
      {cards.map((card) => {
        const on = selected === card.id
        return (
          <button
            key={card.id}
            type="button"
            data-on={on}
            data-tone={card.id}
            onClick={() => onSelect(on ? null : card.id)}
            className="routing-block"
          >
            <BlockCopy label={card.label} hint={card.hint} row={card.row} selected={on} />
          </button>
        )
      })}
    </div>
  )
}
