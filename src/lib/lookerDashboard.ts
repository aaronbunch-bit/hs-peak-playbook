/** LookML dashboard used for playbook history, WTD, routing, and Intraday. */
export const DEFAULT_LOOKER_DASHBOARD_ID = 'sales::call_duration_per_rep_by_supergroup'

export type LookerQuery = {
  id?: number
  model?: string
  view?: string
  fields?: string[]
  pivots?: string[]
  filters?: Record<string, string>
  sorts?: string[]
  limit?: string | number
  dynamic_fields?: string | unknown[]
  query_timezone?: string
  fill_fields?: string[]
  vis_config?: unknown
  filter_expression?: string
}

export type LookerExplore = {
  query: LookerQuery
  timeFilter: string
  weekField: string
  dateField: string
  repNameField: string
  sourceLabel: string
}

export type DashboardFilter = {
  dimension?: string
  default_value?: string | null
  field?: { name?: string }
}

export type DashboardElement = {
  title?: string | null
  query_id?: number
  query?: LookerQuery
  look?: { query?: LookerQuery; query_id?: number }
  result_maker?: { query?: LookerQuery; query_id?: number }
}

export type LookerDashboard = {
  id?: string
  title?: string
  dashboard_elements?: DashboardElement[]
  dashboard_filters?: DashboardFilter[]
}

const PLAYBOOK_FALLBACK_VIEW = 'call_data_with_coselling'

export function toLookerQuery(raw: LookerQuery | undefined | null): LookerQuery | null {
  if (!raw?.model || !raw.view) return null
  return {
    id: raw.id,
    model: raw.model,
    view: raw.view,
    fields: raw.fields,
    pivots: raw.pivots,
    filters: raw.filters ? { ...raw.filters } : undefined,
    sorts: raw.sorts,
    limit: raw.limit,
    dynamic_fields: raw.dynamic_fields,
    query_timezone: raw.query_timezone,
    fill_fields: raw.fill_fields,
    vis_config: raw.vis_config,
    filter_expression: raw.filter_expression,
  }
}

function queriesOnElement(element: DashboardElement): LookerQuery[] {
  const out: LookerQuery[] = []
  for (const raw of [element.query, element.result_maker?.query, element.look?.query]) {
    const q = toLookerQuery(raw)
    if (q) out.push(q)
  }
  return out
}

/** Prefer a per-rep pGC / CC90 tile over text or unrelated charts. */
export function scoreLookerQuery(query: LookerQuery, title = ''): number {
  const blob = [
    title,
    query.view ?? '',
    ...(query.fields ?? []),
    ...Object.keys(query.filters ?? {}),
    ...(query.pivots ?? []),
  ]
    .join(' ')
    .toLowerCase()
  let score = 0
  if (blob.includes('pgc')) score += 8
  if (blob.includes('cc90')) score += 8
  if (blob.includes('audience')) score += 4
  if (blob.includes('mgr_name') || blob.includes('consultant') || blob.includes('rep_name')) score += 4
  if (blob.includes('supergroup') || blob.includes('super_group')) score += 3
  if (blob.includes('call_duration') || blob.includes('call_data')) score += 2
  if ((query.fields?.length ?? 0) >= 4) score += 2
  if (query.fields?.length) score += 1
  return score
}

export function pickDashboardQuery(dashboard: LookerDashboard): LookerQuery | null {
  let best: LookerQuery | null = null
  let bestScore = -1
  for (const element of dashboard.dashboard_elements ?? []) {
    for (const query of queriesOnElement(element)) {
      const score = scoreLookerQuery(query, element.title ?? '')
      if (score > bestScore) {
        best = query
        bestScore = score
      }
    }
  }
  return best
}

export function applyDashboardDefaultFilters(query: LookerQuery, filters: DashboardFilter[] | undefined): LookerQuery {
  if (!filters?.length) return query
  const next = { ...query, filters: { ...(query.filters ?? {}) } }
  for (const filter of filters) {
    const dimension = filter.dimension || filter.field?.name
    const value = filter.default_value
    if (!dimension || value == null || value === '') continue
    if (next.filters![dimension]) continue
    next.filters![dimension] = String(value)
  }
  return next
}

function pickField(candidates: string[], needles: string[], fallback: string): string {
  for (const needle of needles) {
    const hit = candidates.find((field) => field === needle || field.endsWith(`.${needle}`))
    if (hit) return hit
  }
  return fallback
}

export function exploreFromQuery(query: LookerQuery, sourceLabel: string): LookerExplore {
  const view = query.view || PLAYBOOK_FALLBACK_VIEW
  const candidates = [...(query.fields ?? []), ...Object.keys(query.filters ?? {}), ...(query.fill_fields ?? [])]
  const weekField = pickField(candidates, ['call_created_at_week', 'created_at_week'], `${view}.call_created_at_week`)
  const dateFromWeek = weekField.replace(/_week$/, '_date')
  const timeFromWeek = weekField.replace(/_week$/, '_time')
  const dateField = pickField(candidates, ['call_created_at_date', 'created_at_date'], dateFromWeek)
  const timeFilter = pickField(candidates, ['call_created_at_time', 'created_at_time'], timeFromWeek)
  const repNameField = pickField(
    candidates,
    ['mgr_name', 'consultant_name', 'consultant', 'rep_name'],
    `${view}.mgr_name`,
  )
  return {
    query,
    timeFilter,
    weekField,
    dateField: dateField === weekField ? dateFromWeek : dateField,
    repNameField,
    sourceLabel,
  }
}

/** Map dashboard-7699 leaf filters onto whatever explore this query uses. */
export function dash7699Filters(explore: LookerExplore): Record<string, string> {
  const view = explore.query.view || explore.timeFilter.split('.')[0] || PLAYBOOK_FALLBACK_VIEW
  return {
    [`${view}.business`]: 'International,VT Core',
    [`${view}.expert_type`]: '-Dropped Expert',
    [`${view}.consultant_cc90`]: 'Yes',
  }
}

export function dailyFieldsFor(explore: LookerExplore): string[] {
  return (explore.query.fields ?? []).map((field) => (field === explore.weekField ? explore.dateField : field))
}

export function dailyFillFields(explore: LookerExplore): string[] | undefined {
  if (!explore.query.fill_fields?.length) return explore.query.fill_fields
  return explore.query.fill_fields.map((field) => (field === explore.weekField ? explore.dateField : field))
}

export function queryIdFromElement(element: DashboardElement): number | undefined {
  return element.query?.id ?? element.query_id ?? element.result_maker?.query?.id ?? element.look?.query?.id
}
