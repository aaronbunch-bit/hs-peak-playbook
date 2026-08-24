import { formatPgc } from '../lib/pacer'
import { LC_LEVELS } from '../lib/roster'
import { expectedPgc, type LcCurves, type Targets } from '../lib/settings'
import type { RosterEntry } from '../lib/types'

type Props = {
  roster: RosterEntry[]
  manager: string | null
  targets: Targets
  lcCurves: LcCurves
  onSetLevel: (name: string, level: string | null) => void
}

export function RosterPage({ roster, manager, targets, lcCurves, onSetLevel }: Props) {
  const rows = [...roster]
    .filter((r) => !manager || r.manager === manager)
    .sort((a, b) => {
      const mgr = (a.manager ?? '').localeCompare(b.manager ?? '')
      if (mgr !== 0) return mgr
      return a.name.localeCompare(b.name)
    })
  const unknown = rows.filter((r) => !r.level).length

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Roster</h2>
          <p className="text-sm text-slate-500">
            Set Learning Curve for anyone on the Peak Playbook look. Expectations are that LC’s share of the HS, K12,
            and Super bars. Unknown uses the LC4 bar.
          </p>
        </div>
        <p className="text-xs font-medium text-slate-500">
          {rows.length} reps{unknown > 0 ? ` · ${unknown} missing LC` : ''}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/85 shadow-sm shadow-slate-200/80">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-50/90 text-left">
              <tr className="border-b border-slate-200/80">
                <th className="px-4 py-3 text-[11px] font-semibold tracking-wide text-slate-500 uppercase sm:px-5">
                  Rep
                </th>
                <th className="px-3 py-3 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Manager</th>
                <th className="px-3 py-3 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                  Learning Curve
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                  HS expect
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                  K12 expect
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold tracking-wide text-slate-500 uppercase sm:px-5">
                  Super expect
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-slate-900 sm:px-5">{row.name}</td>
                  <td className="px-3 py-2.5 text-slate-600">{row.manager ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <select
                      aria-label={`Learning Curve for ${row.name}`}
                      value={row.level ?? ''}
                      onChange={(e) => onSetLevel(row.name, e.target.value || null)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                        row.level
                          ? 'bg-white text-slate-800 ring-slate-200'
                          : 'bg-amber-50 text-amber-900 ring-amber-200'
                      }`}
                    >
                      <option value="">Unknown</option>
                      {LC_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {formatPgc(expectedPgc(targets.hs, row.level, lcCurves))}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {formatPgc(expectedPgc(targets.k12, row.level, lcCurves))}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 sm:px-5">
                    {formatPgc(expectedPgc(targets.super, row.level, lcCurves))}
                  </td>
                </tr>
              ))}
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
      </div>
    </div>
  )
}
