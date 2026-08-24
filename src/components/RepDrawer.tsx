import { formatBps, formatPgc, formatWeek } from '../lib/pacer'
import { FOCUS_SLICES, SLICE_LABELS, SLICE_SHORT } from '../lib/slices'
import type { FocusLogEntry, RepRow, Slice } from '../lib/types'
import { PgcStatus } from './PgcStatus'

type Props = {
  row: RepRow | null
  focusedSlices: Slice[]
  lastFocusWeek: string | null
  suggestedReasons: string[]
  focusWeek: string
  wtdAsOf: string | null
  slice: Slice
  note: string
  noteHistory: Array<{ week: string; text: string }>
  onClose: () => void
  onToggleFocus: (slice: Slice) => void
  onNoteChange: (text: string) => void
}

function Sparkline({
  values,
  target,
}: {
  values: Array<number | null>
  target: number
}) {
  const nums = values.filter((v): v is number => v != null)
  const w = 320
  const h = 96
  const pad = 8
  if (nums.length === 0) {
    return <div className="flex h-24 items-center text-sm text-slate-400">No weekly pGC yet.</div>
  }
  const min = Math.min(target, ...nums, 0)
  const max = Math.max(target, ...nums, 0.3)
  const span = max - min || 1
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(values.length - 1, 1)
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2)
  const pts = values
    .map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
    .filter(Boolean)
    .join(' ')
  const ty = y(target)

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" role="img" aria-label="pGC sparkline">
      <line x1={pad} x2={w - pad} y1={ty} y2={ty} stroke="#c4b5fd" strokeDasharray="4 4" strokeWidth="1" />
      <text x={w - pad} y={Math.max(12, ty - 4)} textAnchor="end" className="fill-violet-400" fontSize="10">
        {(target * 100).toFixed(1)}%
      </text>
      <polyline fill="none" stroke="url(#pgcLine)" strokeWidth="2.5" points={pts} strokeLinejoin="round" />
      {values.map((v, i) =>
        v == null ? null : (
          <circle key={i} cx={x(i)} cy={y(v)} r="3.2" fill={v >= target ? '#059669' : '#e11d8a'} />
        ),
      )}
      <defs>
        <linearGradient id="pgcLine" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#e11d8a" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function RepDrawer({
  row,
  focusedSlices,
  lastFocusWeek,
  suggestedReasons,
  focusWeek,
  wtdAsOf,
  slice,
  note,
  noteHistory,
  onClose,
  onToggleFocus,
  onNoteChange,
}: Props) {
  if (!row) return null

  const chrono = [...row.weeks].reverse()
  const newestFirst = row.weeks
  const focused = focusedSlices.includes(slice)
  const pastNotes = noteHistory.filter((n) => n.week !== focusWeek)

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" className="absolute inset-0 bg-slate-900/25" aria-label="Close" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-400 uppercase">Rep detail</p>
            <h2 className="text-xl font-semibold text-slate-900">{row.name}</h2>
            <p className="text-sm text-slate-500">
              {row.manager ?? 'No manager'} · {row.level ?? 'Level unknown'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2.5 py-1 text-sm text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Last week</p>
              <div className="mt-1">
                <PgcStatus value={row.pgc} atTarget={row.atTarget} expected={row.expectedPgc} size="lg" />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {row.level ?? 'Unknown'} expect {formatPgc(row.expectedPgc)}
              </p>
            </div>
            <div className="rounded-2xl bg-sky-50 p-3 ring-1 ring-sky-100">
              <p className="text-xs font-semibold tracking-wide text-sky-700 uppercase">WTD</p>
              <div className="mt-1">
                <PgcStatus value={row.wtdPgc} atTarget={row.wtdAtTarget} expected={row.expectedPgc} size="lg" />
              </div>
              <p className="text-[11px] text-slate-400">
                {row.wtdPgc == null
                  ? 'Needs Looker · this Sunday → today'
                  : `${row.wtdCc90 ?? '—'} cc90${wtdAsOf ? ` · as of ${formatWeek(wtdAsOf)}` : ''}`}
              </p>
              {row.wtdVsLast != null && (
                <p className="text-xs text-slate-500">vs last week {formatBps(row.wtdVsLast)}</p>
              )}
            </div>
          </div>

          {suggestedReasons.length > 0 && (
            <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Suggested because {suggestedReasons.join(' · ')}
            </p>
          )}

          <div className="mb-4">
            <p className="text-xs text-slate-500">
              Focus is per audience for week of {formatWeek(focusWeek)}. Next Sunday these tags clear.
              {lastFocusWeek && !focused ? ` Last ${SLICE_SHORT[slice]} tag ${formatWeek(lastFocusWeek)}.` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FOCUS_SLICES.map((s) => {
                const on = focusedSlices.includes(s)
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onToggleFocus(s)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      on
                        ? 'bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {on ? `${SLICE_SHORT[s]} focus` : `Mark ${SLICE_SHORT[s]}`}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
            <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Closed weeks · oldest → newest
            </p>
            <Sparkline values={chrono.map((w) => w.pgc)} target={row.expectedPgc} />
          </div>

          <ul className="mt-4 space-y-2">
            {newestFirst.map((w) => (
              <li
                key={w.week}
                className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">Week of {formatWeek(w.week)}</p>
                  <p className="text-xs text-slate-400">
                    cc90 {w.cc90 == null ? '—' : w.cc90.toLocaleString()}
                    {w.mix != null
                      ? ` · ${(w.mix * 100).toFixed(0)}% ${slice === 'supergroup' ? 'HS' : 'mix'}`
                      : ''}
                  </p>
                  {(w.hsPgc != null || w.k12Pgc != null) && (
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      HS {formatPgc(w.hsPgc)} ({w.hsCc90 ?? 0}) · K12 {formatPgc(w.k12Pgc)} ({w.k12Cc90 ?? 0})
                      {w.totalPgc != null ? ` · Super ${formatPgc(w.totalPgc)}` : ''}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <PgcStatus
                    value={w.pgc}
                    atTarget={w.pgc != null && w.pgc >= row.expectedPgc}
                    expected={row.expectedPgc}
                  />
                  <p
                    className={`text-xs tabular-nums ${
                      w.deltaWow == null
                        ? 'text-slate-400'
                        : w.deltaWow >= 0.03
                          ? 'text-emerald-600'
                          : w.deltaWow <= -0.03
                            ? 'text-rose-600'
                            : 'text-slate-500'
                    }`}
                  >
                    {w.deltaWow == null
                      ? '—'
                      : w.deltaWow >= 0.03
                        ? `▲ ${formatBps(w.deltaWow)}`
                          : w.deltaWow <= -0.03
                            ? `▼ ${formatBps(w.deltaWow)}`
                            : formatBps(w.deltaWow)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Focus history</p>
            {row.focusHistory.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No focus weeks logged for this rep.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {row.focusHistory.map((f: FocusLogEntry) => (
                  <li key={`${f.week}-${f.rep}-${f.slice ?? f.type}`} className="text-sm text-slate-600">
                    <span className="font-medium">{formatWeek(f.week)}</span>
                    {f.slice ? ` · ${SLICE_LABELS[f.slice]}` : f.type ? ` · ${f.type}` : ''}
                    {f.week === focusWeek ? ' · this week' : ''}
                    {f.owner ? ` · ${f.owner}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Notes</p>
            <p className="mt-1 text-xs text-slate-400">
              Saved on week of {formatWeek(focusWeek)} — the week you write it, not the closed week you are
              browsing.
            </p>
            <textarea
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              rows={4}
              placeholder="Actions, coaching, next steps…"
              className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-fuchsia-200 placeholder:text-slate-400 focus:ring-2"
            />
            {pastNotes.length > 0 && (
              <ul className="mt-3 space-y-2">
                {pastNotes.map((n) => (
                  <li key={n.week} className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                      Week of {formatWeek(n.week)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{n.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
