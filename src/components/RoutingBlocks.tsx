import { ROUTING_GROUP_META } from '../data/routingGroups'
import { formatPgc } from '../lib/pacer'
import type { RoutingGroupStats } from '../lib/routing'
import type { RoutingGroup } from '../lib/types'

type Props = {
  stats: RoutingGroupStats[]
  selected: RoutingGroup | null
  onSelect: (group: RoutingGroup | null) => void
}

export function RoutingBlocks({ stats, selected, onSelect }: Props) {
  const byGroup = new Map(stats.map((s) => [s.group, s]))

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 sm:grid-cols-2 sm:px-6">
      {ROUTING_GROUP_META.map((meta) => {
        const row = byGroup.get(meta.id) ?? { group: meta.id, pgc: null, cc90: 0, n: 0 }
        const on = selected === meta.id
        return (
          <button
            key={meta.id}
            type="button"
            data-on={on}
            data-tone={meta.id}
            onClick={() => onSelect(on ? null : meta.id)}
            className="routing-block"
          >
            <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase">{meta.label}</p>
            <p className="routing-pgc mt-3 tabular-nums">{formatPgc(row.pgc)}</p>
            <p className="mt-3 text-sm text-slate-600">{meta.hint}</p>
            <p className="mt-1 text-xs text-slate-400">
              {row.n} {row.n === 1 ? 'person' : 'people'}
              {row.cc90 > 0 ? ` · ${row.cc90.toLocaleString()} cc90` : ''}
              {on ? ' · showing list' : ''}
            </p>
          </button>
        )
      })}
    </div>
  )
}
