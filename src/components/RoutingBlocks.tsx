import { ROUTING_GROUP_META, ROUTING_OVERALL_META } from '../data/routingGroups'
import { formatPgc } from '../lib/pacer'
import type { RoutingGroupStats } from '../lib/routing'
import type { RoutingGroup } from '../lib/types'

type Props = {
  stats: RoutingGroupStats[]
  overall: RoutingGroupStats
  selected: RoutingGroup | null
  loading?: boolean
  onSelect: (group: RoutingGroup | null) => void
}

function BlockCopy({
  label,
  row,
}: {
  label: string
  row: RoutingGroupStats
}) {
  return (
    <>
      <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="routing-pgc mt-0.5 tabular-nums">{formatPgc(row.pgc)}</p>
      <p className="mt-0.5 text-xs tabular-nums text-slate-400">
        {row.n}
        {row.cc90 > 0 ? ` · ${row.cc90.toLocaleString()} cc90` : ' · —'}
      </p>
    </>
  )
}

export function RoutingBlocks({ stats, overall, selected, loading = false, onSelect }: Props) {
  const byGroup = new Map(stats.map((s) => [s.group, s]))
  const cards: Array<{ id: RoutingGroup; label: string; row: RoutingGroupStats }> = [
    {
      id: 'overall',
      label: ROUTING_OVERALL_META.label,
      row: overall,
    },
    ...ROUTING_GROUP_META.map((meta) => ({
      id: meta.id,
      label: meta.label,
      row: byGroup.get(meta.id) ?? { group: meta.id, pgc: null, cc90: 0, n: 0 },
    })),
  ]

  return (
    <div
      className={`mx-auto grid max-w-6xl grid-cols-5 gap-2 px-4 sm:gap-3 sm:px-6 ${loading ? 'pointer-events-none opacity-50' : ''}`}
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
            <BlockCopy label={card.label} row={card.row} />
          </button>
        )
      })}
    </div>
  )
}
