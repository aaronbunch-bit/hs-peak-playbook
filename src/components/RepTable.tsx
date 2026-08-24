import { formatPts, formatPgc, formatWeek } from '../lib/pacer'
import type { RepRow, Slice, Trend } from '../lib/types'
import { PgcStatus } from './PgcStatus'

export type SortKey = 'name' | 'manager' | 'pgc' | 'wtdPgc' | 'deltaWow' | 'delta3wk'

type Props = {
  rows: RepRow[]
  focused: Set<string>
  suggested: Set<string>
  suggestedReasons: Map<string, string[]>
  lastFocusWeek: Map<string, string | null>
  selected: string | null
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  targetPgc: number
  slice: Slice
  onSort: (key: SortKey) => void
  onSelect: (name: string) => void
  onToggleFocus: (name: string) => void
}

function TrendMark({ trend }: { trend: Trend | null }) {
  if (trend === 'up') return <span className="font-semibold text-emerald-600">▲</span>
  if (trend === 'down') return <span className="font-semibold text-rose-600">▼</span>
  if (trend === 'stagnant') return <span className="text-slate-400">—</span>
  return <span className="text-slate-300">—</span>
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400">—</span>
  const cls = value > 0 ? 'text-emerald-600' : value < 0 ? 'text-rose-600' : 'text-slate-500'
  return <span className={cls}>{formatPts(value)}</span>
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
  selected,
  sortKey,
  sortDir,
  targetPgc,
  slice,
  onSort,
  onSelect,
  onToggleFocus,
}: Props) {
  return (
    <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-white/80 bg-white/85 shadow-sm shadow-slate-200/80">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50/90 text-left">
            <tr className="border-b border-slate-200/80">
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
              <th className="px-3 py-3 text-right font-medium">
                <SortBtn
                  label="Δ 3wk"
                  active={sortKey === 'delta3wk'}
                  dir={sortDir}
                  align="right"
                  onClick={() => onSort('delta3wk')}
                />
              </th>
              <th className="px-4 py-3 text-center font-medium sm:px-5">
                <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Trend</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isFocus = focused.has(row.name)
              const isSug = suggested.has(row.name)
              const isSel = selected === row.name
              const prior = lastFocusWeek.get(row.name)
              return (
                <tr
                  key={row.name}
                  onClick={() => onSelect(row.name)}
                  className={`cursor-pointer border-b border-slate-100 transition last:border-0 ${
                    isSel ? 'bg-sky-50/80' : isFocus ? 'bg-fuchsia-50/70' : 'hover:bg-slate-50/80'
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
                      aria-label={`${isFocus ? 'Remove' : 'Mark'} ${row.name} as focus this week`}
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
                      {isFocus ? 'This week' : 'Off'}
                    </button>
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
                    {row.wtdVsLast != null && (
                      <div className="text-[10px]">
                        <Delta value={row.wtdVsLast} />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <Delta value={row.deltaWow} />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <Delta value={row.delta3wk} />
                  </td>
                  <td className="px-4 py-3 text-center text-lg sm:px-5">
                    <TrendMark trend={row.trend} />
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-slate-500">
                  No reps in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-5 py-2 text-xs text-slate-400">
        Green chips meet that rep’s LC expectation. LC4 is the slice bar ({formatPgc(targetPgc)}). Team pGC
        is CC90-weighted. Total pGC is Supergroup. WTD is this Sunday through today from Looker.
        Focus is only for that calendar week and does not carry forward.
      </p>
    </div>
  )
}
