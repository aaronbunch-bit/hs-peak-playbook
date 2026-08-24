import { useEffect, useMemo, useState } from 'react'
import { FilterBar } from './components/FilterBar'
import { FocusList } from './components/FocusList'
import { KpiStrip } from './components/KpiStrip'
import { RepDrawer } from './components/RepDrawer'
import { RepTable, type SortKey } from './components/RepTable'
import { RosterPage } from './components/RosterPage'
import { SettingsPanel } from './components/SettingsPanel'
import { sundayWeekStart } from './lib/calendar'
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
import { readHash, staffingAllowed, writeHash, type AppTab } from './lib/hash'
import { fetchPacerData, SLICE_LOOKER_FILTERS } from './lib/looker'
import { buildRows, formatWeek, mergeFocusLog, weekKpis } from './lib/pacer'
import {
  applyRosterLevels,
  loadRosterLevels,
  saveRosterLevels,
  setRosterLevel,
} from './lib/roster'
import { hideRep, loadHiddenReps, saveHiddenReps, showRep } from './lib/hidden'
import { loadSettings, saveSettings, targetForSlice, type AppSettings } from './lib/settings'
import { suggestFocuses } from './lib/suggest'
import type { Cohort, PacerPayload, Slice, Staffing } from './lib/types'

export default function App() {
  const initial = readHash()
  const [tab, setTab] = useState<AppTab>(initial.tab)
  const [slice, setSlice] = useState<Slice>(initial.slice)
  const [cohort, setCohort] = useState<Cohort>(initial.cohort)
  const [staffing, setStaffing] = useState<Staffing>(initial.staffing)
  const [manager, setManager] = useState<string | null>(initial.manager)
  const [payload, setPayload] = useState<PacerPayload | null>(null)
  const [weekIndex, setWeekIndex] = useState(0)
  const [compareWow, setCompareWow] = useState(true)
  const [focus, setFocus] = useState(loadFocus)
  const [notes, setNotes] = useState(loadNotes)
  const [settings, setSettings] = useState(loadSettings)
  const [rosterLevels, setRosterLevels] = useState(loadRosterLevels)
  const [hiddenReps, setHiddenReps] = useState(loadHiddenReps)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('pgc')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [reload, setReload] = useState(0)

  const focusWeek = sundayWeekStart()
  const targetPgc = targetForSlice(slice, settings.targets)
  const selectedWeek = payload?.weeks[weekIndex] ?? null

  const livePayload = useMemo(() => {
    if (!payload) return null
    return { ...payload, roster: applyRosterLevels(payload.roster, rosterLevels) }
  }, [payload, rosterLevels])

  const managers = useMemo(() => {
    const names = new Set(
      (livePayload?.roster ?? []).map((r) => r.manager).filter((name): name is string => Boolean(name)),
    )
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [livePayload])

  useEffect(() => {
    writeHash({
      slice,
      cohort,
      staffing,
      manager,
      tab,
      week: weekIndex > 0 && selectedWeek ? selectedWeek : null,
    })
  }, [slice, cohort, staffing, manager, tab, weekIndex, selectedWeek])

  useEffect(() => {
    const onHash = () => {
      const next = readHash()
      setSlice(next.slice)
      setCohort(next.cohort)
      setStaffing(next.staffing)
      setManager(next.manager)
      setTab(next.tab)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchPacerData(slice, staffingAllowed(slice) ? staffing : 'primary').then((data) => {
      if (!cancelled) {
        setPayload(data)
        setWeekIndex(0)
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
  const kpiFocusWeek = weekIndex === 0 ? focusWeek : (selectedWeek ?? focusWeek)
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
      weekIndex,
      staffing,
      lcCurves: settings.lcCurves,
    })
    return manager ? built.filter((r) => r.manager === manager) : built
  }, [livePayload, cohort, focus, targetPgc, weekIndex, staffing, manager, settings.lcCurves])

  const hiddenSet = useMemo(() => new Set(hiddenReps), [hiddenReps])

  const visibleRows = useMemo(
    () => allRows.filter((r) => !hiddenSet.has(r.name)),
    [allRows, hiddenSet],
  )

  const priorRows = useMemo(() => {
    if (!livePayload || livePayload.empty || weekIndex + 1 >= livePayload.weeks.length) return []
    const withHistory = {
      ...livePayload,
      focusLog: mergeFocusLog(livePayload.focusLog, historyFromStore(focus)),
    }
    const built = buildRows(withHistory, cohort, targetPgc, {
      weekIndex: weekIndex + 1,
      staffing,
      lcCurves: settings.lcCurves,
    })
    const scoped = manager ? built.filter((r) => r.manager === manager) : built
    return scoped.filter((r) => !hiddenSet.has(r.name))
  }, [livePayload, cohort, focus, targetPgc, weekIndex, staffing, manager, settings.lcCurves, hiddenSet])

  const priorWeek = livePayload?.weeks[weekIndex + 1] ?? null
  const priorFocusSet = useMemo(
    () => new Set(priorWeek ? namesForWeek(focus, priorWeek, slice) : []),
    [focus, priorWeek],
  )

  const suggestions = useMemo(
    () => suggestFocuses(visibleRows, settings.suggest, focusedSet),
    [visibleRows, settings.suggest, focusedSet],
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
      const aF = focusedSet.has(a.name) ? 0 : 1
      const bF = focusedSet.has(b.name) ? 0 : 1
      if (aF !== bF) return aF - bF
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
  }, [visibleRows, focusedSet, sortKey, sortDir])

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
          note: noteFor(notes, focusWeek, name),
        }
      })
      .filter((item) => !manager || item.manager === manager)
  }, [catalogRows, livePayload, focus, focusWeek, notes, manager])

  const selectedRow =
    rows.find((r) => r.name === selected) ?? catalogRows.find((r) => r.name === selected) ?? null
  const currentKpis = weekKpis(visibleRows, thatWeekFocusSet)
  const priorKpis = priorRows.length ? weekKpis(priorRows, priorFocusSet) : null
  const wtdTeam = (() => {
    const withWtd = visibleRows.filter((r) => r.wtdPgc != null)
    if (weekIndex !== 0 || withWtd.length === 0) return null
    return withWtd.reduce((sum, r) => sum + (r.wtdPgc ?? 0), 0) / withWtd.length
  })()

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'manager' ? 'asc' : 'desc')
    }
  }

  const onToggleFocus = (name: string, audience: Slice = slice) => {
    const next = toggleFocus(focus, name, focusWeek, audience)
    setFocus(next)
    saveFocus(next)
  }

  const onNoteChange = (name: string, text: string) => {
    const next = setNote(notes, focusWeek, name, text)
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
        weekIndex={weekIndex}
        targets={settings.targets}
        hiddenCount={hiddenReps.length}
        onTab={(next) => {
          setTab(next)
          setSelected(null)
        }}
        onSlice={changeSlice}
        onCohort={setCohort}
        onManager={setManager}
        onStaffing={setStaffing}
        onWeekIndex={setWeekIndex}
        onRestoreHidden={onRestoreHidden}
        onOpenSettings={() => setSettingsOpen(true)}
        onRefresh={() => setReload((n) => n + 1)}
      />

      <main className="mt-4 space-y-4">
        {!livePayload || livePayload.slice !== slice ? (
          <div className="mx-auto max-w-6xl px-4 text-sm text-slate-500 sm:px-6">Loading week…</div>
        ) : tab === 'focus' ? (
          livePayload.empty ? (
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <div className="rounded-2xl border border-dashed border-sky-200 bg-white/80 px-6 py-12 text-center">
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
        ) : livePayload.empty ? (
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="rounded-2xl border border-dashed border-sky-200 bg-white/80 px-6 py-12 text-center">
              <p className="text-lg font-semibold text-slate-800">
                {SLICE_LOOKER_FILTERS[slice].label}
                {staffingAllowed(slice) ? ` · ${staffing === 'cross-train' ? 'Cross Train' : 'Primary'}` : ''}
              </p>
              <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">{livePayload.emptyReason}</p>
            </div>
          </div>
        ) : (
          <>
            <KpiStrip
              current={currentKpis}
              prior={priorKpis}
              compareWow={compareWow}
              targetPgc={targetPgc}
              wtdPgc={wtdTeam}
              wtdReady={weekIndex === 0 && visibleRows.some((r) => r.wtdPgc != null)}
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
        note={selectedRow ? noteFor(notes, focusWeek, selectedRow.name) : ''}
        noteHistory={selectedRow ? notesForRep(notes, selectedRow.name) : []}
        onClose={() => setSelected(null)}
        onToggleFocus={(audience) => selectedRow && onToggleFocus(selectedRow.name, audience)}
        onNoteChange={(text) => selectedRow && onNoteChange(selectedRow.name, text)}
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
