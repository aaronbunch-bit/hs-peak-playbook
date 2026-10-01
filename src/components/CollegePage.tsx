import { useEffect, useState } from 'react'
import { getSiteAccessToken } from '../lib/auth'
import { addDays } from '../lib/calendar'
import { COLLEGE_BASELINE, COLLEGE_CUTOFF, collegeTotal, type CollegeFact, type CollegePayload } from '../lib/college'

const pct = (v: number | null) => v == null ? '—' : `${(v * 100).toFixed(1)}%`
const count = (v: number | null) => v == null ? '—' : v.toLocaleString()
const change = (a: number | null, b: number | null) => a == null || b == null ? '—' : `${b >= a ? '+' : ''}${((b - a) * 100).toFixed(1)} pp`
const cell = 'px-4 py-3 text-right whitespace-nowrap'
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay()

export function CollegePage({ reload = 0 }: { reload?: number }) {
  const [data, setData] = useState<CollegePayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [audience, setAudience] = useState('All HS/K12')
  const [search, setSearch] = useState('')
  const [rep, setRep] = useState('')
  const [includeToday, setIncludeToday] = useState(false)
  const [matched, setMatched] = useState(true)
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true); setError(''); setData(null)
      try {
        const token = await getSiteAccessToken()
        const res = await fetch('/api/looker?view=college', { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' })
        const result = await res.json()
        if (!res.ok || result.error) throw new Error(result.error || 'College data could not be loaded.')
        if (active) setData(result)
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Could not load College data.') }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [refresh, reload])
  const end = data ? includeToday ? data.today : addDays(data.today, -1) : ''
  const postDays: string[] = []
  for (let d = COLLEGE_CUTOFF; d <= end; d = addDays(d, 1)) postDays.push(d)
  const weekdays = new Set(postDays.map(weekday))
  const facts = (data?.facts ?? []).filter(f => f.date <= end && (audience === 'All HS/K12' || f.audience === audience))
  const baseline = facts.filter(f => f.date >= COLLEGE_BASELINE && f.date < COLLEGE_CUTOFF && (!matched || !postDays.length || weekdays.has(weekday(f.date))))
  const post = facts.filter(f => f.date >= COLLEGE_CUTOFF)
  const names = (data?.roster ?? []).filter(n => n.toLowerCase().includes(search.toLowerCase()))
  const score = (rows: CollegeFact[], after = false) => after && !postDays.length ? { cc90: null, closes: null, pgc: null } : collegeTotal(rows)
  const summary = (name: string, before: CollegeFact[], after: CollegeFact[]) => {
    const a = score(before), b = score(after, true)
    return <tr key={name} className="border-t border-slate-100"><th className="px-4 py-3 text-left font-medium">{name}</th><td className={cell}>{count(a.cc90)}</td><td className={cell}>{count(a.closes)}</td><td className={cell}>{pct(a.pgc)}</td><td className={cell}>{count(b.cc90)}</td><td className={cell}>{count(b.closes)}</td><td className={cell}>{pct(b.pgc)}</td><td className={cell}>{change(a.pgc, b.pgc)}</td><td className="px-4 py-3 text-xs text-slate-500">{!postDays.length ? 'Awaiting completed post days' : a.cc90 == null || b.cc90 == null ? 'Missing counts' : a.cc90 === 0 || b.cc90 === 0 ? 'No qualifying volume in one period' : Math.min(a.cc90, b.cc90) < 20 ? 'Small sample (<20 CC90)' : 'Available'}</td></tr>
  }
  const headings = <tr>{['Rep / audience', 'Pre CC90', 'Pre closes', 'Pre pGC', 'Post CC90', 'Post closes', 'Post pGC', 'Change', 'Sample'].map(h => <th key={h} className={cell}>{h}</th>)}</tr>
  const trendFacts = facts.filter(f => !rep || f.name === rep)
  const trendDays = [...new Set(trendFacts.map(f => f.date))].sort()
  return <section className="mx-auto max-w-6xl space-y-5 px-4 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">College → HS/K12</h2><p className="text-sm text-slate-500">Overall and per-rep performance around October 1, 2026.</p></div><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={loading} onClick={() => setRefresh(v => v + 1)}>{loading ? 'Loading College…' : 'Refresh College'}</button></div>
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-800">{error} No substitute or cached figures are shown.</p>}
    {loading && <p role="status">Retrieving College membership and HS/K12 call results…</p>}
    {data && <>
      <div className="rounded-2xl bg-slate-50 p-4 text-sm space-y-2"><p><strong>Pre:</strong> September 3–30, 2026 · <strong>Post:</strong> {postDays.length ? `October 1–${end}` : 'October 1 onward; no completed days'}{includeToday ? ' (today provisional)' : ' (completed calendar days)'}</p><p>{data.membership}</p><p>Source: <a className="underline" href="https://varsitytutors.looker.com/dashboards/sales::call_duration_per_rep_by_supergroup">Looker sales dashboard explore</a> ({data.source}). Retrieved {new Date(data.refreshedAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT. Latest returned activity: {data.facts.map(f => f.date).sort().at(-1) ?? 'none'}. Retrieval time does not certify upstream freshness.</p><p>pGC = call-attributed closes ÷ CC90; reconciliation to dashboard pGC remains pending. Totals are weighted from counts. College membership follows the source, so transfers may affect comparison.</p></div>
      <div className="flex flex-wrap items-center gap-4 text-sm"><label>Audience <select className="rounded-lg border p-2" value={audience} onChange={e => setAudience(e.target.value)}>{['All HS/K12', 'HS-STEM', 'K12 Test Prep'].map(a => <option key={a}>{a}</option>)}</select></label><label><input type="checkbox" checked={includeToday} onChange={e => setIncludeToday(e.target.checked)} /> Include today (partial)</label><label><input type="checkbox" checked={matched} onChange={e => setMatched(e.target.checked)} /> Match baseline weekdays to post period</label></div>
      {!postDays.length && <p className="rounded-xl bg-blue-50 p-4 text-sm">No completed post–October 1 days yet. Enable “Include today” for a provisional first look. Post metrics stay blank until a post period is available.</p>}
      <p className="text-xs text-slate-500">{matched && postDays.length ? 'Baseline includes only weekdays represented in the post period. Period lengths still differ; compare rates, not raw totals.' : 'Baseline uses all four weeks.'} No returned qualifying rows are shown as zero volume; returned blank counts stay unknown (—). An empty source may also reflect upstream delay.</p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200"><table className="w-full text-sm"><caption className="p-4 text-left font-semibold">Overall · {data.roster.length} College reps in source roster</caption><thead className="bg-slate-50 text-xs">{headings}</thead><tbody>{summary('All selected work', baseline, post)}{audience === 'All HS/K12' && ['HS-STEM', 'K12 Test Prep'].map(a => summary(a, baseline.filter(f => f.audience === a), post.filter(f => f.audience === a)))}</tbody></table></div>
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Rep comparison</h3><input className="rounded-lg border p-2 text-sm" aria-label="Search College reps" placeholder="Find a rep…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200"><table className="w-full text-sm"><thead className="bg-slate-50 text-xs">{headings}</thead><tbody>{names.map(n => summary(n, baseline.filter(f => f.name === n), post.filter(f => f.name === n)))}</tbody></table>{!names.length && <p className="p-4">No matching reps.</p>}</div>
      <div className="flex flex-wrap items-center gap-3"><h3 className="font-semibold">Daily trend</h3><select aria-label="Trend rep" className="rounded-lg border p-2 text-sm" value={rep} onChange={e => setRep(e.target.value)}><option value="">Overall College</option>{data.roster.map(n => <option key={n}>{n}</option>)}</select><span className="text-xs text-slate-500">Uses selected audience; full daily history, independent of weekday matching.</span></div>
      <div className="max-h-96 overflow-auto rounded-2xl border border-slate-200"><table className="w-full text-sm"><thead className="sticky top-0 bg-slate-50"><tr>{['Date (CT)', 'Period', 'CC90', 'Closes', 'pGC', '7-day pGC'].map(h => <th className={cell} key={h}>{h}</th>)}</tr></thead><tbody>{trendDays.map(d => { const t = collegeTotal(trendFacts.filter(f => f.date === d)); const rolling = collegeTotal(trendFacts.filter(f => f.date <= d && f.date >= addDays(d, -6))); return <tr key={d} className={`border-t ${d >= COLLEGE_CUTOFF ? 'bg-blue-50/50' : ''}`}><td className={cell}>{d}{d === data.today ? ' *' : ''}</td><td className={cell}>{d < COLLEGE_CUTOFF ? 'Pre' : 'Post'}</td><td className={cell}>{count(t.cc90)}</td><td className={cell}>{count(t.closes)}</td><td className={cell}>{pct(t.pgc)}</td><td className={cell}>{pct(rolling.pgc)}</td></tr> })}</tbody></table>{!trendDays.length && <p className="p-4">No qualifying activity returned for this selection.</p>}</div>
    </>}
  </section>
}
