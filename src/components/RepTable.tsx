import { formatBps, formatPgc, formatWeek } from '../lib/pacer'
import { SLICE_SHORT } from '../lib/slices'
import type { RepRow, Slice } from '../lib/types'
import { PgcStatus } from './PgcStatus'

export type SortKey = 'name' | 'manager' | 'pgc' | 'wtdPgc' | 'deltaWow' | 'delta3wk'

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
  slice: Slice
  onSort: (key: SortKey) => void
  onSelect: (name: string) => void
  onToggleFocus: (name: string) => void
  onHide: (name: string) => void
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400">—</span>
  const cls = value > 0 ? 'text-emerald-600' : value < 0 ? 'text-rose-600' : 'text-slate-500'
  return <span className={cls}>{formatBps(value)}</span>
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
      } ${active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
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
          <thead className="bg-slate-900/[0.06] text-left">
            <tr className="border-b border-slate-200/70">
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
                <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Focus</span>
              </th>
              <th className="px-3 py-3 text-right font-medium">
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
                  label="WTD"
                  active={sortKey === 'wtdPgc'}
                  dir={sortDir}
                  align="right"
                  onClick={() => onSort('wtdPgc')}
                />
              </th>
              <th className="px-3 py-3 text-right font-medium">
                <SortBtn
                  label="Δ WoW"
                  active={sortKey === 'deltaWow'}
                  dir={sortDir}
                  align="right"
                  onClick={() => onSort('deltaWow')}
                />
              </th>
              <th className="px-4 py-3 text-right font-medium sm:px-5">
                <SortBtn
                  label="Δ 3wk"
                  active={sortKey === 'delta3wk'}
                  dir={sortDir}
                  align="right"
                  onClick={() => onSort('delta3wk')}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isFocus = focused.has(row.name)
              const isSug = suggested.has(row.name)
              const isSel = selected === row.name
              const prior = lastFocusWeek.get(row.name)
              const also = (focusSlices.get(row.name) ?? []).filter((s) => s !== slice)
              return (
                <tr
                  key={row.name}
                  onClick={() => onSelect(row.name)}
                  className={`group cursor-pointer border-b border-slate-100/90 transition last:border-0 ${
                    isSel ? 'bg-sky-200/40' : isFocus ? 'bg-fuchsia-200/35' : 'hover:bg-white/45'
                  }`}
                >
                  <td className="relative px-4 py-3 sm:px-5">
                    {isFocus && (
                      <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-gradient-to-b from-fuchsia-500 to-violet-500" />
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-slate-900">{row.name}</span>
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
                        className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-slate-200/80 hover:text-slate-700"
                      >
                        Hide
                      </button>
                    </div>
                    <div className="text-xs text-slate-400">
                      {row.level ?? 'Unknown'} · expect {formatPgc(row.expectedPgc)}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{row.manager ?? '—'}</td>
                  <td className="px-3 py-3 text-center">
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
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <PgcStatus value={row.pgc} atTarget={row.atTarget} expected={row.expectedPgc} />
                      <div className="text-[10px] text-slate-400">
                        {row.cc90 == null ? '—' : `${row.cc90.toLocaleString()} cc90`}
                        {row.mix != null
                          ? ` · ${(row.mix * 100).toFixed(0)}% ${slice === 'supergroup' ? 'HS' : 'mix'}`
                          : ''}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <PgcStatus value={row.wtdPgc} atTarget={row.wtdAtTarget} expected={row.expectedPgc} />
                    <div className="text-[10px] text-slate-400">
                      {row.wtdPgc == null
                        ? '—'
                        : row.wtdCc90 == null
                          ? 'cc90 —'
                          : `${row.wtdCc90.toLocaleString()} cc90`}
                    </div>
                    {row.wtdVsLast != null && (
                      <div className="text-[10px]">
                        <Delta value={row.wtdVsLast} />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <Delta value={row.deltaWow} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums sm:px-5">
                    <Delta value={row.delta3wk} />
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                  No reps in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-violet-200/40 px-5 py-2.5 text-xs text-slate-500">
        Green chips meet that rep’s LC expectation. LC4 is the slice bar ({formatPgc(targetPgc)}). Deltas are in
        bps (100 bps = 1%). Team pGC is CC90-weighted. WTD is this Sunday through today. Focus is for that
        calendar week and that audience (HS, K12, or Super). Hide removes a rep from this view until you restore
        them.
      </p>
    </div>
  )
}
