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
  compareWow: boolean
  targets: Targets
  onTab: (tab: AppTab) => void
  onSlice: (slice: Slice) => void
  onCohort: (cohort: Cohort) => void
  onManager: (manager: string | null) => void
  onStaffing: (value: Staffing) => void
  onWeekIndex: (index: number) => void
  onCompareWow: (value: boolean) => void
  onOpenSettings: () => void
  onRefresh: () => void
}

function Seg({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 rounded-full bg-slate-100/90 p-0.5 ring-1 ring-slate-200/70">{children}</div>
  )
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
  compareWow,
  targets,
  onTab,
  onSlice,
  onCohort,
  onManager,
  onStaffing,
  onWeekIndex,
  onCompareWow,
  onOpenSettings,
  onRefresh,
}: Props) {
  const showStaffing = staffingAllowed(slice)
  const selectedWeek = weeks[weekIndex]
  const activeTarget = targetForSlice(slice, targets)
  const playbook = tab === 'playbook'

  return (
    <header className="sticky top-0 z-20 border-b border-white/60 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-2.5 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              <span className="title-gradient">HS Peak</span> Playbook
            </h1>
            <Seg>
              <button
                type="button"
                className="seg-btn px-3 py-1 text-xs"
                data-on={tab === 'playbook'}
                onClick={() => onTab('playbook')}
              >
                Playbook
              </button>
              <button
                type="button"
                className="seg-btn px-3 py-1 text-xs"
                data-on={tab === 'roster'}
                onClick={() => onTab('roster')}
              >
                Roster
              </button>
            </Seg>
            {playbook && (
              <div className="flex items-center rounded-full bg-slate-100/90 p-0.5 ring-1 ring-slate-200/70">
                <button
                  type="button"
                  className="seg-btn px-2.5 py-1 text-xs"
                  aria-label="Older week"
                  disabled={weekIndex >= weeks.length - 1}
                  onClick={() => onWeekIndex(Math.min(weekIndex + 1, weeks.length - 1))}
                >
                  ‹
                </button>
                <span className="min-w-16 px-1.5 text-center text-xs font-semibold text-slate-800">
                  {selectedWeek ? formatWeek(selectedWeek) : '—'}
                </span>
                <button
                  type="button"
                  className="seg-btn px-2.5 py-1 text-xs"
                  aria-label="Newer week"
                  disabled={weekIndex <= 0}
                  onClick={() => onWeekIndex(Math.max(weekIndex - 1, 0))}
                >
                  ›
                </button>
              </div>
            )}
            {playbook && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                title="LC4 pGC bar. LC1–3 are a percent of this — edit in Rules."
              >
                {slice === 'hs-stem' ? 'HS' : slice === 'k12tp' ? 'K12' : 'Super'} {formatPgc(activeTarget)}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {playbook && (
              <button
                type="button"
                className="seg-btn px-2.5 py-1 text-xs ring-1 ring-slate-200"
                data-on={compareWow}
                onClick={() => onCompareWow(!compareWow)}
                style={
                  compareWow
                    ? { background: 'linear-gradient(90deg,#38bdf8,#7c3aed)', color: 'white', border: 'none' }
                    : { background: 'white' }
                }
              >
                WoW
              </button>
            )}
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-800"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-800"
            >
              Rules
            </button>
          </div>
        </div>

        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-0.5">
          {playbook && (
            <Seg>
              {SLICES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="seg-btn px-3 py-1 text-xs"
                  data-on={slice === s.id}
                  onClick={() => onSlice(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </Seg>
          )}

          {playbook && showStaffing && (
            <Seg>
              <button
                type="button"
                className="seg-btn px-3 py-1 text-xs"
                data-on={staffing === 'primary'}
                onClick={() => onStaffing('primary')}
              >
                Primary
              </button>
              <button
                type="button"
                className="seg-btn px-3 py-1 text-xs"
                data-on={staffing === 'cross-train'}
                onClick={() => onStaffing('cross-train')}
              >
                Cross Train
              </button>
            </Seg>
          )}

          {playbook && (
            <Seg>
              {COHORTS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="seg-btn px-3 py-1 text-xs"
                  data-on={cohort === c.id}
                  onClick={() => onCohort(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </Seg>
          )}

          <label className="flex shrink-0 items-center">
            <span className="sr-only">Manager</span>
            <select
              value={manager ?? ''}
              onChange={(e) => onManager(e.target.value || null)}
              className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
            >
              <option value="">All managers</option>
              {managers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </header>
  )
}
