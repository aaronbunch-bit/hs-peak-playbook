import { useMemo, useState } from 'react'
import { comparePgcNullsLast, formatImpact, formatPgc, impactClass } from '../lib/pacer'
import type { RoutingRepRow } from '../lib/routing'
import type { LcCurves } from '../lib/settings'
import type { Slice } from '../lib/types'
import { PgcStatus } from './PgcStatus'

type SortKey = 'name' | 'manager' | 'pgc' | 'cc90' | 'impact'

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

type Props = {
  rows: RoutingRepRow[]
  selected: string | null
  slice: Slice
  targetPgc: number
  lcCurves: LcCurves
  periodLabel: string
  groupLabel: string
  onSelect: (name: string) => void
}

export function RoutingTable({
  rows,
  selected,
  slice,
  targetPgc,
  lcCurves,
  periodLabel,
  groupLabel,
  onSelect,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('pgc')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const sliceLabel = slice === 'hs-stem' ? 'HS-STEM' : slice === 'k12tp' ? 'K12 Test Prep' : 'Supergroup'

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'manager' ? 'asc' : 'desc')
    }
  }

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sortKey === 'name' || sortKey === 'manager') {
        const av = sortKey === 'name' ? a.name : (a.manager ?? '')
        const bv = sortKey === 'name' ? b.name : (b.manager ?? '')
        const cmp = av.localeCompare(bv)
        return cmp === 0 ? a.name.localeCompare(b.name) : dir * cmp
      }
      if (sortKey === 'cc90') {
        if (a.cc90 === b.cc90) return a.name.localeCompare(b.name)
        return dir * (a.cc90 - b.cc90)
      }
      if (sortKey === 'impact') {
        const cmp = comparePgcNullsLast(a.impact, b.impact, sortDir)
        return cmp === 0 ? a.name.localeCompare(b.name) : cmp
      }
      const cmp = comparePgcNullsLast(a.pgc, b.pgc, sortDir)
      return cmp === 0 ? a.name.localeCompare(b.name) : cmp
    })
  }, [rows, sortKey, sortDir])

  return (
    <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-900 text-left">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-900 px-4 py-3 font-medium sm:px-5">
                <SortBtn label="Rep" active={sortKey === 'name'} dir={sortDir} onClick={() => onSort('name')} />
              </th>
              <th className="px-3 py-3 font-medium">
                <SortBtn label="Manager" active={sortKey === 'manager'} dir={sortDir} onClick={() => onSort('manager')} />
              </th>
              <th className="px-3 py-3 text-right font-medium">
                <SortBtn label="pGC" active={sortKey === 'pgc'} dir={sortDir} align="right" onClick={() => onSort('pgc')} />
              </th>
              <th className="px-3 py-3 text-right font-medium">
                <SortBtn label="cc90" active={sortKey === 'cc90'} dir={sortDir} align="right" onClick={() => onSort('cc90')} />
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
                  <td className="px-3 py-3 text-right">
                    <PgcStatus
                      value={row.pgc}
                      atTarget={row.pgc != null && row.pgc >= row.expectedPgc}
                      expected={row.expectedPgc}
                      level={row.level}
                      targetPgc={targetPgc}
                      lcCurves={lcCurves}
                    />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                    {row.cc90 > 0 ? row.cc90.toLocaleString() : '—'}
                  </td>
                  <td className={`px-3 py-3 text-right tabular-nums ${impactClass(row.impact)}`}>
                    {formatImpact(row.impact)}
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                  No {groupLabel} people with {sliceLabel} volume for {periodLabel}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-400">
        {periodLabel} · {groupLabel}. Group block is sold ÷ HS/K12 cc90 for the bucket, not an average of
        averages. Impact is (pGC − the Rules target for this audience) × cc90, one decimal — same idea as
        dashboard 7699. Blanks sort last.
      </p>
    </div>
  )
}
