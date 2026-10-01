import { useEffect, useState } from 'react'
import { getSiteAccessToken } from '../lib/auth'
import {
  WORK_DIRECTIONS, bottomQuartile, comparisonRow, defaultSelection, scoreCounts,
  selectionParams, shiftDate, sortComparisons, validateSelection,
  type CollegeCounts, type CollegeDaily, type CollegePayload, type CollegeSelection,
  type ComparisonRow, type ComparisonSort, type PerformanceMetric, type WorkDirection,
} from '../lib/college'

const pct = (n: number | null) => n == null ? '—' : `${(n * 100).toFixed(1)}%`
const count = (n: number | null) => n == null ? '—' : n.toLocaleString()
const delta = (n: number | null) => n == null ? '—' : `${n > 0 ? '+' : ''}${(n * 100).toFixed(1)} pp`
const cell = 'px-3 py-3 text-right whitespace-nowrap tabular-nums'
const input = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-violet-300'
const metricName = (metric: PerformanceMetric) => metric === 'pgc' ? 'pGC' : 'ESCVR'
const rangeLabel = (range: { start: string; end: string }) => `${range.start} – ${range.end}`
const todayCT = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const tone = (value: number | null) => value == null || value === 0 ? 'text-muted' : value > 0 ? 'text-up' : 'text-down'

function PeriodCard({ label, counts, range, partial }: { label: string; counts: CollegeCounts; range: string; partial: boolean }) {
  const score = scoreCounts(counts)
  return <div className="kpi-card p-5" data-tone={label === 'Before' ? 'sky' : 'violet'}>
    <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-bold uppercase tracking-wider text-muted">{label}</h3>{partial && <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">Includes today · partial</span>}</div>
    <p className="mt-1 text-xs text-muted">{range} · CT</p>
    <div className="mt-4 grid grid-cols-2 gap-4"><div><p className="text-xs font-semibold text-muted">pGC</p><p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{pct(score.pgc)}</p><p className="mt-1 text-xs text-muted">{count(score.closes)} closes / {count(score.cc90)} CC90</p></div><div className="border-l border-slate-100 pl-4"><p className="text-xs font-semibold text-muted">ESCVR</p><p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{pct(score.escvr)}</p><p className="mt-1 text-xs text-muted">{count(score.escvrCloses)} closed clients / {count(score.firstConnects)} first connects</p></div></div>
  </div>
}

function ComparisonTable({ rows, metric, sortKey, descending, onSort, bottomIds, rankingPeriod, minimum, label }: {
  rows: ComparisonRow[]; metric: PerformanceMetric; sortKey: ComparisonSort; descending: boolean
  onSort: (key: ComparisonSort) => void; bottomIds?: Set<string>; rankingPeriod: 'before' | 'after'; minimum: number; label: string
}) {
  const denominator = metric === 'pgc' ? 'cc90' : 'firstConnects'
  const denominatorLabel = metric === 'pgc' ? 'CC90' : 'First connects'
  const heading = (key: ComparisonSort, text: string, extra = '') => <th key={key} scope="col" className={`${cell} ${extra}`} aria-sort={sortKey === key ? descending ? 'descending' : 'ascending' : 'none'}><button type="button" className="flex w-full items-center justify-end gap-1.5 rounded py-1 text-xs font-semibold hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-violet-500" onClick={() => onSort(key)} aria-label={`Sort ${label} by ${key.replace('.', ' ')}`}><span>{text}</span><span aria-hidden="true" className={sortKey === key ? 'text-violet-700' : 'text-slate-300'}>{sortKey === key ? descending ? '↓' : '↑' : '↕'}</span></button></th>
  return <div className="max-h-[620px] overflow-auto"><table className="w-full text-sm" aria-label={label}>
    <thead className="sticky top-0 z-20 bg-slate-50 text-muted"><tr><th rowSpan={2} scope="col" className="sticky left-0 z-30 min-w-44 bg-slate-50 px-4 py-2 text-left" aria-sort={sortKey === 'name' ? descending ? 'descending' : 'ascending' : 'none'}><button className="flex items-center gap-2 text-xs font-semibold" onClick={() => onSort('name')} aria-label={`Sort ${label} by name`}>{label === 'Rep comparison' ? 'Rep' : 'Audience'} <span aria-hidden="true">{sortKey === 'name' ? descending ? '↓' : '↑' : '↕'}</span></button></th><th scope="colgroup" colSpan={3} className="border-b border-slate-200 py-2 text-[11px] uppercase tracking-wide">Before</th><th scope="colgroup" colSpan={3} className="border-b border-l border-violet-100 bg-violet-50 py-2 text-[11px] uppercase tracking-wide text-violet-700">After</th><th rowSpan={2} scope="col" className="px-3" aria-sort={sortKey === (metric === 'pgc' ? 'deltaPgc' : 'deltaEscvr') ? descending ? 'descending' : 'ascending' : 'none'}><button className="whitespace-nowrap text-xs font-semibold" onClick={() => onSort(metric === 'pgc' ? 'deltaPgc' : 'deltaEscvr')} aria-label={`Sort ${label} by change`}>Δ {metricName(metric)} <span aria-hidden="true">{sortKey === (metric === 'pgc' ? 'deltaPgc' : 'deltaEscvr') ? descending ? '↓' : '↑' : '↕'}</span></button></th></tr><tr>{(['before', 'after'] as const).flatMap(period => [heading(`${period}.${denominator}`, denominatorLabel, period === 'after' ? 'border-l border-violet-100 bg-violet-50' : ''), heading(`${period}.${metric === 'pgc' ? 'closes' : 'escvrCloses'}`, 'Closed clients', period === 'after' ? 'bg-violet-50' : ''), heading(`${period}.${metric}`, metricName(metric), period === 'after' ? 'bg-violet-50' : '')])}</tr></thead>
    <tbody>{sortComparisons(rows, sortKey, descending).map(row => {
      const low = bottomIds?.has(row.id)
      const volume = row[rankingPeriod][denominator]
      const change = metric === 'pgc' ? row.deltaPgc : row.deltaEscvr
      return <tr key={row.id} className={`border-t border-slate-100 ${low ? 'bg-rose-50/40' : 'hover:bg-slate-50/70'}`}>
        <th scope="row" className={`sticky left-0 z-10 px-4 py-3 text-left font-medium ${low ? 'bg-rose-50' : 'bg-white'}`}><span className="whitespace-nowrap">{row.name}</span>{bottomIds && <span className={`mt-1 block text-[10px] font-semibold ${low ? 'text-rose-700' : 'text-muted'}`}>{low ? 'BOTTOM QUARTILE' : row[rankingPeriod][metric] == null ? 'Not ranked · no rate' : volume == null || volume < minimum ? 'Not ranked · small sample' : ''}</span>}</th>
        {(['before', 'after'] as const).map(period => <PeriodCells key={period} counts={row[period]} metric={metric} after={period === 'after'} />)}
        <td className={`${cell} font-semibold ${tone(change)}`}>{delta(change)}</td>
      </tr>
    })}</tbody>
  </table>{!rows.length && <p className="p-6 text-center text-sm text-muted">No reps match these filters.</p>}</div>
}
function PeriodCells({ counts, metric, after }: { counts: CollegeCounts; metric: PerformanceMetric; after: boolean }) {
  const score = scoreCounts(counts), denominator = metric === 'pgc' ? score.cc90 : score.firstConnects
  return <><td className={`${cell} ${after ? 'border-l border-slate-100' : ''}`}>{count(denominator)}</td><td className={cell}>{count(metric === 'pgc' ? score.closes : score.escvrCloses)}</td><td className={`${cell} font-semibold ${after ? 'text-violet-800' : ''}`}>{pct(score[metric])}</td></>
}

export function CollegePage({ reload = 0 }: { reload?: number }) {
  const [selection, setSelection] = useState<CollegeSelection>(() => defaultSelection(todayCT()))
  const [draft, setDraft] = useState(selection)
  const [data, setData] = useState<CollegePayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [metric, setMetric] = useState<PerformanceMetric>('pgc')
  const [rankingPeriod, setRankingPeriod] = useState<'before' | 'after'>('after')
  const [minimum, setMinimum] = useState(20)
  const [bottomOnly, setBottomOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [rep, setRep] = useState('')
  const [sortKey, setSortKey] = useState<ComparisonSort>('after.pgc')
  const [descending, setDescending] = useState(false)
  const [trendSort, setTrendSort] = useState<'date' | keyof CollegeCounts | PerformanceMetric>('date')
  const [trendDescending, setTrendDescending] = useState(true)
  const requestKey = selectionParams(selection).toString()
  const today = data?.today ?? todayCT()
  const config = WORK_DIRECTIONS[selection.direction]
  const draftError = validateSelection(draft, today)
  const pendingChanges = selectionParams(draft).toString() !== requestKey
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true); setError('')
      try {
        const token = await getSiteAccessToken()
        const res = await fetch(`/api/looker?${requestKey}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store', signal: controller.signal })
        const result = await res.json()
        if (!res.ok || result.error) throw new Error(result.error || 'Cross-workgroup data could not be loaded.')
        if (!controller.signal.aborted) setData(result)
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load cross-workgroup data.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [requestKey, refresh, reload])
  const current = !loading && !error && data && selectionParams(data.selection).toString() === requestKey ? data : null
  const switchDirection = (direction: WorkDirection) => {
    setSelection(s => ({ ...s, direction, audience: 'All' }))
    setDraft(s => ({ ...s, direction, audience: 'All' }))
    setRep(''); setSearch(''); setBottomOnly(false)
  }
  const chooseMetric = (value: PerformanceMetric) => { setMetric(value); setSortKey(`${rankingPeriod}.${value}`); setDescending(false) }
  const onSort = (key: ComparisonSort) => { setDescending(sortKey === key ? !descending : false); setSortKey(key) }
  const applyPreset = (days: number | 'october') => {
    const dates = days === 'october' ? defaultSelection(today) : {
      before: { start: shiftDate(today, -2 * days), end: shiftDate(today, -days - 1) },
      after: { start: shiftDate(today, -days), end: shiftDate(today, -1) },
    }
    setDraft(s => ({ ...s, before: dates.before, after: dates.after }))
  }
  const repRows = current?.roster.map(r => comparisonRow(r.id, r.name, current.before.reps.find(x => x.repId === r.id)?.counts, current.after.reps.find(x => x.repId === r.id)?.counts)) ?? []
  const quartile = bottomQuartile(repRows, rankingPeriod, metric, minimum)
  const visibleRows = repRows.filter(r => (!bottomOnly || quartile.ids.has(r.id)) && r.name.toLowerCase().includes(search.toLowerCase()))
  const lowRows = repRows.filter(r => quartile.ids.has(r.id))
  const lowClosed = lowRows.reduce((sum, r) => sum + (r[rankingPeriod][metric === 'pgc' ? 'closes' : 'escvrCloses'] ?? 0), 0)
  const lowVolume = lowRows.reduce((sum, r) => sum + (r[rankingPeriod][metric === 'pgc' ? 'cc90' : 'firstConnects'] ?? 0), 0)
  const overallRows = current ? [comparisonRow('all', 'All selected work', current.before.overall, current.after.overall), ...(selection.audience === 'All' ? config.audiences.map(a => comparisonRow(a, a, current.before.audiences.find(x => x.audience === a)?.counts, current.after.audiences.find(x => x.audience === a)?.counts)) : [])] : []
  const trendMap = new Map<string, CollegeDaily>()
  if (current) for (const period of [current.before, current.after]) for (const row of rep ? period.repDaily.filter(r => r.repId === rep) : period.daily) trendMap.set(row.date, row)
  const trendRows = [...trendMap.values()].map(row => ({ ...row, ...scoreCounts(row) })).sort((a, b) => {
    const av = a[trendSort], bv = b[trendSort]
    if (av == null && bv != null) return 1
    if (bv == null && av != null) return -1
    const difference = av == null || bv == null ? 0 : typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : Number(av) - Number(bv)
    return (trendDescending ? -difference : difference) || a.date.localeCompare(b.date)
  })
  const overlaps = selection.before.start <= selection.after.end && selection.after.start <= selection.before.end
  return <section className="mx-auto max-w-[1440px] space-y-5 px-4 pb-8 sm:px-6">
    <div className="surface rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Cross-workgroup performance</p><h2 className="title-gradient mt-1 text-2xl font-bold tracking-tight">{config.label}</h2><p className="mt-1 text-sm text-muted">Compare periods, sort results, and find the reps who need attention.</p></div><button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={loading} onClick={() => setRefresh(v => v + 1)}>{loading ? 'Refreshing…' : 'Refresh data'}</button></div>
      <div role="group" aria-label="Work direction" className="mt-5 inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">{(Object.keys(WORK_DIRECTIONS) as WorkDirection[]).map(d => <button key={d} className="seg-btn" data-on={selection.direction === d} aria-pressed={selection.direction === d} onClick={() => switchDirection(d)}>{WORK_DIRECTIONS[d].label}</button>)}</div>
    </div>
    <form className="surface rounded-2xl p-5" onSubmit={e => { e.preventDefault(); if (!draftError) { setSelection(draft); setBottomOnly(false) } }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Comparison dates</h3><div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-muted">Quick select</span>{[{ label: 'Oct 1 change', days: 'october' as const }, { label: 'Last 7 vs prior 7', days: 7 }, { label: 'Last 28 vs prior 28', days: 28 }].map(p => <button type="button" key={p.label} onClick={() => applyPreset(p.days)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium hover:border-violet-300 hover:bg-violet-50">{p.label}</button>)}</div></div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">{(['before', 'after'] as const).map(period => <fieldset key={period} className={`rounded-xl border p-3 ${period === 'after' ? 'border-violet-200 bg-violet-50/40' : 'border-slate-200 bg-slate-50/60'}`}><legend className="px-1 text-xs font-bold uppercase tracking-wide text-muted">{period}</legend><div className="grid grid-cols-2 gap-3">{(['start', 'end'] as const).map(bound => <label key={bound} className="block text-[11px] font-medium text-muted">{bound === 'start' ? 'From' : 'Through'}<input required type="date" aria-label={`${period} ${bound}`} max={today} value={draft[period][bound]} onChange={e => setDraft(s => ({ ...s, [period]: { ...s[period], [bound]: e.target.value } }))} className={`${input} mt-1 w-full min-w-0`} /></label>)}</div></fieldset>)}<div className="flex flex-wrap items-end gap-3"><label className="block text-[11px] font-medium text-muted">Audience<select className={`${input} mt-1 block`} value={draft.audience} onChange={e => setDraft(s => ({ ...s, audience: e.target.value }))}>{['All', ...config.audiences].map(a => <option key={a} value={a}>{a === 'All' ? 'Both audiences' : a}</option>)}</select></label><button type="submit" disabled={!!draftError || loading} className="h-[38px] rounded-lg bg-ink px-4 text-sm font-semibold text-white disabled:opacity-40">Apply ranges</button></div></div>
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs"><p className={draftError ? 'text-rose-700' : pendingChanges ? 'font-semibold text-violet-700' : 'text-muted'} role={draftError ? 'alert' : undefined}>{draftError || (pendingChanges ? 'Unapplied changes — select Apply ranges to update the report.' : 'Inclusive dates · Central Time · Before stays fixed when After changes.')}</p><p className="text-muted">Last 7 / 28 presets use completed days. Choose today as an end date for partial results.</p></div>
    </form>
    {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error} No substitute or stale figures are shown.</p>}
    {loading && <div className="surface rounded-2xl p-8 text-center text-sm text-muted" role="status">Loading verified rosters and distinct counts for both periods…</div>}
    {current && <>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted"><p>{current.roster.length} eligible {config.group} reps · {selection.audience === 'All' ? config.audiences.join(' + ') : selection.audience}</p><span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">Terminated reps excluded</span></div>
      {overlaps && <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">These date ranges overlap. Shared dates contribute to both periods.</p>}
      <div className="grid gap-4 md:grid-cols-2"><PeriodCard label="Before" counts={current.before.overall} range={rangeLabel(selection.before)} partial={selection.before.end === today} /><PeriodCard label="After" counts={current.after.overall} range={rangeLabel(selection.after)} partial={selection.after.end === today} /></div>
      <p className="px-1 text-xs text-muted">ESCVR = closed clients from the selected first-connect cohort ÷ first-transfer / first-inbound contacts. Recent cohorts are still maturing as leads convert.</p>
      <div className="surface rounded-2xl p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="text-sm font-semibold">Table metric</span><div role="group" aria-label="Performance metric" className="inline-flex rounded-lg bg-slate-100 p-1">{(['pgc', 'escvr'] as const).map(m => <button key={m} className="seg-btn" data-on={metric === m} aria-pressed={metric === m} onClick={() => chooseMetric(m)}>{metricName(m)}</button>)}</div></div><p className="text-xs text-muted">Click a heading to sort; click again to reverse. {metric === 'escvr' ? 'Closed clients belong to the selected first-connect cohort.' : 'Closed clients are credited to calls in the selected dates.'}</p></div></div>
      <div className="surface overflow-hidden rounded-2xl"><div className="border-b border-slate-100 px-5 py-4"><h3 className="font-semibold">Overall performance</h3><p className="mt-1 text-xs text-muted">Source totals are deduplicated at each grouping. Combined rates use total counts, never average rep percentages.</p></div><ComparisonTable rows={overallRows} metric={metric} sortKey={sortKey} descending={descending} onSort={onSort} rankingPeriod={rankingPeriod} minimum={minimum} label="Overall performance" /></div>
      <div className="surface overflow-hidden rounded-2xl">
        <div className="border-b border-slate-100 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-semibold">Rep comparison</h3><p className="mt-1 text-xs text-muted">{visibleRows.length} of {repRows.length} reps shown · Rankings use the full selected roster, independent of search.</p></div><input className={input} aria-label="Search reps" placeholder="Search reps…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-3 text-xs"><label className="flex items-center gap-2 font-medium">Rank by<select className={input} aria-label="Quartile ranking period" value={rankingPeriod} onChange={e => { const value = e.target.value as 'before' | 'after'; setRankingPeriod(value); setSortKey(`${value}.${metric}`); setDescending(false) }}><option value="after">After {metricName(metric)}</option><option value="before">Before {metricName(metric)}</option></select></label><label className="flex items-center gap-2 font-medium">Minimum {metric === 'pgc' ? 'CC90' : 'first connects'}<input className={`${input} w-20`} aria-label="Minimum ranking sample" type="number" min="1" max="10000" step="1" value={minimum} onChange={e => setMinimum(Math.max(1, Math.min(10000, Math.floor(Number(e.target.value) || 1))))} /></label><label className="ml-auto flex items-center gap-2 font-semibold text-rose-700"><input className="accent-rose-600" type="checkbox" checked={bottomOnly} onChange={e => setBottomOnly(e.target.checked)} /> Bottom quartile only</label></div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"><p><strong className="text-rose-700">{quartile.ids.size} bottom-quartile reps</strong> <span className="text-muted">/ {quartile.eligibleCount} eligible · {rankingPeriod} {metricName(metric)}</span></p>{quartile.cutoff != null ? <><p className="text-muted">Cutoff: ≤{pct(quartile.cutoff)}</p><p className="text-muted">Weighted rep rate: {pct(lowVolume > 0 ? lowClosed / lowVolume : null)} ({count(lowClosed)} / {count(lowVolume)})</p></> : <p className="text-muted">Need at least 4 reps meeting the minimum. Extend the dates or rank the Before period.</p>}</div>
          <p className="mt-2 text-[11px] text-muted">Lowest 25% of eligible rep rates, rounded up; boundary ties included. Missing rates and small samples are not ranked.</p>
        </div>
        <ComparisonTable rows={visibleRows} metric={metric} sortKey={sortKey} descending={descending} onSort={onSort} bottomIds={quartile.ids} rankingPeriod={rankingPeriod} minimum={minimum} label="Rep comparison" />
      </div>
      <details className="surface rounded-2xl"><summary className="cursor-pointer px-5 py-4 font-semibold">Daily detail <span className="ml-2 text-xs font-normal text-muted">Both selected periods · sortable</span></summary><div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4"><label className="text-sm">Show <select aria-label="Daily detail rep" className={`${input} ml-2`} value={rep} onChange={e => setRep(e.target.value)}><option value="">Overall {config.group}</option>{current.roster.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><p className="text-xs text-muted">Period ESCVR is recalculated from distinct period counts, not daily averages.</p></div><div className="max-h-96 overflow-auto"><table className="w-full text-sm" aria-label="Daily detail"><thead className="sticky top-0 bg-slate-50 text-xs text-muted"><tr>{([{ key: 'date', label: 'Date (CT)' }, { key: 'cc90', label: 'CC90' }, { key: 'closes', label: 'pGC closes' }, { key: 'escvrCloses', label: 'ESCVR closed clients' }, { key: 'firstConnects', label: 'First connects' }, { key: 'pgc', label: 'pGC' }, { key: 'escvr', label: 'ESCVR' }] as const).map(h => <th className={cell} key={h.key} aria-sort={trendSort === h.key ? trendDescending ? 'descending' : 'ascending' : 'none'}><button onClick={() => { setTrendDescending(trendSort === h.key ? !trendDescending : false); setTrendSort(h.key) }} aria-label={`Sort daily detail by ${h.label}`}>{h.label} {trendSort === h.key ? trendDescending ? '↓' : '↑' : '↕'}</button></th>)}</tr></thead><tbody>{trendRows.map(row => <tr key={row.date} className={`border-t border-slate-100 ${row.date >= selection.after.start && row.date <= selection.after.end ? 'bg-violet-50/30' : ''}`}><td className={cell}>{row.date}{row.date === today ? ' · partial' : ''}</td><td className={cell}>{count(row.cc90)}</td><td className={cell}>{count(row.closes)}</td><td className={cell}>{count(row.escvrCloses)}</td><td className={cell}>{count(row.firstConnects)}</td><td className={cell}>{pct(row.pgc)}</td><td className={cell}>{pct(row.escvr)}</td></tr>)}</tbody></table>{!trendRows.length && <p className="p-5 text-sm text-muted">No activity rows returned for this selection.</p>}</div></details>
      <details className="rounded-xl border border-slate-200 bg-white/70 text-xs text-muted"><summary className="cursor-pointer px-4 py-3 font-semibold">Sources, freshness & definitions</summary><div className="space-y-2 px-4 pb-4 leading-relaxed"><p>{current.membership}</p><p>Directory snapshots: {current.rosterAsOf.join(', ')}. Excluded: {current.excludedTerminated} marked terminated; {current.excludedUnknown} unknown status.</p><p>Source: <a className="underline" href="https://varsitytutors.looker.com/dashboards/sales::call_duration_per_rep_by_supergroup">Looker sales dashboard</a> ({current.source}). Retrieved {new Date(current.refreshedAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT. Latest returned call date: {[...current.before.daily, ...current.after.daily].map(r => r.date).sort().at(-1) ?? 'none'}. Retrieval time does not certify upstream freshness.</p><p>pGC = call-attributed closed clients ÷ CC90. pGC closes use closed_client_count_this_call; ESCVR closed clients use the documented converted-first-connect rules. First connects use contact_count_first_transferred_or_inbound. Business: VT Core / International; dropped experts excluded. No CC90-only filter is applied to first connects.</p><p>{current.escvrNotice}</p><p>Overall, audience, rep, and daily counts are queried separately to preserve distinct counts. A client or call credited to multiple reps can appear in multiple rep rows but only once in overall counts. The bottom-quartile weighted rep rate sums eligible rep numerators and denominators. Missing values remain —; confirmed zero counts remain 0. Dashboard pGC reconciliation remains pending.</p></div></details>
    </>}
  </section>
}
