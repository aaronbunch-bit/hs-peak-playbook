import type { ReactNode } from 'react'
import type { Cohort, RoutingPeriod, Slice, Staffing } from '../lib/types'
import { staffingAllowed, type AppTab } from '../lib/hash'
import { addDays, toIsoDate } from '../lib/calendar'
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

const ROUTING_PRESETS: { id: RoutingPeriod; label: string }[] = [
  { id: 'yesterday', label: 'Yday' },
  { id: 'wtd', label: 'WTD' },
  { id: 'week', label: 'Last wk' },
  { id: 'mtd', label: 'MTD' },
  { id: 'custom', label: 'Custom' },
]

const DATE_INPUT =
  'h-[30px] rounded-lg bg-white px-2 text-xs font-medium text-slate-700 ring-1 ring-slate-200/90'

type Props = {
  tab: AppTab
  slice: Slice
  cohort: Cohort
  staffing: Staffing
  managers: string[]
  manager: string | null
  weeks: string[]
  weekCursor: number
  targets: Targets
  hiddenCount: number
  onTab: (tab: AppTab) => void
  onSlice: (slice: Slice) => void
  onCohort: (cohort: Cohort) => void
  onManager: (manager: string | null) => void
  onStaffing: (value: Staffing) => void
  onWeekCursor: (index: number) => void
  onRestoreHidden: () => void
  onOpenSettings: () => void
  onRefresh: () => void
  refreshing?: boolean
  updatedAt?: number | null
  routingPeriod?: RoutingPeriod
  routingStart?: string
  routingEnd?: string
  onRoutingPeriod?: (period: RoutingPeriod) => void
  onRoutingRange?: (start: string, end: string) => void
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
  weekCursor,
  targets,
  hiddenCount,
  onTab,
  onSlice,
  onCohort,
  onManager,
  onStaffing,
  onWeekCursor,
  onRestoreHidden,
  onOpenSettings,
  onRefresh,
  refreshing = false,
  updatedAt = null,
  routingPeriod = 'yesterday',
  routingStart,
  routingEnd,
  onRoutingPeriod,
  onRoutingRange,
}: Props) {
  const showStaffing = staffingAllowed(slice)
  const wtdWeek = weekCursor === 0
  const closedIndex = wtdWeek ? 0 : Math.max(weekCursor - 1, 0)
  const selectedWeek = weeks[closedIndex]
  const oldestCursor = weeks.length
  const activeTarget = targetForSlice(slice, targets)
  const playbook = tab === 'playbook' || tab === 'wtd'
  const sliceShort = slice === 'hs-stem' ? 'HS' : slice === 'k12tp' ? 'K12' : 'SG'
  const today = toIsoDate(new Date())
  const minDate = addDays(today, -365)
  const rangeStart = routingStart ?? today
  const rangeEnd = routingEnd ?? today

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
              <button type="button" className="nav-tab" data-on={tab === 'playbook' || tab === 'wtd'} onClick={() => onTab('playbook')}>
                Playbook
              </button>
              <button
                type="button"
                className="nav-tab"
                data-on={tab === 'intraday'}
                title="Today so far · routing buckets · HS, K12, and Super"
                onClick={() => onTab('intraday')}
              >
                Intraday
              </button>
              <button
                type="button"
                className="nav-tab"
                data-on={tab === 'routing'}
                title="HS-STEM and K12 Test Prep volume by staffing pool, not just Peak"
                onClick={() => onTab('routing')}
              >
                Routing
              </button>
              <button type="button" className="nav-tab" data-on={tab === 'focus'} onClick={() => onTab('focus')}>
                Focus
              </button>
              <button type="button" className="nav-tab" data-on={tab === 'roster'} onClick={() => onTab('roster')}>
                Roster
              </button>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {updatedAt != null && !refreshing && (
              <span className="hidden text-[11px] font-medium text-slate-400 sm:inline">
                Updated {new Date(updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-busy={refreshing}
              title="Reload Looker data for this view"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-700"
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 8a5.5 5.5 0 1 1-1.4-3.6M13.5 8V3.5M13.5 8H9"
                />
              </svg>
              {refreshing ? 'Refreshing…' : 'Refresh'}
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

        {playbook && (
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

            <Field label="Week">
              <div className="flex items-center rounded-lg bg-slate-100/80 p-0.5">
                <button
                  type="button"
                  className="seg-btn px-2 py-1 text-xs"
                  aria-label="Older week"
                  disabled={weekCursor >= oldestCursor}
                  onClick={() => onWeekCursor(Math.min(weekCursor + 1, oldestCursor))}
                >
                  ‹
                </button>
                <span
                  className="min-w-18 px-2 text-center text-xs font-semibold text-slate-800"
                  title={wtdWeek ? 'In-progress week · Sunday → today' : 'Closed Sunday week'}
                >
                  {wtdWeek ? 'WTD' : selectedWeek ? formatWeek(selectedWeek) : '—'}
                </span>
                <button
                  type="button"
                  className="seg-btn px-2 py-1 text-xs"
                  aria-label="Newer week"
                  disabled={wtdWeek}
                  onClick={() => onWeekCursor(Math.max(weekCursor - 1, 0))}
                >
                  ›
                </button>
              </div>
            </Field>

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

        {tab === 'intraday' && (
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
            <Field label="Window">
              <span className="h-[30px] inline-flex items-center rounded-lg bg-slate-100 px-2.5 text-xs font-semibold text-slate-800">
                Today so far
              </span>
            </Field>
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
            <p className="pb-1 text-xs text-slate-500">
              Click a bucket. Cross-trained follows Overflow Configs chips for this audience.
            </p>
          </div>
        )}

        {tab === 'routing' && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl surface px-3.5 py-2.5">
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

            <Field label="Period">
              <div className="flex flex-wrap items-center gap-2">
                <Seg>
                  {ROUTING_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="seg-btn px-2.5 py-1 text-xs"
                      data-on={routingPeriod === preset.id}
                      onClick={() => onRoutingPeriod?.(preset.id)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </Seg>
                {routingPeriod === 'custom' && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={rangeStart}
                      min={minDate}
                      max={today}
                      onChange={(e) => onRoutingRange?.(e.target.value, rangeEnd)}
                      className={DATE_INPUT}
                      aria-label="From date"
                    />
                    <span className="text-xs text-slate-400">–</span>
                    <input
                      type="date"
                      value={rangeEnd}
                      min={minDate}
                      max={today}
                      onChange={(e) => onRoutingRange?.(rangeStart, e.target.value)}
                      className={DATE_INPUT}
                      aria-label="To date"
                    />
                  </div>
                )}
              </div>
            </Field>

            <div className="ml-auto">
              <button
                type="button"
                onClick={onOpenSettings}
                className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white"
                title="LC4 pGC bar. Unknown LC uses this bar."
              >
                {sliceShort} {formatPgc(activeTarget)}
              </button>
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
