import { formatPgc, formatWeek } from '../lib/pacer'
import { SLICE_LABELS, SLICE_SHORT } from '../lib/slices'
import type { Slice } from '../lib/types'

export type FocusListItem = {
  name: string
  manager: string | null
  level: string | null
  slices: Slice[]
  hsPgc: number | null
  hsCc90: number | null
  k12Pgc: number | null
  k12Cc90: number | null
  superPgc: number | null
  note: string
}

type Props = {
  week: string
  items: FocusListItem[]
  selected: string | null
  onSelect: (name: string) => void
  onToggle: (name: string, slice: Slice) => void
}

const GROUPS: Slice[] = ['hs-stem', 'k12tp', 'supergroup']

function pgcFor(item: FocusListItem, slice: Slice): { pgc: number | null; cc90: number | null } {
  if (slice === 'hs-stem') return { pgc: item.hsPgc, cc90: item.hsCc90 }
  if (slice === 'k12tp') return { pgc: item.k12Pgc, cc90: item.k12Cc90 }
  return { pgc: item.superPgc, cc90: (item.hsCc90 ?? 0) + (item.k12Cc90 ?? 0) || null }
}

export function FocusList({ week, items, selected, onSelect, onToggle }: Props) {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 sm:px-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Focus · week of {formatWeek(week)}</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Tags are per audience. Someone can be at Super expectation from K12 volume and still be an HS
          focus. Tags clear next Sunday.
        </p>
      </div>

      {GROUPS.map((slice) => {
        const rows = items.filter((item) => item.slices.includes(slice))
        return (
          <section
            key={slice}
            className="overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-sm shadow-violet-100/50"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
              <h3 className="text-sm font-semibold text-slate-800">{SLICE_LABELS[slice]}</h3>
              <p className="text-xs text-slate-400">{rows.length === 0 ? 'None' : `${rows.length}`}</p>
            </div>
            {rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400 sm:px-5">
                No {SLICE_SHORT[slice]} focuses this week.
              </p>
            ) : (
              <ul>
                {rows.map((item) => {
                  const { pgc, cc90 } = pgcFor(item, slice)
                  return (
                    <li key={`${slice}-${item.name}`}>
                      <button
                        type="button"
                        onClick={() => onSelect(item.name)}
                        className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-3 text-left last:border-0 sm:px-5 ${
                          selected === item.name ? 'bg-sky-50/80' : 'hover:bg-slate-50/90'
                        }`}
                      >
                        <div className="min-w-40 flex-1">
                          <p className="font-medium text-slate-900">{item.name}</p>
                          <p className="text-xs text-slate-400">
                            {item.manager ?? 'No manager'} · {item.level ?? 'Unknown'}
                          </p>
                        </div>
                        <div className="text-sm tabular-nums text-slate-700">
                          {SLICE_SHORT[slice]} {formatPgc(pgc)}
                          <span className="ml-1 text-xs text-slate-400">
                            {cc90 == null ? '' : `${cc90.toLocaleString()} cc90`}
                          </span>
                        </div>
                        <div className="hidden text-xs text-slate-400 sm:block">
                          HS {formatPgc(item.hsPgc)} · K12 {formatPgc(item.k12Pgc)} · Super{' '}
                          {formatPgc(item.superPgc)}
                        </div>
                        {item.note ? (
                          <p className="w-full truncate text-xs text-violet-600 sm:max-w-xs sm:flex-none">
                            {item.note}
                          </p>
                        ) : null}
                        <span
                          role="button"
                          tabIndex={0}
                          className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 ring-1 ring-slate-200 hover:text-rose-700"
                          onClick={(e) => {
                            e.stopPropagation()
                            onToggle(item.name, slice)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              e.stopPropagation()
                              onToggle(item.name, slice)
                            }
                          }}
                        >
                          Remove
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
