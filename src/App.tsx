import { useEffect, useMemo, useState } from 'react'
import { FilterBar } from './components/FilterBar'
import { FocusList } from './components/FocusList'
import { KpiStrip } from './components/KpiStrip'
import { RepDrawer } from './components/RepDrawer'
import { RepTable, type SortKey } from './components/RepTable'
import { RosterPage } from './components/RosterPage'
import { RoutingBlocks } from './components/RoutingBlocks'
import { RoutingTable } from './components/RoutingTable'
import { SettingsPanel } from './components/SettingsPanel'
import { WtdTable } from './components/WtdTable'
import { lastCompleteWeekStart, sundayWeekStart, yesterday } from './lib/calendar'
import {
  focusedThisWeek,
  historyFromStore,
  lastFocusWeekBefore,
  loadFocus,
  namesForWeek,
  saveFocus,
  slicesForRep,
  toggleFocus,
} from './lib/focus'
import { loadNotes, noteFor, notesForRep, saveNotes, setNote } from './lib/notes'
import { readHash, staffingAllowed, weekCursorFromHash, writeHash, type AppTab } from './lib/hash'
import { fetchPacerData, SLICE_LOOKER_FILTERS } from './lib/looker'
import { buildDailyRows, buildRows, formatWeek, formatWeekRange, mergeFocusLog, weekKpis, wtdKpis } from './lib/pacer'
import {
  applyRosterLevels,
  loadRosterLevels,
  saveRosterLevels,
  setRosterLevel,
} from './lib/roster'
import { hideRep, loadHiddenReps, saveHiddenReps, showRep } from './lib/hidden'
import { loadSettings, saveSettings, targetForSlice, type AppSettings } from './lib/settings'
import { suggestFocuses } from './lib/suggest'
import { ROUTING_GROUP_META } from './data/routingGroups'
import { buildRoutingRows, routingGroupStats, type RoutingRepRow } from './lib/routing'
import type { Cohort, PacerPayload, RepRow, RoutingGroup, RoutingPeriod, Slice, Staffing } from './lib/types'

function syntheticRepRow(row: RoutingRepRow): RepRow {
  return {
    name: row.name,
    level: row.level,
    manager: row.manager,
    pgc: row.pgc,
    cc90: row.cc90,
    mix: null,
    expectedPgc: row.expectedPgc,
    deltaWow: null,
    trend: null,
    atTarget: row.pgc != null && row.pgc >= row.expectedPgc,
    wtdPgc: null,
    wtdCc90: null,
    wtdVsLast: null,
    wtdAtTarget: false,
    weeks: [],
    focusHistory: [],
  }
}

export default function App() {
  const initial = readHash()
  const [tab, setTab] = useState<AppTab>(initial.tab === 'wtd' ? 'playbook' : initial.tab)
  const [slice, setSlice] = useState<Slice>(initial.slice)
  const [cohort, setCohort] = useState<Cohort>(initial.cohort)
  const [staffing, setStaffing] = useState<Staffing>(initial.staffing)
  const [manager, setManager] = useState<string | null>(initial.manager)
  const [payload, setPayload] = useState<PacerPayload | null>(null)
  const [weekCursor, setWeekCursor] = useState(initial.tab === 'wtd' || initial.week === 'wtd' ? 0 : 1)
  const [compareWow, setCompareWow] = useState(true)
  const [focus, setFocus] = useState(loadFocus)
  const [notes, setNotes] = useState(loadNotes)
  const [settings, setSettings] = useState(loadSettings)
  const [rosterLevels, setRosterLevels] = useState(loadRosterLevels)
  const [hiddenReps, setHiddenReps] = useState(loadHiddenReps)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('pgc')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [reload, setReload] = useState(0)
  const [routingPeriod, setRoutingPeriod] = useState<RoutingPeriod>(initial.routingPeriod)
  const [routingGroup, setRoutingGroup] = useState<RoutingGroup | null>(initial.routingGroup)

  const focusWeek = sundayWeekStart()
  const targetPgc = targetForSlice(slice, settings.targets)
  const wtdView = tab === 'playbook' && weekCursor === 0
  const closedWeekIndex = wtdView ? 0 : Math.max(weekCursor - 1, 0)
  const selectedWeek = payload?.weeks[closedWeekIndex] ?? null

  const livePayload = useMemo(() => {
    if (!payload) return null
    return {
      ...payload,
      roster: applyRosterLevels(payload.roster, rosterLevels).map((r) => ({
        ...r,
        workGroup: r.workGroup ?? 'High School',
      })),
      daily: payload.daily ?? [],
      dailyDays: payload.dailyDays ?? [],
      yesterdayDate: payload.yesterdayDate ?? yesterday(),
      yesterdayFacts: payload.yesterdayFacts ?? [],
      lastWeekStart: payload.lastWeekStart ?? lastCompleteWeekStart(),
      lastWeekFacts: payload.lastWeekFacts ?? [],
    }
  }, [payload, rosterLevels])

  const hiddenSet = useMemo(() => new Set(hiddenReps), [hiddenReps])

  const routingRowsAll = useMemo(() => {
    if (!livePayload) return []
    const facts = routingPeriod === 'week' ? livePayload.lastWeekFacts : livePayload.yesterdayFacts
    return buildRoutingRows(facts, slice, targetPgc, settings.lcCurves, livePayload.roster)
  }, [livePayload, routingPeriod, slice, targetPgc, settings.lcCurves])

  const routingRows = useMemo(
    () =>
      routingRowsAll
        .filter((r) => !manager || r.manager === manager)
        .filter((r) => r.routingGroup !== 'primary' || !hiddenSet.has(r.name)),
    [routingRowsAll, manager, hiddenSet],
  )

  const routingStats = useMemo(
    () => ROUTING_GROUP_META.map((meta) => routingGroupStats(routingRows, meta.id)),
    [routingRows],
  )

  const routingDetailRows = useMemo(
    () => (routingGroup ? routingRows.filter((r) => r.routingGroup === routingGroup) : []),
    [routingRows, routingGroup],
  )

  const managers = useMemo(() => {
    if (tab === 'routing') {
      const names = new Set(
        routingRowsAll.map((r) => r.manager).filter((name): name is string => Boolean(name)),
      )
      return [...names].sort((a, b) => a.localeCompare(b))
    }
    const names = new Set(
      (livePayload?.roster ?? []).map((r) => r.manager).filter((name): name is string => Boolean(name)),
    )
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [tab, routingRowsAll, livePayload])

  useEffect(() => {
    const onPlaybook = tab === 'playbook'
    const hashTab = onPlaybook && weekCursor === 0 ? 'wtd' : tab
    writeHash({
      slice,
      cohort,
      staffing,
      manager,
      tab: hashTab,
      week: onPlaybook && weekCursor > 1 && selectedWeek ? selectedWeek : onPlaybook && weekCursor === 0 ? 'wtd' : null,
      routingPeriod,
      routingGroup,
    })
  }, [slice, cohort, staffing, manager, tab, weekCursor, selectedWeek, routingPeriod, routingGroup])

  useEffect(() => {
    const onHash = () => {
      const next = readHash()
      setSlice(next.slice)
      setCohort(next.cohort)
      setStaffing(next.staffing)
      setManager(next.manager)
      setTab(next.tab === 'wtd' ? 'playbook' : next.tab)
      if (next.tab !== 'routing') {
        setWeekCursor(weekCursorFromHash(next.tab, next.week, payload?.weeks ?? []))
      }
      setRoutingPeriod(next.routingPeriod)
      setRoutingGroup(next.routingGroup)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [payload])

  useEffect(() => {
    let cancelled = false
    fetchPacerData(slice, staffingAllowed(slice) ? staffing : 'primary').then((data) => {
      if (!cancelled) {
        setPayload(data)
        setWeekCursor((c) => (c === 0 ? 0 : 1))
      }
    })
    return () => {
      cancelled = true
    }
  }, [slice, staffing, reload])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null)
        setSettingsOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const changeSlice = (next: Slice) => {
    setSlice(next)
    if (!staffingAllowed(next)) setStaffing('primary')
  }

  const focusedSet = useMemo(
    () => new Set(namesForWeek(focus, focusWeek, slice)),
    [focus, focusWeek, slice],
  )
  const kpiFocusWeek = wtdView || weekCursor === 1 ? focusWeek : (selectedWeek ?? focusWeek)
  const thatWeekFocusSet = useMemo(
    () => new Set(namesForWeek(focus, kpiFocusWeek, slice)),
    [focus, kpiFocusWeek, slice],
  )

  const allRows = useMemo(() => {
    if (!livePayload || livePayload.empty) return []
    const withHistory = {
      ...livePayload,
      focusLog: mergeFocusLog(livePayload.focusLog, historyFromStore(focus)),
    }
    const built = buildRows(withHistory, cohort, targetPgc, {
      weekIndex: closedWeekIndex,
      staffing,
      lcCurves: settings.lcCurves,
    })
    return manager ? built.filter((r) => r.manager === manager) : built
  }, [livePayload, cohort, focus, targetPgc, closedWeekIndex, staffing, manager, settings.lcCurves])

  const dailyRows = useMemo(() => {
    if (!livePayload || livePayload.empty) return []
    const built = buildDailyRows(livePayload, cohort, targetPgc, {
      staffing,
      lcCurves: settings.lcCurves,
    })
    const scoped = manager ? built.filter((r) => r.manager === manager) : built
    return scoped
      .filter((r) => !hiddenSet.has(r.name))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [livePayload, cohort, targetPgc, staffing, manager, settings.lcCurves, hiddenSet])

  const visibleRows = useMemo(
    () => allRows.filter((r) => !hiddenSet.has(r.name)),
    [allRows, hiddenSet],
  )

  const priorRows = useMemo(() => {
    if (!livePayload || livePayload.empty || closedWeekIndex + 1 >= livePayload.weeks.length) return []
    const withHistory = {
      ...livePayload,
      focusLog: mergeFocusLog(livePayload.focusLog, historyFromStore(focus)),
    }
    const built = buildRows(withHistory, cohort, targetPgc, {
      weekIndex: closedWeekIndex + 1,
      staffing,
      lcCurves: settings.lcCurves,
    })
    const scoped = manager ? built.filter((r) => r.manager === manager) : built
    return scoped.filter((r) => !hiddenSet.has(r.name))
  }, [livePayload, cohort, focus, targetPgc, closedWeekIndex, staffing, manager, settings.lcCurves, hiddenSet])

  const priorWeek = livePayload?.weeks[closedWeekIndex + 1] ?? null
  const priorFocusSet = useMemo(
    () => new Set(priorWeek ? namesForWeek(focus, priorWeek, slice) : []),
    [focus, priorWeek],
  )

  const suggestions = useMemo(
    () => suggestFocuses(visibleRows, settings.suggest),
    [visibleRows, settings.suggest],
  )
  const suggestedSet = useMemo(() => new Set(suggestions.map((s) => s.name)), [suggestions])
  const suggestedReasons = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const s of suggestions) map.set(s.name, s.reasons)
    return map
  }, [suggestions])

  const catalogRows = useMemo(() => {
    if (!livePayload || livePayload.empty) return []
    const withHistory = {
      ...livePayload,
      focusLog: mergeFocusLog(livePayload.focusLog, historyFromStore(focus)),
    }
    return buildRows(withHistory, 'all', targetPgc, {
      weekIndex: 0,
      staffing,
      lcCurves: settings.lcCurves,
    })
  }, [livePayload, focus, targetPgc, staffing, settings.lcCurves])

  const lastFocusMap = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const row of [...visibleRows, ...catalogRows]) {
      if (!map.has(row.name)) {
        map.set(row.name, lastFocusWeekBefore(focus, row.name, focusWeek, slice))
      }
    }
    return map
  }, [visibleRows, catalogRows, focus, focusWeek, slice])

  const rows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...visibleRows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (sortKey === 'name' || sortKey === 'manager') {
        return dir * String(av ?? '').localeCompare(String(bv ?? ''))
      }
      if (av == null && bv == null) return a.name.localeCompare(b.name)
      if (av == null) return 1
      if (bv == null) return -1
      if (av === bv) return a.name.localeCompare(b.name)
      return dir * (Number(av) - Number(bv))
    })
  }, [visibleRows, sortKey, sortDir])

  const focusSlices = useMemo(() => {
    const map = new Map<string, Slice[]>()
    const names = new Set([...visibleRows.map((r) => r.name), ...focusedThisWeek(focus, focusWeek).map((f) => f.name)])
    for (const name of names) map.set(name, slicesForRep(focus, name, focusWeek))
    return map
  }, [visibleRows, focus, focusWeek])

  const focusItems = useMemo(() => {
    const byName = new Map(catalogRows.map((r) => [r.name, r]))
    const rosterByName = new Map((livePayload?.roster ?? []).map((r) => [r.name, r]))
    return focusedThisWeek(focus, focusWeek)
      .map(({ name, slices }) => {
        const row = byName.get(name)
        const roster = rosterByName.get(name)
        const latest = row?.weeks[0]
        return {
          name,
          manager: row?.manager ?? roster?.manager ?? null,
          level: row?.level ?? roster?.level ?? null,
          slices,
          hsPgc: latest?.hsPgc ?? null,
          hsCc90: latest?.hsCc90 ?? null,
          k12Pgc: latest?.k12Pgc ?? null,
          k12Cc90: latest?.k12Cc90 ?? null,
          superPgc: latest?.totalPgc ?? null,
          note: noteFor(notes, latest?.week ?? focusWeek, name),
        }
      })
      .filter((item) => !manager || item.manager === manager)
  }, [catalogRows, livePayload, focus, focusWeek, notes, manager])

  const selectedRouting = routingDetailRows.find((r) => r.name === selected) ?? null
  const selectedRow =
    tab === 'routing'
      ? selectedRouting
        ? (catalogRows.find((r) => r.name === selectedRouting.name) ?? syntheticRepRow(selectedRouting))
        : null
      : (rows.find((r) => r.name === selected) ?? catalogRows.find((r) => r.name === selected) ?? null)
  const closedKpis = weekKpis(visibleRows, thatWeekFocusSet)
  const lastClosedFocusSet = useMemo(
    () => new Set(selectedWeek ? namesForWeek(focus, selectedWeek, slice) : []),
    [focus, selectedWeek, slice],
  )
  const priorKpis = wtdView
    ? weekKpis(visibleRows, lastClosedFocusSet)
    : priorRows.length
      ? weekKpis(priorRows, priorFocusSet)
      : null
  const wtdSummary = wtdKpis(visibleRows, dailyRows, focusedSet)
  const currentKpis = wtdView
    ? {
        teamPgc: wtdSummary.teamPgc,
        atTarget: wtdSummary.atTarget,
        improving: wtdSummary.improving,
        slipping: 0,
        focusCount: wtdSummary.focusCount,
        n: wtdSummary.n,
      }
    : closedKpis
  const wtdTeam = weekCursor === 1 ? wtdSummary.teamPgc : null

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'manager' || key === 'pgc' ? 'asc' : 'desc')
    }
  }

  const onToggleFocus = (name: string, audience: Slice = slice) => {
    const next = toggleFocus(focus, name, focusWeek, audience)
    setFocus(next)
    saveFocus(next)
  }

  const onNoteChange = (name: string, week: string, text: string) => {
    if (week !== focusWeek) return
    const next = setNote(notes, week, name, text)
    setNotes(next)
    saveNotes(next)
  }

  const onSettings = (next: AppSettings) => {
    setSettings(next)
    saveSettings(next)
  }

  const onSetLevel = (name: string, level: string | null) => {
    const next = setRosterLevel(rosterLevels, name, level)
    setRosterLevels(next)
    saveRosterLevels(next)
  }

  const persistHidden = (next: string[]) => {
    setHiddenReps(next)
    saveHiddenReps(next)
  }

  const onHideRep = (name: string) => {
    persistHidden(hideRep(hiddenReps, name))
    if (selected === name) setSelected(null)
  }

  const onShowRep = (name: string) => persistHidden(showRep(hiddenReps, name))
  const onRestoreHidden = () => persistHidden([])

  return (
    <div className="min-h-svh pb-16">
      <FilterBar
        tab={tab}
        slice={slice}
        cohort={cohort}
        staffing={staffing}
        managers={managers}
        manager={manager}
        weeks={livePayload?.weeks ?? []}
        weekCursor={weekCursor}
        targets={settings.targets}
        hiddenCount={hiddenReps.length}
        onTab={(next) => {
          setTab(next === 'wtd' ? 'playbook' : next)
          if (next === 'wtd') setWeekCursor(0)
          setSelected(null)
        }}
        onSlice={changeSlice}
        onCohort={setCohort}
        onManager={setManager}
        onStaffing={setStaffing}
        onWeekCursor={(next) => {
          setWeekCursor(next)
          setTab('playbook')
          setSelected(null)
        }}
        onRestoreHidden={onRestoreHidden}
        onOpenSettings={() => setSettingsOpen(true)}
        onRefresh={() => setReload((n) => n + 1)}
        routingPeriod={routingPeriod}
        yesterdayDate={livePayload?.yesterdayDate ?? yesterday()}
        lastWeekStart={livePayload?.lastWeekStart ?? lastCompleteWeekStart()}
        onRoutingPeriod={setRoutingPeriod}
      />

      <main className="mt-4 space-y-4">
        {!livePayload || livePayload.slice !== slice ? (
          <div className="mx-auto max-w-6xl px-4 text-sm text-slate-500 sm:px-6">Loading week…</div>
        ) : tab === 'focus' ? (
          livePayload.empty ? (
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <div className="rounded-2xl surface border-dashed px-6 py-12 text-center">
                <p className="text-lg font-semibold text-slate-800">Focus list</p>
                <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">{livePayload.emptyReason}</p>
              </div>
            </div>
          ) : (
            <FocusList
              week={focusWeek}
              items={focusItems}
              selected={selected}
              onSelect={setSelected}
              onToggle={onToggleFocus}
            />
          )
        ) : tab === 'roster' ? (
          <RosterPage
            roster={livePayload.roster}
            manager={manager}
            hidden={hiddenSet}
            targets={settings.targets}
            lcCurves={settings.lcCurves}
            onSetLevel={onSetLevel}
            onHide={onHideRep}
            onShow={onShowRep}
          />
        ) : tab === 'routing' ? (
          <>
            <p className="mx-auto max-w-6xl px-4 text-sm text-slate-500 sm:px-6">
              All HS-STEM and K12 Test Prep volume — not just Peak. Each block is clients sold ÷ that
              bucket’s cc90, not an average of averages. Click a group for the person list.
            </p>
            <RoutingBlocks
              stats={routingStats}
              selected={routingGroup}
              onSelect={(group) => {
                setRoutingGroup(group)
                setSelected(null)
              }}
            />
            {routingGroup && (
              <RoutingTable
                rows={routingDetailRows}
                selected={selected}
                slice={slice}
                targetPgc={targetPgc}
                lcCurves={settings.lcCurves}
                periodLabel={
                  routingPeriod === 'week'
                    ? formatWeekRange(livePayload.lastWeekStart)
                    : formatWeek(livePayload.yesterdayDate)
                }
                groupLabel={ROUTING_GROUP_META.find((m) => m.id === routingGroup)?.label ?? routingGroup}
                onSelect={setSelected}
              />
            )}
          </>
        ) : livePayload.empty ? (
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="rounded-2xl surface border-dashed px-6 py-12 text-center">
              <p className="text-lg font-semibold text-slate-800">
                {SLICE_LOOKER_FILTERS[slice].label}
                {staffingAllowed(slice) ? ` · ${staffing === 'cross-train' ? 'Cross Train' : 'Primary'}` : ''}
              </p>
              <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">{livePayload.emptyReason}</p>
            </div>
          </div>
        ) : wtdView ? (
          <>
            <KpiStrip
              mode="wtd"
              current={currentKpis}
              prior={priorKpis}
              compareWow={compareWow}
              targetPgc={targetPgc}
              wtdPgc={wtdSummary.teamPgc}
              wtdReady={visibleRows.some((r) => r.wtdPgc != null)}
              suggestedCount={suggestions.length}
              selectedWeekLabel="WTD"
              latestDayPgc={wtdSummary.latestDayPgc}
              latestDay={wtdSummary.latestDay}
              onCompareWow={setCompareWow}
            />
            <WtdTable
              rows={dailyRows}
              selected={selected}
              slice={slice}
              targetPgc={targetPgc}
              lcCurves={settings.lcCurves}
              onSelect={setSelected}
            />
          </>
        ) : (
          <>
            <KpiStrip
              current={currentKpis}
              prior={priorKpis}
              compareWow={compareWow}
              targetPgc={targetPgc}
              wtdPgc={wtdTeam}
              wtdReady={weekCursor === 1 && visibleRows.some((r) => r.wtdPgc != null)}
              suggestedCount={suggestions.length}
              selectedWeekLabel={selectedWeek ? formatWeek(selectedWeek) : '—'}
              onCompareWow={setCompareWow}
            />
            <RepTable
              rows={rows}
              focused={focusedSet}
              suggested={suggestedSet}
              suggestedReasons={suggestedReasons}
              lastFocusWeek={lastFocusMap}
              focusSlices={focusSlices}
              selected={selected}
              sortKey={sortKey}
              sortDir={sortDir}
              targetPgc={targetPgc}
              lcCurves={settings.lcCurves}
              slice={slice}
              onSort={onSort}
              onSelect={setSelected}
              onToggleFocus={onToggleFocus}
              onHide={onHideRep}
            />
          </>
        )}
      </main>

      <RepDrawer
        row={tab === 'roster' ? null : selectedRow}
        focusedSlices={selectedRow ? slicesForRep(focus, selectedRow.name, focusWeek) : []}
        lastFocusWeek={selectedRow ? lastFocusMap.get(selectedRow.name) ?? lastFocusWeekBefore(focus, selectedRow.name, focusWeek, slice) : null}
        suggestedReasons={selectedRow ? suggestedReasons.get(selectedRow.name) ?? [] : []}
        focusWeek={focusWeek}
        wtdAsOf={livePayload?.wtdAsOf ?? null}
        slice={slice}
        targetPgc={targetPgc}
        lcCurves={settings.lcCurves}
        notesByWeek={
          selectedRow
            ? Object.fromEntries(notesForRep(notes, selectedRow.name).map((n) => [n.week, n.text]))
            : {}
        }
        onClose={() => setSelected(null)}
        onToggleFocus={(audience) => selectedRow && onToggleFocus(selectedRow.name, audience)}
        onNoteChange={(week, text) => selectedRow && onNoteChange(selectedRow.name, week, text)}
      />

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onChange={onSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
