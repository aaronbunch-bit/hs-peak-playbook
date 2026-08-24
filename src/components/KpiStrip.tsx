import { formatPgc, formatPts, type WeekKpis } from '../lib/pacer'

type Props = {
  current: WeekKpis
  prior: WeekKpis | null
  compareWow: boolean
  targetPgc: number
  wtdPgc: number | null
  wtdReady: boolean
  suggestedCount: number
  selectedWeekLabel: string
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
  const label = kind === 'pgc' ? formatPts(delta) : `${delta > 0 ? '+' : ''}${delta}`
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
}: Props) {
  const cards = [
    {
      label: 'Team pGC',
      value: formatPgc(current.teamPgc),
      hint: compareWow ? (
        <DeltaHint current={current.teamPgc} prior={prior?.teamPgc ?? null} kind="pgc" />
      ) : (
        `CC90-weighted · LC4 bar ${formatPgc(targetPgc)} · ${selectedWeekLabel}`
      ),
    },
    {
      label: 'WTD pGC',
      value: formatPgc(wtdPgc),
      hint: wtdReady ? 'this Sunday → today' : 'awaiting Looker',
    },
    {
      label: 'At target',
      value: String(current.atTarget),
      hint: compareWow ? (
        <DeltaHint current={current.atTarget} prior={prior?.atTarget ?? null} kind="count" />
      ) : (
        `of ${current.n} shown`
      ),
    },
    {
      label: 'Improving',
      value: String(current.improving),
      hint: compareWow ? (
        <DeltaHint current={current.improving} prior={prior?.improving ?? null} kind="count" />
      ) : (
        'Δ WoW ≥ +3.0 pts'
      ),
    },
    {
      label: 'Focus that week',
      value: String(current.focusCount),
      hint: compareWow ? (
        <DeltaHint current={current.focusCount} prior={prior?.focusCount ?? null} kind="count" />
      ) : (
        `${suggestedCount} suggested now`
      ),
    },
  ]

  return (
    <section className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-4 sm:grid-cols-5 sm:px-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 shadow-sm shadow-slate-200/70"
        >
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{c.label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{c.value}</p>
          <p className="text-xs text-slate-400">{c.hint}</p>
        </div>
      ))}
    </section>
  )
}
