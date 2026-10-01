import { useEffect, useState } from 'react'
import { getSiteAccessToken } from '../lib/auth'
import { addDays } from '../lib/calendar'
import { COLLEGE_BASELINE, COLLEGE_CUTOFF, WORK_DIRECTIONS, collegeTotal, type WorkDirection, type CollegeFact, type CollegePayload } from '../lib/college'

const pct = (v: number | null) => v == null ? '—' : `${(v * 100).toFixed(1)}%`
const count = (v: number | null) => v == null ? '—' : v.toLocaleString()
const change = (a: number | null, b: number | null) => a == null || b == null ? '—' : `${b >= a ? '+' : ''}${((b - a) * 100).toFixed(1)} pp`
const cell = 'px-3 py-3 text-right whitespace-nowrap tabular-nums'
const input = 'rounded-lg bg-white px-3 py-2 text-sm text-ink ring-1 ring-slate-200'
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay()

export function CollegePage({ reload = 0 }: { reload?: number }) {
  const [data, setData] = useState<CollegePayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [direction, setDirection] = useState<WorkDirection>('college-to-hs')
  const [audience, setAudience] = useState('All')
  const [search, setSearch] = useState('')
  const [rep, setRep] = useState('')
  const [includeToday, setIncludeToday] = useState(false)
  const [matched, setMatched] = useState(true)
  const config = WORK_DIRECTIONS[direction]
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true); setError(''); setData(null)
      try {
        const token = await getSiteAccessToken()
        const res = await fetch(`/api/looker?view=college&direction=${direction}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' })
        const result = await res.json()
        if (!res.ok || result.error) throw new Error(result.error || 'Cross-workgroup data could not be loaded.')
        if (active) setData(result)
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Could not load cross-workgroup data.') }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [refresh, reload, direction])
  // Hide the previous direction immediately, before its replacement request starts.
  const current = data?.direction === direction ? data : null
  const end = current ? includeToday ? current.today : addDays(current.today, -1) : ''
  const postDays: string[] = []
  for (let d = COLLEGE_CUTOFF; d <= end; d = addDays(d, 1)) postDays.push(d)
  const weekdays = new Set(postDays.map(weekday))
  const facts = (current?.facts ?? []).filter(f => f.date <= end && (audience === 'All' || f.audience === audience))
  const baseline = facts.filter(f => f.date >= COLLEGE_BASELINE && f.date < COLLEGE_CUTOFF && (!matched || !postDays.length || weekdays.has(weekday(f.date))))
  const post = facts.filter(f => f.date >= COLLEGE_CUTOFF)
  const names = (current?.roster ?? []).filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
  const beforeTotal = collegeTotal(baseline), afterTotal = collegeTotal(post)
  const escvr = <span title={current?.escvrNotice} aria-label="ESCVR unavailable from source">—</span>
  const summary = (name: string, before: CollegeFact[], after: CollegeFact[], key = name) => {
    const a = collegeTotal(before), b = collegeTotal(after)
    const delta = a.pgc == null || b.pgc == null ? null : b.pgc - a.pgc
    return <tr key={key} className="border-t border-slate-100 hover:bg-slate-50/70">
      <th scope="row" className="sticky left-0 bg-white px-4 py-3 text-left font-medium whitespace-nowrap">{name}</th>
      <td className={cell}>{count(a.cc90)}</td><td className={cell}>{count(a.closes)}</td><td className={cell}>{pct(a.pgc)}</td><td className={cell}>{escvr}</td>
      <td className={`${cell} border-l border-slate-200 bg-violet-50/30`}>{count(b.cc90)}</td><td className={`${cell} bg-violet-50/30`}>{count(b.closes)}</td><td className={`${cell} bg-violet-50/30 font-semibold`}>{pct(b.pgc)}</td><td className={`${cell} bg-violet-50/30`}>{escvr}</td>
      <td className={`${cell} font-semibold ${delta == null || delta === 0 ? 'text-muted' : delta > 0 ? 'text-up' : 'text-down'}`}>{change(a.pgc, b.pgc)}</td>
      <td className="px-4 py-3 text-xs text-muted min-w-36">{!postDays.length ? 'Awaiting post period' : a.cc90 == null || b.cc90 == null ? 'No rows / missing counts' : a.cc90 === 0 || b.cc90 === 0 ? 'No qualifying volume' : Math.min(a.cc90, b.cc90) < 20 ? 'Small sample · <20 CC90' : '20+ CC90 each period'}</td>
    </tr>
  }
  const headings = <thead className="text-[11px] uppercase tracking-wide text-muted"><tr className="bg-slate-50"><th rowSpan={2} scope="col" className="px-4 text-left">Rep / audience</th><th colSpan={4} scope="colgroup" className="py-2">Before · Sep 3–30</th><th colSpan={4} scope="colgroup" className="border-l border-slate-200 bg-violet-50 py-2 text-violet-700">After · Oct 1 onward</th><th rowSpan={2} className="px-3">Δ pGC</th><th rowSpan={2} className="px-4 text-left">Sample</th></tr><tr>{['CC90', 'Closes', 'pGC', 'ESCVR', 'CC90', 'Closes', 'pGC', 'ESCVR'].map((h,i) => <th scope="col" key={i} className={`${cell} ${i >= 4 ? 'bg-violet-50' : ''}`}>{h}</th>)}</tr></thead>
  const trendFacts = facts.filter(f => !rep || f.repId === rep)
  const trendDays = [...new Set(trendFacts.map(f => f.date))].sort().reverse()
  return <section className="space-y-5">
    <div className="surface rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Cross-workgroup performance</p><h2 className="title-gradient mt-1 text-2xl font-bold tracking-tight">{config.label}</h2><p className="mt-1 text-sm text-muted">One roster. Two periods. Overall and per-rep results.</p></div>
        <button className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={loading} onClick={() => setRefresh(v => v + 1)}>{loading ? 'Refreshing…' : 'Refresh data'}</button>
      </div>
      <div role="group" aria-label="Work direction" className="mt-5 inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">{(Object.keys(WORK_DIRECTIONS) as WorkDirection[]).map(d => <button key={d} className="seg-btn" data-on={direction === d} aria-pressed={direction === d} onClick={() => { setDirection(d); setAudience('All'); setRep(''); setSearch('') }}>{WORK_DIRECTIONS[d].label}</button>)}</div>
    </div>
    {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error} No substitute or cached figures are shown.</p>}
    {loading && <p role="status" className="surface rounded-xl p-5 text-sm text-muted">Checking the {config.group} roster and loading audience results…</p>}
    {current && <>
      <div className="surface flex flex-wrap items-center gap-4 rounded-2xl p-4 text-sm">
        <label className="flex items-center gap-2 font-medium">Audience <select className={input} value={audience} onChange={e => setAudience(e.target.value)}>{['All', ...config.audiences].map(a => <option key={a} value={a}>{a === 'All' ? 'Both audiences' : a}</option>)}</select></label>
        <label className="flex items-center gap-2"><input className="accent-violet-600" type="checkbox" checked={includeToday} onChange={e => setIncludeToday(e.target.checked)} /> Include today (partial)</label>
        <label className="flex items-center gap-2"><input className="accent-violet-600" type="checkbox" checked={matched} onChange={e => setMatched(e.target.checked)} /> Match weekdays</label>
        <span className="ml-auto rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Terminated reps excluded</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[{ label: 'Reps in comparison', value: count(current.roster.length), hint: `${config.group} · verified directory roster`, tone: 'sky' }, { label: 'Before · pGC', value: pct(beforeTotal.pgc), hint: `${count(beforeTotal.closes)} closes / ${count(beforeTotal.cc90)} CC90`, tone: 'magenta' }, { label: 'After · pGC', value: pct(afterTotal.pgc), hint: `${count(afterTotal.closes)} closes / ${count(afterTotal.cc90)} CC90 · ${change(beforeTotal.pgc, afterTotal.pgc)}`, tone: 'violet' }, { label: 'ESCVR · before / after', value: '— / —', hint: 'Unavailable · source numerator is blank', tone: 'amber' }].map(c => <div key={c.label} className="kpi-card px-5 py-4" data-tone={c.tone}><p className="text-[11px] font-bold uppercase tracking-wide text-muted">{c.label}</p><p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{c.value}</p><p className="mt-2 text-xs text-muted">{c.hint}</p></div>)}
      </div>
      <div className="flex flex-wrap justify-between gap-2 px-1 text-xs text-muted"><p>Before: Sep 3–30, 2026 · After: {postDays.length ? `${COLLEGE_CUTOFF} through ${end}` : 'no completed days yet'} · Central Time</p><p>{matched && postDays.length ? 'Baseline matched to post weekdays' : 'Full four-week baseline'}{includeToday ? ' · Today is provisional' : ''}</p></div>
      {!postDays.length && <p className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">No completed days after October 1 yet. Select “Include today” for a provisional first look.</p>}
      <div className="surface overflow-hidden rounded-2xl"><div className="border-b border-slate-100 px-5 py-4"><h3 className="font-semibold">Overall performance</h3><p className="mt-1 text-xs text-muted">Combined pGC uses total closes ÷ total CC90. Period lengths differ; compare rates alongside volume.</p></div><div className="overflow-x-auto"><table className="w-full text-sm" aria-label="Overall pre and post performance">{headings}<tbody>{summary('All selected work', baseline, post)}{audience === 'All' && config.audiences.map(a => summary(a, baseline.filter(f => f.audience === a), post.filter(f => f.audience === a)))}</tbody></table></div></div>
      <div className="surface overflow-hidden rounded-2xl"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h3 className="font-semibold">Rep comparison</h3><p className="mt-1 text-xs text-muted">{names.length} of {current.roster.length} reps · Search affects this table only</p></div><input className={input} aria-label="Search reps" placeholder="Find a rep…" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="max-h-[560px] overflow-auto"><table className="w-full text-sm" aria-label="Rep pre and post performance">{headings}<tbody>{names.map(r => summary(r.name, baseline.filter(f => f.repId === r.id), post.filter(f => f.repId === r.id), r.id))}</tbody></table>{!names.length && <p className="p-5 text-sm text-muted">No matching reps.</p>}</div></div>
      <details className="surface rounded-2xl" open={undefined}><summary className="cursor-pointer px-5 py-4 font-semibold">Daily trend <span className="ml-2 text-xs font-normal text-muted">Daily and rolling 7-day pGC</span></summary><div className="px-5 pb-4"><label className="text-sm">Show <select aria-label="Trend rep" className={`${input} ml-2`} value={rep} onChange={e => setRep(e.target.value)}><option value="">Overall {config.group}</option>{current.roster.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><p className="mt-2 text-xs text-muted">Selected audience · full daily history · independent of weekday matching. Rolling windows can cross October 1.</p></div><div className="max-h-96 overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-slate-50 text-xs text-muted"><tr>{['Date (CT)', 'Period', 'CC90', 'Closes', 'pGC', '7-day pGC', 'ESCVR'].map(h => <th className={cell} key={h}>{h}</th>)}</tr></thead><tbody>{trendDays.map(d => { const t = collegeTotal(trendFacts.filter(f => f.date === d)); const rolling = collegeTotal(trendFacts.filter(f => f.date <= d && f.date >= addDays(d, -6))); return <tr key={d} className={`border-t border-slate-100 ${d >= COLLEGE_CUTOFF ? 'bg-violet-50/40' : ''}`}><td className={cell}>{d}{d === current.today ? ' *' : ''}</td><td className={cell}>{d < COLLEGE_CUTOFF ? 'Before' : 'After'}</td><td className={cell}>{count(t.cc90)}</td><td className={cell}>{count(t.closes)}</td><td className={cell}>{pct(t.pgc)}</td><td className={cell}>{pct(rolling.pgc)}</td><td className={cell}>{escvr}</td></tr> })}</tbody></table>{!trendDays.length && <p className="p-5 text-sm text-muted">No qualifying activity returned.</p>}</div></details>
      <details className="rounded-xl border border-slate-200 bg-white/60 text-xs text-muted"><summary className="cursor-pointer px-4 py-3 font-semibold">Source, roster checks & metric definitions</summary><div className="space-y-2 px-4 pb-4 leading-relaxed"><p>{current.membership}</p><p>Directory snapshots: {current.rosterAsOf.join(', ')}. Excluded: {current.excludedTerminated} marked terminated; {current.excludedUnknown} unknown status.</p><p>Activity: <a className="underline" href="https://varsitytutors.looker.com/dashboards/sales::call_duration_per_rep_by_supergroup">Looker sales dashboard</a> ({current.source}). Retrieved {new Date(current.refreshedAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT. Latest returned activity: {current.facts.map(f => f.date).sort().at(-1) ?? 'none'}. Retrieval time does not certify upstream freshness.</p><p>pGC = call-attributed closes ÷ CC90; reconciliation to dashboard pGC remains pending. No returned rows and blank counts remain unknown (—); confirmed zero counts remain 0.</p><p>{current.escvrNotice} <a className="underline" href="https://varsitytutors.looker.com/dashboards/sales::dash_7801_escvr">Official ESCVR report</a>.</p></div></details>
    </>}
  </section>
}
