import { useMemo, useState } from 'react'
import {
  comparePgcNullsLast,
  formatBps,
  formatImpact,
  formatPgc,
  formatWeek,
  formatWeekday,
  pgcOnDate,
  type DailyRepRow,
} from '../lib/pacer'
import type { LcCurves } from '../lib/settings'
import type { Slice } from '../lib/types'
import { PgcStatus } from './PgcStatus'

type SortKey = 'name' | 'manager' | string

type Props = {
  rows: DailyRepRow[]
  selected: string | null
  slice: Slice
  targetPgc: number
  lcCurves: LcCurves
  onSelect: (name: string) => void
}

function Dod({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[10px] text-slate-400">—</span>
  const cls = value > 0 ? 'text-emerald-600' : value < 0 ? 'text-rose-600' : 'text-slate-500'
  return <span className={`text-[10px] tabular-nums ${cls}`}>{formatBps(value)}</span>
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

export function WtdTable({ rows, selected, slice, targetPgc, lcCurves, onSelect }: Props) {
  const days = rows[0]?.days.map((d) => d.date) ?? []
  const sliceLabel = slice === 'hs-stem' ? 'HS-STEM' : slice === 'k12tp' ? 'K12 Test Prep' : 'Supergroup'
  const defaultDay = days.at(-1) ?? 'name'
  const [sortKey, setSortKey] = useState<SortKey>(defaultDay)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const rollupKeys = sortKey === 'wtd' || sortKey === 'impact'
  const activeKey =
    days.includes(sortKey) || sortKey === 'name' || sortKey === 'manager' || rollupKeys ? sortKey : defaultDay

  const onSort = (key: SortKey) => {
    if (key === activeKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'manager' ? 'asc' : 'desc')
    }
  }

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      if (activeKey === 'name' || activeKey === 'manager') {
        const av = activeKey === 'name' ? a.name : (a.manager ?? '')
        const bv = activeKey === 'name' ? b.name : (b.manager ?? '')
        const cmp = av.localeCompare(bv)
        return cmp === 0 ? a.name.localeCompare(b.name) : dir * cmp
      }
      if (activeKey === 'wtd') {
        const cmp = comparePgcNullsLast(a.wtdPgc, b.wtdPgc, sortDir)
        return cmp === 0 ? a.name.localeCompare(b.name) : cmp
      }
      if (activeKey === 'impact') {
        const cmp = comparePgcNullsLast(a.wtdImpact, b.wtdImpact, sortDir)
        return cmp === 0 ? a.name.localeCompare(b.name) : cmp
      }
      const cmp = comparePgcNullsLast(pgcOnDate(a, activeKey), pgcOnDate(b, activeKey), sortDir)
      return cmp === 0 ? a.name.localeCompare(b.name) : cmp
    })
  }, [rows, activeKey, sortDir])

  return (
    <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-900 text-left">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-900 px-4 py-3 font-medium sm:px-5">
                <SortBtn label="Rep" active={activeKey === 'name'} dir={sortDir} onClick={() => onSort('name')} />
              </th>
              <th className="px-3 py-3 font-medium">
                <SortBtn
                  label="Manager"
                  active={activeKey === 'manager'}
                  dir={sortDir}
                  onClick={() => onSort('manager')}
                />
              </th>
              <th className="border-l border-white/10 px-3 py-3 text-right font-medium">
                <SortBtn label="WTD" active={activeKey === 'wtd'} dir={sortDir} align="right" onClick={() => onSort('wtd')} />
              </th>
              <th className="px-3 py-3 text-right font-medium">
                <SortBtn
                  label="Impact WTD"
                  active={activeKey === 'impact'}
                  dir={sortDir}
                  align="right"
                  onClick={() => onSort('impact')}
                />
              </th>
              {days.map((date) => (
                <th key={date} className="px-3 py-3 text-right font-medium">
                  <SortBtn
                    label={formatWeekday(date)}
                    active={activeKey === date}
                    dir={sortDir}
                    align="right"
                    onClick={() => onSort(date)}
                  />
                  <div className="text-[10px] font-medium text-slate-400">{formatWeek(date)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const isSel = selected === row.name
              return (
                <tr
                  key={row.name}
                  onClick={() => onSelect(row.name)}
                  className={`cursor-pointer border-b border-slate-100 transition last:border-0 ${
                    isSel ? 'bg-sky-50' : i % 2 === 1 ? 'bg-slate-50/80' : 'bg-white'
                  } hover:bg-indigo-50/70`}
                >
                  <td className="sticky left-0 z-10 w-px whitespace-nowrap bg-inherit px-4 py-3 sm:px-5">
                    <div className="text-[15px] font-semibold text-slate-900">{row.name}</div>
                    <div className="text-xs text-slate-400">
                      {row.level ?? 'Unknown'} · expect {formatPgc(row.expectedPgc)}
                    </div>
                  </td>
                  <td className="w-px whitespace-nowrap px-3 py-3 text-slate-600">{row.manager ?? '—'}</td>
                  <td className="border-l border-slate-100 px-3 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <PgcStatus
                        value={row.wtdPgc}
                        atTarget={row.wtdPgc != null && row.wtdPgc >= row.expectedPgc}
                        expected={row.expectedPgc}
                        level={row.level}
                        targetPgc={targetPgc}
                        lcCurves={lcCurves}
                      />
                      <div className="text-[10px] text-slate-400">
                        {row.wtdCc90 == null ? '—' : `${row.wtdCc90.toLocaleString()} cc90`}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatImpact(row.wtdImpact)}</td>
                  {row.days.map((day) => (
                    <td key={day.date} className="px-3 py-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <PgcStatus
                          value={day.pgc}
                          atTarget={day.pgc != null && day.pgc >= row.expectedPgc}
                          expected={row.expectedPgc}
                          level={row.level}
                          targetPgc={targetPgc}
                          lcCurves={lcCurves}
                        />
                        <div className="text-[10px] text-slate-400">
                          {day.cc90 == null ? '—' : `${day.cc90.toLocaleString()} cc90`}
                        </div>
                        <Dod value={day.dod} />
                      </div>
                    </td>
                  ))}
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={Math.max(days.length + 4, 5)} className="px-5 py-12 text-center text-slate-500">
                  No High School reps with {sliceLabel} volume this week.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-400">
        Click a day to sort by that day’s pGC. WTD is this Sunday through today; Impact WTD is Closed Client Count
        for the same window. Blanks stay at the bottom in both directions. DoD is that day’s pGC minus the prior
        calendar day (bps). Empty days are —.
      </p>
    </div>
  )
}
