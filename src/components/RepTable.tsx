import { formatBps, formatImpact, formatPgc, formatWeek } from '../lib/pacer'
import { SLICE_SHORT } from '../lib/slices'
import type { LcCurves } from '../lib/settings'
import type { RepRow, Slice } from '../lib/types'
import { PgcStatus } from './PgcStatus'

export type SortKey = 'name' | 'manager' | 'pgc' | 'impact' | 'deltaWow'

type Props = {
  rows: RepRow[]
  focused: Set<string>
  suggested: Set<string>
  suggestedReasons: Map<string, string[]>
  lastFocusWeek: Map<string, string | null>
  focusSlices: Map<string, Slice[]>
  selected: string | null
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  targetPgc: number
  lcCurves: LcCurves
  slice: Slice
  onSort: (key: SortKey) => void
  onSelect: (name: string) => void
  onToggleFocus: (name: string) => void
  onHide: (name: string) => void
}

function Delta({ value, size = 'md' }: { value: number | null; size?: 'sm' | 'md' }) {
  if (value == null) return <span className="text-slate-400">—</span>
  const cls = value > 0 ? 'text-emerald-600' : value < 0 ? 'text-rose-600' : 'text-slate-500'
  return (
    <span className={`tabular-nums ${size === 'sm' ? 'text-[10px]' : 'text-sm font-medium'} ${cls}`}>
      {formatBps(value)}
    </span>
  )
}

function SortBtn({
  label,
  active,
  dir,
  align = 'left',
  onClick,
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  align?: 'left' | 'right'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase ${
        align === 'right' ? 'w-full justify-end' : ''
      } ${active ? 'text-white' : 'text-slate-300 hover:text-white'}`}
    >
      {label}
      <span className="text-[10px]">{active ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
    </button>
  )
}

export function RepTable({
  rows,
  focused,
  suggested,
  suggestedReasons,
  lastFocusWeek,
  focusSlices,
  selected,
  sortKey,
  sortDir,
  targetPgc,
  lcCurves,
  slice,
  onSort,
  onSelect,
  onToggleFocus,
  onHide,
}: Props) {
  return (
    <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-900 text-left">
            <tr>
              <th className="px-4 py-3 font-medium sm:px-5">
                <SortBtn label="Rep" active={sortKey === 'name'} dir={sortDir} onClick={() => onSort('name')} />
              </th>
              <th className="px-3 py-3 font-medium">
                <SortBtn
                  label="Manager"
                  active={sortKey === 'manager'}
                  dir={sortDir}
                  onClick={() => onSort('manager')}
                />
              </th>
              <th className="px-3 py-3 text-center font-medium">
                <span className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">Focus</span>
              </th>
              <th className="border-l border-white/10 px-3 py-3 text-right font-medium">
                <SortBtn
                  label="Last wk pGC"
                  active={sortKey === 'pgc'}
                  dir={sortDir}
                  align="right"
                  onClick={() => onSort('pgc')}
                />
              </th>
              <th className="px-3 py-3 text-right font-medium">
                <SortBtn
                  label="Impact"
                  active={sortKey === 'impact'}
                  dir={sortDir}
                  align="right"
                  onClick={() => onSort('impact')}
                />
              </th>
              <th className="px-4 py-3 text-right font-medium sm:px-5">
                <SortBtn
                  label="Δ WoW"
                  active={sortKey === 'deltaWow'}
                  dir={sortDir}
                  align="right"
                  onClick={() => onSort('deltaWow')}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isFocus = focused.has(row.name)
              const isSug = !isFocus && suggested.has(row.name)
              const isSel = selected === row.name
              const prior = lastFocusWeek.get(row.name)
              const also = (focusSlices.get(row.name) ?? []).filter((s) => s !== slice)
              return (
                <tr
                  key={row.name}
                  onClick={() => onSelect(row.name)}
                  className={`group cursor-pointer border-b border-slate-100 transition last:border-0 ${
                    isSel ? 'bg-sky-50' : i % 2 === 1 ? 'bg-slate-50/80' : 'bg-white'
                  } hover:bg-indigo-50/70`}
                >
                  <td className="relative w-px whitespace-nowrap px-4 py-3 sm:px-5">
                    {isFocus && (
                      <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-gradient-to-b from-fuchsia-500 to-violet-500" />
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-semibold text-slate-900">{row.name}</span>
                      {isSug && (
                        <span
                          className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                          title={suggestedReasons.get(row.name)?.join(' · ')}
                        >
                          Suggested
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`Hide ${row.name} from this view`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onHide(row.name)
                        }}
                        className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-slate-200/80 hover:text-slate-700"
                      >
                        Hide
                      </button>
                    </div>
                    <div className="text-xs text-slate-400">
                      {row.level ?? 'Unknown'} · expect {formatPgc(row.expectedPgc)}
                    </div>
                  </td>
                  <td className="w-px whitespace-nowrap px-3 py-3 text-slate-600">{row.manager ?? '—'}</td>
                  <td className="w-px whitespace-nowrap px-3 py-3 text-center">
                    <button
                      type="button"
                      aria-pressed={isFocus}
                      aria-label={`${isFocus ? 'Remove' : 'Mark'} ${row.name} as ${SLICE_SHORT[slice]} focus this week`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFocus(row.name)
                      }}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${
                        isFocus
                          ? 'bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white ring-transparent'
                          : 'bg-white text-slate-500 ring-slate-200 hover:ring-fuchsia-300'
                      }`}
                    >
                      {isFocus ? `${SLICE_SHORT[slice]} focus` : 'Off'}
                    </button>
                    {also.length > 0 && (
                      <div className="mt-1 text-[10px] text-fuchsia-500">
                        also {also.map((s) => SLICE_SHORT[s]).join(', ')}
                      </div>
                    )}
                    {!isFocus && prior && (
                      <div className="mt-1 text-[10px] text-violet-500">was {formatWeek(prior)}</div>
                    )}
                  </td>
                  <td className="border-l border-slate-100 px-3 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <PgcStatus
                        value={row.pgc}
                        atTarget={row.atTarget}
                        expected={row.expectedPgc}
                        level={row.level}
                        targetPgc={targetPgc}
                        lcCurves={lcCurves}
                      />
                      <div className="text-[10px] text-slate-400">
                        {row.cc90 == null ? '—' : `${row.cc90.toLocaleString()} cc90`}
                        {row.mix != null
                          ? ` · ${(row.mix * 100).toFixed(0)}% ${slice === 'supergroup' ? 'HS' : 'mix'}`
                          : ''}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                    {formatImpact(row.impact)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums sm:px-5">
                    <Delta value={row.deltaWow} />
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                  No reps in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-400">
        Green chips meet that rep’s LC bar. Blue means an LC1–3 is clearing the next LC’s bar. Rose is below
        their own LC. LC4 is the slice bar ({formatPgc(targetPgc)}). Deltas are in bps (100 bps = 1%). Team pGC is
        CC90-weighted. Impact is Looker Closed Client Count for that week. Focus tags stack — marking one rep does
        not clear another. Focus is for that calendar week and that audience (HS, K12, or SG). Hide removes a rep
        from this view until you restore them.
      </p>
    </div>
  )
}
