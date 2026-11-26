// Unit tests for the periods-per-week rule of FE-10 (UC-71 / UC-72 / UC-73): a subject may not get more periods in
// the weekly pattern than track_subjects.periods_per_week (26/11/2026: Địa lí 10A1 was saved with 2 / 1 periods).
// Run: npm test (node --test, no database). saveVersion calls overQuota before it changes anything.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { overQuota } from './timetable.quota.js';

const subjects = [
  { subjectId: 7, code: 'DIA', name: 'Địa lí', periodsPerWeek: 1 },
  { subjectId: 1, code: 'TOAN', name: 'Toán', periodsPerWeek: 3 },
];
const entry = (weekday, slotId, subjectId) => ({ weekday, slotId: String(slotId), subjectId: String(subjectId), room: null });

describe('overQuota', () => {
  it('accepts exactly the periods per week', () => {
    assert.deepEqual(overQuota(subjects, [entry(1, 1, 7), entry(1, 2, 1), entry(2, 2, 1), entry(3, 2, 1)]), []);
  });
  it('accepts fewer periods (shown as "Thiếu" on the screen)', () => {
    assert.deepEqual(overQuota(subjects, [entry(1, 2, 1)]), []);
  });
  it('reports a subject with one period too many', () => {
    assert.deepEqual(overQuota(subjects, [entry(1, 4, 7), entry(2, 6, 7)]), [{ subject: 'Địa lí', periods: 2, periodsPerWeek: 1 }]);
  });
  it('reports every subject over its quota', () => {
    const e = [entry(1, 1, 7), entry(2, 1, 7), entry(1, 2, 1), entry(2, 2, 1), entry(3, 2, 1), entry(4, 2, 1)];
    assert.deepEqual(overQuota(subjects, e).map((i) => [i.subject, i.periods]), [['Địa lí', 2], ['Toán', 4]]);
  });
  it('compares ids given as numbers or strings', () => {
    assert.equal(overQuota(subjects, [{ subjectId: 7 }, { subjectId: '7' }]).length, 1);
  });
});
