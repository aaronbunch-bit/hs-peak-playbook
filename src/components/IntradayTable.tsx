import { useMemo, useState } from 'react'
import { comparePgcNullsLast, formatPgc, formatWeek } from '../lib/pacer'
import type { LcCurves } from '../lib/settings'
import type { IntradayRepRow } from '../lib/types'
import { PgcStatus } from './PgcStatus'

type SortKey = 'name' | 'manager' | 'hsPgc' | 'hsCc90' | 'k12Pgc' | 'k12Cc90' | 'superPgc' | 'superCc90'

function SortBtn({
  label,
  active,
  dir,
  align = 'right',
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
  rows: IntradayRepRow[]
  selected: string | null
  asOf: string
  targetHs: number
  targetK12: number
  targetSuper: number
  lcCurves: LcCurves
  onSelect: (name: string) => void
}

export function IntradayTable({
  rows,
  selected,
  asOf,
  targetHs,
  targetK12,
  targetSuper,
  lcCurves,
  onSelect,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('superPgc')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'manager' || key.endsWith('Pgc') ? 'asc' : 'desc')
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
      if (sortKey === 'hsCc90' || sortKey === 'k12Cc90' || sortKey === 'superCc90') {
        if (a[sortKey] === b[sortKey]) return a.name.localeCompare(b.name)
        return dir * (a[sortKey] - b[sortKey])
      }
      const cmp = comparePgcNullsLast(a[sortKey], b[sortKey], sortDir)
      return cmp === 0 ? a.name.localeCompare(b.name) : cmp
    })
  }, [rows, sortKey, sortDir])

  return (
    <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-900 text-left">
            <tr>
              <th rowSpan={2} className="sticky left-0 z-10 bg-slate-900 px-4 py-3 font-medium align-bottom sm:px-5">
                <SortBtn label="Rep" active={sortKey === 'name'} dir={sortDir} align="left" onClick={() => onSort('name')} />
              </th>
              <th rowSpan={2} className="px-3 py-3 font-medium align-bottom">
                <SortBtn
                  label="Manager"
                  active={sortKey === 'manager'}
                  dir={sortDir}
                  align="left"
                  onClick={() => onSort('manager')}
                />
              </th>
              <th colSpan={2} className="border-l border-white/10 px-3 py-2 text-center text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
                HS
              </th>
              <th colSpan={2} className="border-l border-white/10 px-3 py-2 text-center text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
                K12
              </th>
              <th colSpan={2} className="border-l border-white/10 px-3 py-2 text-center text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
                Supergroup
              </th>
            </tr>
            <tr>
              <th className="border-l border-white/10 px-3 py-2 text-right font-medium">
                <SortBtn label="pGC" active={sortKey === 'hsPgc'} dir={sortDir} onClick={() => onSort('hsPgc')} />
              </th>
              <th className="px-3 py-2 text-right font-medium">
                <SortBtn label="cc90" active={sortKey === 'hsCc90'} dir={sortDir} onClick={() => onSort('hsCc90')} />
              </th>
              <th className="border-l border-white/10 px-3 py-2 text-right font-medium">
                <SortBtn label="pGC" active={sortKey === 'k12Pgc'} dir={sortDir} onClick={() => onSort('k12Pgc')} />
              </th>
              <th className="px-3 py-2 text-right font-medium">
                <SortBtn label="cc90" active={sortKey === 'k12Cc90'} dir={sortDir} onClick={() => onSort('k12Cc90')} />
              </th>
              <th className="border-l border-white/10 px-3 py-2 text-right font-medium">
                <SortBtn label="pGC" active={sortKey === 'superPgc'} dir={sortDir} onClick={() => onSort('superPgc')} />
              </th>
              <th className="px-3 py-2 text-right font-medium">
                <SortBtn label="cc90" active={sortKey === 'superCc90'} dir={sortDir} onClick={() => onSort('superCc90')} />
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
                      {row.level ?? 'Unknown'} · Super expect {formatPgc(row.expectedSuper)}
                    </div>
                  </td>
                  <td className="w-px whitespace-nowrap px-3 py-3 text-slate-600">{row.manager ?? '—'}</td>
                  <td className="border-l border-slate-100 px-3 py-3 text-right">
                    <PgcStatus
                      value={row.hsPgc}
                      atTarget={row.hsPgc != null && row.hsPgc >= row.expectedHs}
                      expected={row.expectedHs}
                      level={row.level}
                      targetPgc={targetHs}
                      lcCurves={lcCurves}
                    />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                    {row.hsCc90 > 0 ? row.hsCc90.toLocaleString() : '—'}
                  </td>
                  <td className="border-l border-slate-100 px-3 py-3 text-right">
                    <PgcStatus
                      value={row.k12Pgc}
                      atTarget={row.k12Pgc != null && row.k12Pgc >= row.expectedK12}
                      expected={row.expectedK12}
                      level={row.level}
                      targetPgc={targetK12}
                      lcCurves={lcCurves}
                    />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                    {row.k12Cc90 > 0 ? row.k12Cc90.toLocaleString() : '—'}
                  </td>
                  <td className="border-l border-slate-100 px-3 py-3 text-right">
                    <PgcStatus
                      value={row.superPgc}
                      atTarget={row.superPgc != null && row.superPgc >= row.expectedSuper}
                      expected={row.expectedSuper}
                      level={row.level}
                      targetPgc={targetSuper}
                      lcCurves={lcCurves}
                    />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                    {row.superCc90 > 0 ? row.superCc90.toLocaleString() : '—'}
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-slate-500">
                  No Peak primary people with HS/K12 CC90 yet today.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-400">
        Today so far{asOf ? ` · ${formatWeek(asOf)}` : ''}. Peak primary only. HS and K12 are Looker Audience
        (Sales); Super is those two combined (sold ÷ cc90). Default sort is Super pGC low to high. Expert CC90
        calls, same tag exclusions as look 26569.
      </p>
    </div>
  )
}
