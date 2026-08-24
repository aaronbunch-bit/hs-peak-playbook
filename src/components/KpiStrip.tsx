import { formatBps, formatPgc, IMPROVE_PTS, type WeekKpis } from '../lib/pacer'

type Props = {
  current: WeekKpis
  prior: WeekKpis | null
  compareWow: boolean
  targetPgc: number
  wtdPgc: number | null
  wtdReady: boolean
  suggestedCount: number
  selectedWeekLabel: string
  onCompareWow: (value: boolean) => void
}

function DeltaHint({
  current,
  prior,
  kind,
}: {
  current: number | null
  prior: number | null
  kind: 'count' | 'pgc'
}) {
  if (current == null || prior == null) return null
  const delta = current - prior
  if (delta === 0) return <span className="text-slate-400">vs last wk · 0</span>
  const label = kind === 'pgc' ? formatBps(delta) : `${delta > 0 ? '+' : ''}${delta}`
  const cls = delta > 0 ? 'text-emerald-600' : 'text-rose-600'
  return <span className={cls}>vs last wk {label}</span>
}

export function KpiStrip({
  current,
  prior,
  compareWow,
  targetPgc,
  wtdPgc,
  wtdReady,
  suggestedCount,
  selectedWeekLabel,
  onCompareWow,
}: Props) {
  const cards = [
    {
      label: 'Team pGC',
      tone: 'magenta',
      value: formatPgc(current.teamPgc),
      hint: compareWow ? (
        <DeltaHint current={current.teamPgc} prior={prior?.teamPgc ?? null} kind="pgc" />
      ) : (
        `CC90-weighted · LC4 ${formatPgc(targetPgc)} · ${selectedWeekLabel}`
      ),
    },
    {
      label: 'WTD pGC',
      tone: 'sky',
      value: formatPgc(wtdPgc),
      hint: wtdReady ? 'this Sunday → today' : 'awaiting Looker',
    },
    {
      label: 'At target',
      tone: 'emerald',
      value: String(current.atTarget),
      hint: compareWow ? (
        <DeltaHint current={current.atTarget} prior={prior?.atTarget ?? null} kind="count" />
      ) : (
        `of ${current.n} shown`
      ),
    },
    {
      label: 'Improving',
      tone: 'amber',
      value: String(current.improving),
      hint: compareWow ? (
        <DeltaHint current={current.improving} prior={prior?.improving ?? null} kind="count" />
      ) : (
        `Δ WoW ≥ ${formatBps(IMPROVE_PTS)}`
      ),
    },
    {
      label: 'Focus that week',
      tone: 'violet',
      value: String(current.focusCount),
      hint: compareWow ? (
        <DeltaHint current={current.focusCount} prior={prior?.focusCount ?? null} kind="count" />
      ) : (
        `${suggestedCount} suggested now`
      ),
    },
  ]

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase">This view</p>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-white/70 hover:text-slate-800"
          data-on={compareWow}
          onClick={() => onCompareWow(!compareWow)}
        >
          {compareWow ? 'Comparing WoW' : 'Compare WoW'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="kpi-card px-4 py-3" data-tone={c.tone}>
            <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{c.value}</p>
            <p className="text-xs text-slate-400">{c.hint}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
