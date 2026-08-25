import type { ReactNode } from 'react'
import type { Cohort, Slice, Staffing } from '../lib/types'
import { staffingAllowed, type AppTab } from '../lib/hash'
import { formatPgc, formatWeek } from '../lib/pacer'
import { targetForSlice, type Targets } from '../lib/settings'

const SLICES: { id: Slice; label: string }[] = [
  { id: 'hs-stem', label: 'HS-STEM' },
  { id: 'k12tp', label: 'K12TP' },
  { id: 'supergroup', label: 'Supergroup' },
]

const COHORTS: { id: Cohort; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'lc1-3', label: 'LC1–3' },
  { id: 'lc4', label: 'LC4' },
]

type Props = {
  tab: AppTab
  slice: Slice
  cohort: Cohort
  staffing: Staffing
  managers: string[]
  manager: string | null
  weeks: string[]
  weekIndex: number
  targets: Targets
  hiddenCount: number
  onTab: (tab: AppTab) => void
  onSlice: (slice: Slice) => void
  onCohort: (cohort: Cohort) => void
  onManager: (manager: string | null) => void
  onStaffing: (value: Staffing) => void
  onWeekIndex: (index: number) => void
  onRestoreHidden: () => void
  onOpenSettings: () => void
  onRefresh: () => void
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-semibold tracking-[0.16em] text-slate-400 uppercase">{label}</span>
      {children}
    </div>
  )
}

function Seg({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">{children}</div>
}

export function FilterBar({
  tab,
  slice,
  cohort,
  staffing,
  managers,
  manager,
  weeks,
  weekIndex,
  targets,
  hiddenCount,
  onTab,
  onSlice,
  onCohort,
  onManager,
  onStaffing,
  onWeekIndex,
  onRestoreHidden,
  onOpenSettings,
  onRefresh,
}: Props) {
  const showStaffing = staffingAllowed(slice)
  const selectedWeek = weeks[weekIndex]
  const activeTarget = targetForSlice(slice, targets)
  const playbook = tab === 'playbook'
  const wtd = tab === 'wtd'
  const metrics = playbook || wtd
  const sliceShort = slice === 'hs-stem' ? 'HS' : slice === 'k12tp' ? 'K12' : 'SG'

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.18em] text-slate-400 uppercase">Varsity Tutors</p>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                HS <span className="title-gradient">Peak</span> Playbook
              </h1>
            </div>
            <nav className="flex items-end gap-3 border-l border-slate-200/80 pl-4" aria-label="Views">
              <button type="button" className="nav-tab" data-on={tab === 'playbook'} onClick={() => onTab('playbook')}>
                Playbook
              </button>
              <button type="button" className="nav-tab" data-on={tab === 'wtd'} onClick={() => onTab('wtd')}>
                WTD
              </button>
              <button type="button" className="nav-tab" data-on={tab === 'focus'} onClick={() => onTab('focus')}>
                Focus
              </button>
              <button type="button" className="nav-tab" data-on={tab === 'roster'} onClick={() => onTab('roster')}>
                Roster
              </button>
            </nav>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-white/80 hover:text-slate-800"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-white/80 hover:text-slate-800"
            >
              Rules
            </button>
          </div>
        </div>

        {metrics && (
          <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3 rounded-2xl surface px-3.5 py-3">
            <Field label="Audience">
              <Seg>
                {SLICES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="seg-btn px-2.5 py-1 text-xs"
                    data-on={slice === s.id}
                    onClick={() => onSlice(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </Seg>
            </Field>

            {showStaffing && (
              <Field label="Staffing">
                <Seg>
                  <button
                    type="button"
                    className="seg-btn px-2.5 py-1 text-xs"
                    data-on={staffing === 'primary'}
                    onClick={() => onStaffing('primary')}
                  >
                    Primary
                  </button>
                  <button
                    type="button"
                    className="seg-btn px-2.5 py-1 text-xs"
                    data-on={staffing === 'cross-train'}
                    onClick={() => onStaffing('cross-train')}
                  >
                    Cross Train
                  </button>
                </Seg>
              </Field>
            )}

            <Field label="Learning curve">
              <Seg>
                {COHORTS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="seg-btn px-2.5 py-1 text-xs"
                    data-on={cohort === c.id}
                    onClick={() => onCohort(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </Seg>
            </Field>

            {wtd && (
              <Field label="This week">
                <span className="inline-flex h-[30px] items-center text-xs font-semibold text-slate-800">
                  Sunday → today
                </span>
              </Field>
            )}

            {playbook && (
            <Field label="Closed week">
              <div className="flex items-center rounded-lg bg-slate-100/80 p-0.5">
                <button
                  type="button"
                  className="seg-btn px-2 py-1 text-xs"
                  aria-label="Older week"
                  disabled={weekIndex >= weeks.length - 1}
                  onClick={() => onWeekIndex(Math.min(weekIndex + 1, weeks.length - 1))}
                >
                  ‹
                </button>
                <span className="min-w-18 px-2 text-center text-xs font-semibold text-slate-800">
                  {selectedWeek ? formatWeek(selectedWeek) : '—'}
                </span>
                <button
                  type="button"
                  className="seg-btn px-2 py-1 text-xs"
                  aria-label="Newer week"
                  disabled={weekIndex <= 0}
                  onClick={() => onWeekIndex(Math.max(weekIndex - 1, 0))}
                >
                  ›
                </button>
              </div>
            </Field>
            )}

            <Field label="Manager">
              <select
                value={manager ?? ''}
                onChange={(e) => onManager(e.target.value || null)}
                className="h-[30px] rounded-lg bg-white px-2.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200/90"
              >
                <option value="">All managers</option>
                {managers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onOpenSettings}
                className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white"
                title="LC4 pGC bar. LC1–3 are a percent of this — edit in Rules."
              >
                {sliceShort} {formatPgc(activeTarget)}
              </button>
              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={onRestoreHidden}
                  className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200/80"
                >
                  {hiddenCount} hidden · Restore
                </button>
              )}
            </div>
          </div>
        )}

        {tab === 'focus' && (
          <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2 rounded-2xl surface px-3.5 py-3">
            <Field label="Manager">
              <select
                value={manager ?? ''}
                onChange={(e) => onManager(e.target.value || null)}
                className="h-[30px] rounded-lg bg-white px-2.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200/90"
              >
                <option value="">All managers</option>
                {managers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="pb-1 text-xs text-slate-500">This week’s tags, grouped by the audience they belong to.</p>
          </div>
        )}

        {tab === 'roster' && (
          <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2 rounded-2xl surface px-3.5 py-3">
            <Field label="Manager">
              <select
                value={manager ?? ''}
                onChange={(e) => onManager(e.target.value || null)}
                className="h-[30px] rounded-lg bg-white px-2.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200/90"
              >
                <option value="">All managers</option>
                {managers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            {hiddenCount > 0 && (
              <p className="text-xs text-slate-500">
                {hiddenCount} hidden from playbook — restore per row, or{' '}
                <button type="button" className="font-semibold text-violet-600 hover:underline" onClick={onRestoreHidden}>
                  restore all
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
