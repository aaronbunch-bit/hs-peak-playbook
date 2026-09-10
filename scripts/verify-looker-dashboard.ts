import assert from 'node:assert/strict'
import { factsToIntraday, parseIntradayFromCsv } from '../src/lib/intraday.ts'
import {
  applyDashboardDefaultFilters,
  dash7699Filters,
  exploreFromQuery,
  pickDashboardQuery,
  scoreLookerQuery,
} from '../src/lib/lookerDashboard.ts'
import { parseLookerPlaybook } from '../src/lib/lookerExport.ts'
import { emptyOverflowAllowlist } from '../src/lib/overflowAllowlist.ts'

const playbookQuery = {
  model: 'sales',
  view: 'call_duration_per_rep_by_supergroup',
  fields: [
    'call_duration_per_rep_by_supergroup.call_created_at_week',
    'call_duration_per_rep_by_supergroup.mgr_name',
    'call_duration_per_rep_by_supergroup.pgc',
    'call_duration_per_rep_by_supergroup.cc90_count',
  ],
  filters: {},
}

const otherQuery = {
  model: 'sales',
  view: 'something_else',
  fields: ['something_else.count'],
}

const picked = pickDashboardQuery({
  dashboard_elements: [
    { title: 'Notes', query: otherQuery },
    { title: 'pGC by rep', result_maker: { query: playbookQuery } },
  ],
})
assert.equal(picked?.view, 'call_duration_per_rep_by_supergroup')
assert.ok(scoreLookerQuery(playbookQuery, 'pGC by rep') > scoreLookerQuery(otherQuery, 'Notes'))

const withDefaults = applyDashboardDefaultFilters(playbookQuery, [
  { dimension: 'call_duration_per_rep_by_supergroup.business', default_value: 'VT Core' },
  { dimension: 'call_duration_per_rep_by_supergroup.mgr_name', default_value: 'skip me' },
])
assert.equal(withDefaults.filters?.['call_duration_per_rep_by_supergroup.business'], 'VT Core')

const explore = exploreFromQuery(playbookQuery, 'Looker dashboard sales::call_duration_per_rep_by_supergroup')
assert.equal(explore.weekField, 'call_duration_per_rep_by_supergroup.call_created_at_week')
assert.equal(explore.dateField, 'call_duration_per_rep_by_supergroup.call_created_at_date')
assert.equal(explore.timeFilter, 'call_duration_per_rep_by_supergroup.call_created_at_time')
assert.equal(explore.repNameField, 'call_duration_per_rep_by_supergroup.mgr_name')
assert.equal(dash7699Filters(explore)['call_duration_per_rep_by_supergroup.business'], 'International,VT Core')

const csv = `HS-STEM,HS-STEM,HS-STEM,HS-STEM,K12 Test Prep,K12 Test Prep,K12 Test Prep,K12 Test Prep,Total pGC
Call Created At Week,Work Super Group,Consultant,Rep Manager,HS-STEM CC90 Count,HS-STEM Closed Client Count,HS-STEM pGC,HS-STEM CC90 Mix,K12 Test Prep CC90 Count,K12 Test Prep Closed Client Count,K12 Test Prep pGC,K12 Test Prep CC90 Mix,Total pGC
2026-09-07,High School,Ada Rep,Pat Manager,10,2,0.2,1,5,1,0.2,0,0.2
`
const facts = parseLookerPlaybook(csv)
assert.equal(facts.length, 1)
const rows = factsToIntraday(facts, emptyOverflowAllowlist())
assert.equal(rows.length, 1)
assert.equal(rows[0]?.name, 'Ada Rep')
assert.equal(rows[0]?.hsCc90, 10)
assert.equal(rows[0]?.hsSold, 2)
assert.equal(rows[0]?.k12Cc90, 5)
assert.equal(rows[0]?.superCc90, 15)
assert.equal(parseIntradayFromCsv(csv, emptyOverflowAllowlist()).length, 1)

console.log('verify-looker-dashboard: ok')
