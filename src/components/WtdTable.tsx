import { formatBps, formatPgc, formatWeek, formatWeekday, type DailyRepRow } from '../lib/pacer'
import type { Slice } from '../lib/types'
import { PgcStatus } from './PgcStatus'

type Props = {
  rows: DailyRepRow[]
  selected: string | null
  slice: Slice
  onSelect: (name: string) => void
}

function Dod({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[10px] text-slate-400">—</span>
  const cls = value > 0 ? 'text-emerald-600' : value < 0 ? 'text-rose-600' : 'text-slate-500'
  return <span className={`text-[10px] tabular-nums ${cls}`}>{formatBps(value)}</span>
}

export function WtdTable({ rows, selected, slice, onSelect }: Props) {
  const days = rows[0]?.days.map((d) => d.date) ?? []
  const sliceLabel = slice === 'hs-stem' ? 'HS-STEM' : slice === 'k12tp' ? 'K12 Test Prep' : 'Supergroup'

  return (
    <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-900 text-left">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-900 px-4 py-3 font-medium sm:px-5">
                <span className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">Rep</span>
              </th>
              <th className="px-3 py-3 font-medium">
                <span className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">Manager</span>
              </th>
              {days.map((date) => (
                <th key={date} className="px-3 py-3 text-right font-medium">
                  <div className="text-[11px] font-semibold tracking-wide text-white uppercase">
                    {formatWeekday(date)}
                  </div>
                  <div className="text-[10px] font-medium text-slate-400">{formatWeek(date)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
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
                  {row.days.map((day) => (
                    <td key={day.date} className="px-3 py-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <PgcStatus
                          value={day.pgc}
                          atTarget={day.pgc != null && day.pgc >= row.expectedPgc}
                          expected={row.expectedPgc}
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={Math.max(days.length + 2, 3)} className="px-5 py-12 text-center text-slate-500">
                  No High School reps with {sliceLabel} volume this week.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-400">
        WTD is this Sunday through today. Each day is pGC for {sliceLabel} on that date. DoD is that day’s pGC minus
        the prior calendar day (bps). Roster is High School Peak by name. Empty days are —.
      </p>
    </div>
  )
}
