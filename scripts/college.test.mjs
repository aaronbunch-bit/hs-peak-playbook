import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreCounts, eligibleRoster, comparisonRow, sortComparisons, bottomQuartile, defaultSelection, validateSelection, selectionFromParams, selectionParams, shiftDate } from '../src/lib/college.ts'

const row = (id, flag, name = `Rep ${id}`) => ({ 'gld_employee_directory.mgr_id': id, 'gld_employee_directory.mgr_name': name, 'gld_employee_directory.is_termed': flag })
test('rates use their own denominators and retain nulls and zero', () => {
  assert.deepEqual(scoreCounts({ cc90: 100, closes: 28, firstConnects: 80, escvrCloses: 28 }), { cc90: 100, closes: 28, firstConnects: 80, escvrCloses: 28, pgc: .28, escvr: .35 })
  assert.equal(scoreCounts({ cc90: 10, closes: 2, firstConnects: 0, escvrCloses: 2 }).escvr, null)
  assert.equal(scoreCounts({ cc90: null, closes: 2, firstConnects: 10, escvrCloses: 2 }).pgc, null)
  assert.equal(scoreCounts({ cc90: 10, closes: null, firstConnects: 10, escvrCloses: null }).escvr, null)
  assert.equal(scoreCounts({ cc90: 10, closes: 0, firstConnects: 10, escvrCloses: 0 }).escvr, 0)
  assert.equal(scoreCounts({ cc90: 10, closes: 6, firstConnects: 4, escvrCloses: 3 }).escvr, .75)
  assert.equal(scoreCounts().pgc, null)
})
test('termination overrides conflicting rows; unknown status is excluded', () => {
  const result = eligibleRoster([row(1, 'No'), row(1, 'No'), row(2, 'No'), row(2, 'Yes'), row(3, null), row(4, 'Yes')])
  assert.deepEqual(result.roster, [{ id: '1', name: 'Rep 1' }])
  assert.equal(result.excludedTerminated, 2)
  assert.equal(result.excludedUnknown, 1)
})
test('stable IDs retain two different people with the same name', () => {
  assert.equal(eligibleRoster([row(1, 'No', 'Same Name'), row(2, 'No', 'Same Name')]).roster.length, 2)
  assert.throws(() => eligibleRoster([row(null, 'No')]), /invalid rep ID/)
  assert.throws(() => eligibleRoster([row(1, 'No', 'First'), row(1, 'No', 'Other')]), /ambiguous/)
})

const comp = (id, closes, volume = 20) => comparisonRow(String(id), `Rep ${id}`, { cc90: volume, closes, firstConnects: volume, escvrCloses: closes }, { cc90: volume, closes, firstConnects: volume, escvrCloses: closes })
test('sorting numeric columns and changes keeps unknowns last either direction', () => {
  const rows = [comp(1, 2), comp(2, 10), comp(3, null), comp(4, 0)]
  assert.deepEqual(sortComparisons(rows, 'after.escvr', false).map(r => r.id), ['4', '1', '2', '3'])
  assert.deepEqual(sortComparisons(rows, 'after.closes', true).map(r => r.id), ['2', '1', '4', '3'])
  assert.deepEqual(sortComparisons(rows, 'deltaPgc', true).map(r => r.id), ['1', '2', '4', '3'])
})
test('quartiles exclude small samples and unknown rates and include boundary ties', () => {
  const rows = [comp(1, 2), comp(2, 2), comp(3, 6), comp(4, 7), comp(5, 8), comp(6, 9), comp(7, 10), comp(8, 11), comp(9, 0, 1), comp(10, null)]
  const q = bottomQuartile(rows, 'after', 'pgc', 20)
  assert.equal(q.eligibleCount, 8)
  assert.deepEqual([...q.ids], ['1', '2'])
  assert.equal(q.cutoff, .1)
  assert.equal(bottomQuartile(rows.slice(0, 3), 'before', 'escvr', 20).ids.size, 0)
  assert.equal(bottomQuartile([comp(1, 2), comp(2, 2), comp(3, 2), comp(4, 5)], 'after', 'pgc', 20).ids.size, 3)
})
test('independent date ranges roundtrip and reject future, reversed, invalid, or overlong dates', () => {
  const today = '2026-10-01'
  const selection = defaultSelection(today)
  const params = selectionParams(selection)
  params.set('after_start', '2026-09-28')
  params.set('after_end', '2026-09-30')
  const parsed = selectionFromParams(params, today)
  assert.deepEqual(parsed.before, selection.before)
  assert.deepEqual(parsed.after, { start: '2026-09-28', end: '2026-09-30' })
  assert.equal(validateSelection(parsed, today), null)
  for (const range of [{ start: '2026-02-30', end: today }, { start: today, end: '2026-09-30' }, { start: today, end: '2026-10-02' }, { start: '2024-01-01', end: today }]) assert.ok(validateSelection({ ...parsed, after: range }, today))
  params.set('direction', 'other')
  assert.throws(() => selectionFromParams(params, today), /Unknown/)
  params.set('direction', '__proto__')
  assert.throws(() => selectionFromParams(params, today), /Unknown/)
  assert.equal(shiftDate('2026-03-08', 1), '2026-03-09')
})
