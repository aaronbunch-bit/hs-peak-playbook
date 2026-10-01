import test from 'node:test'
import assert from 'node:assert/strict'
import { collegeTotal, eligibleRoster } from '../src/lib/college.ts'

const row = (id, flag, name = `Rep ${id}`) => ({ 'gld_employee_directory.mgr_id': id, 'gld_employee_directory.mgr_name': name, 'gld_employee_directory.is_termed': flag })
test('weighted rates preserve blank counts and empty results', () => {
  assert.equal(collegeTotal([{ cc90: 10, closes: 1 }, { cc90: 90, closes: 27 }]).pgc, 0.28)
  assert.equal(collegeTotal([{ cc90: null, closes: 1 }]).pgc, null)
  assert.equal(collegeTotal([{ cc90: 10, closes: null }]).closes, null)
  assert.deepEqual(collegeTotal([]), { cc90: null, closes: null, pgc: null })
  assert.deepEqual(collegeTotal([{ cc90: 0, closes: 0 }]), { cc90: 0, closes: 0, pgc: null })
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
