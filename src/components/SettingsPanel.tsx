import { formatPgc } from '../lib/pacer'
import { LC_LEVELS } from '../lib/roster'
import type { AppSettings, LcCurves } from '../lib/settings'
import { expectedPgc } from '../lib/settings'

type Props = {
  open: boolean
  settings: AppSettings
  onChange: (next: AppSettings) => void
  onClose: () => void
}

function PctInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (n: number) => void
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={Number((value * 100).toFixed(1))}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums"
        />
        <span className="text-sm text-slate-400">%</span>
      </div>
    </label>
  )
}

export function SettingsPanel({ open, settings, onChange, onClose }: Props) {
  if (!open) return null
  const t = settings.targets
  const curves = settings.lcCurves
  const s = settings.suggest

  const setCurve = (level: keyof LcCurves, value: number) => {
    onChange({ ...settings, lcCurves: { ...curves, [level]: value } })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-slate-900/25" aria-label="Close settings" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-400 uppercase">Settings</p>
            <h2 className="text-xl font-semibold text-slate-900">Targets & focus rules</h2>
            <p className="text-sm text-slate-500">Edit pGC expectations and suggestion rules here.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-2.5 py-1 text-sm text-slate-500 hover:bg-slate-100">
            Close
          </button>
        </div>

        <div className="space-y-8 px-5 py-5">
          <section>
            <h3 className="text-sm font-semibold text-slate-800">pGC targets</h3>
            <p className="mt-1 text-sm text-slate-500">
              LC4 is held to these bars. HS-STEM uses HS. K12TP uses K12. Supergroup uses Super (Looker Total pGC).
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <PctInput label="HS" value={t.hs} onChange={(hs) => onChange({ ...settings, targets: { ...t, hs } })} />
              <PctInput label="K12" value={t.k12} onChange={(k12) => onChange({ ...settings, targets: { ...t, k12 } })} />
              <PctInput
                label="Super"
                value={t.super}
                onChange={(superTarget) => onChange({ ...settings, targets: { ...t, super: superTarget } })}
              />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-800">Learning Curve</h3>
            <p className="mt-1 text-sm text-slate-500">
              LC1–3 are a percent of the audience target. Unknown LC uses the LC4 bar.
            </p>
            <div className="mt-4 grid grid-cols-4 gap-3">
              {LC_LEVELS.map((level) => (
                <PctInput
                  key={level}
                  label={level}
                  value={curves[level]}
                  onChange={(value) => setCurve(level, value)}
                />
              ))}
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-slate-200">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Expect</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      HS
                    </th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      K12
                    </th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      Super
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {LC_LEVELS.map((level) => (
                    <tr key={level} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {level}
                        <span className="ml-1.5 text-xs font-normal text-slate-400">
                          {(curves[level] * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {formatPgc(expectedPgc(t.hs, level, curves))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {formatPgc(expectedPgc(t.k12, level, curves))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {formatPgc(expectedPgc(t.super, level, curves))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-800">Suggested focus</h3>
            <p className="mt-1 text-sm text-slate-500">
              Suggestions never auto-tag anyone. “Below target” uses that rep’s LC expectation.
            </p>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={s.belowTarget}
                onChange={(e) => onChange({ ...settings, suggest: { ...s, belowTarget: e.target.checked } })}
              />
              Must be below the LC expectation
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={s.includeBelowWithoutDecline}
                onChange={(e) =>
                  onChange({ ...settings, suggest: { ...s, includeBelowWithoutDecline: e.target.checked } })
                }
              />
              Include below-target even if WoW is flat
            </label>
            <label className="mt-4 block text-sm">
              WoW decline of at least
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={2000}
                  step={25}
                  value={Math.round(s.wowDeclinePts * 10000)}
                  onChange={(e) =>
                    onChange({ ...settings, suggest: { ...s, wowDeclinePts: Number(e.target.value) / 10000 } })
                  }
                  className="w-24 rounded-xl border border-slate-200 px-3 py-2 tabular-nums"
                />
                <span className="text-slate-400">bps</span>
              </div>
            </label>
            <label className="mt-4 block text-sm">
              Minimum last-week cc90
              <input
                type="number"
                min={0}
                value={s.minCc90}
                onChange={(e) => onChange({ ...settings, suggest: { ...s, minCc90: Number(e.target.value) } })}
                className="mt-1 w-24 rounded-xl border border-slate-200 px-3 py-2 tabular-nums"
              />
            </label>
            <label className="mt-4 block text-sm">
              Max suggestions
              <input
                type="number"
                min={1}
                max={40}
                value={s.maxSuggestions}
                onChange={(e) => onChange({ ...settings, suggest: { ...s, maxSuggestions: Number(e.target.value) } })}
                className="mt-1 w-24 rounded-xl border border-slate-200 px-3 py-2 tabular-nums"
              />
            </label>
          </section>

          <section className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <h3 className="font-semibold text-slate-800">How Looker will update this</h3>
            <ol className="mt-2 list-decimal space-y-2 pl-4">
              <li>API key lives on Netlify (`LOOKER_CLIENT_ID` / secret), never in the browser.</li>
              <li>
                Closed weeks clone the HS Peak Playbook look for the last 12 Sunday weeks so Δ 3wk can compare the
                newest three vs the three before. Grain is Call Created At Week × Consultant, pivoted by Audience
                (HS-STEM and K12 Test Prep). Total pGC is Supergroup (volume-weighted). There is no Overall slice.
              </li>
              <li>WTD is the same look, Call Created At Date = this Sunday → now (daily standups).</li>
              <li>Deltas display in basis points (100 bps = 1%).</li>
              <li>Focus tags are per audience (HS, K12, Super) for that calendar week. Notes stamp to the week they are written.</li>
              <li>When the calendar rolls to a new Sunday, last week’s focus stays in history and this week starts empty.</li>
            </ol>
          </section>
        </div>
      </aside>
    </div>
  )
}
