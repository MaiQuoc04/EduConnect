// Unit tests for the FE-10 automatic scheduling solver (UC-123): the fixed-slot subject (HĐTN – Chào cờ, Sinh hoạt
// lớp) never goes to a teacher who is busy at a fixed slot because of a class outside the run (25/11/2026: 12D1 got
// the teacher who has Chào cờ in 10A1 at the same time, and its two fixed lessons could not be placed).
// Run: npm test (node --test, no extra package).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assignTeachers, solveTimetable } from './timetable.auto.solver.js';

const HDTN = '9';
const MATH = '1';
const fixed = { subjectId: HDTN, slots: [{ weekday: 1, period: 1, label: 'Chào cờ' }, { weekday: 5, period: 5, label: 'Sinh hoạt lớp' }] };
const options = { teacherMaxWeek: 25, fixed, seed: 1, timeLimitMs: 300 };
const days = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, periods: [1, 2, 3, 4, 5] }));
const teacher = (teacherId, subjectIds, extra = {}) => ({ teacherId, subjectIds, homeroom: false, baseLoad: 0, busy: [], ...extra });
const cls = (classId, homeroomTeacherId) => ({
  classId,
  className: `12-${classId}`,
  homeroomTeacherId,
  subjects: [{ subjectId: HDTN, periods: 3 }, { subjectId: MATH, periods: 4 }],
});

describe('assignTeachers – fixed-slot subject', () => {
  it('skips the homeroom teacher who teaches another class at a fixed slot', () => {
    // T1 is the homeroom teacher of class 1 but has Chào cờ in a class outside the run (Monday period 1).
    const teachers = [
      teacher('T1', [HDTN], { homeroom: true, busy: ['1-1'] }),
      teacher('T2', [HDTN]),
      teacher('T3', [HDTN]),
      teacher('M', [MATH]),
    ];
    const { assignments, unassigned } = assignTeachers({ classes: [cls('1', 'T1'), cls('2', null)], teachers, options });
    assert.notEqual(assignments[`1:${HDTN}`], 'T1');
    assert.notEqual(assignments[`2:${HDTN}`], 'T1');
    assert.notEqual(assignments[`1:${HDTN}`], assignments[`2:${HDTN}`]);
    assert.deepEqual(unassigned, []);
  });

  it('leaves the pair unassigned (FIXED_CLASH) when every qualified teacher is busy at a fixed slot', () => {
    const teachers = [teacher('T1', [HDTN], { busy: ['5-5'] }), teacher('M', [MATH])];
    const { assignments, unassigned } = assignTeachers({ classes: [cls('1', null)], teachers, options });
    assert.equal(assignments[`1:${HDTN}`], undefined);
    assert.deepEqual(unassigned, [{ classId: '1', subjectId: HDTN, reason: 'FIXED_CLASH' }]);
  });

  it('places every fixed lesson in its fixed cell once the teachers are chosen', () => {
    const teachers = [
      teacher('T1', [HDTN], { homeroom: true, busy: ['1-1', '5-5'] }),
      teacher('T2', [HDTN]),
      teacher('T3', [HDTN]),
      teacher('M1', [MATH]),
      teacher('M2', [MATH]),
    ];
    const classes = [cls('1', 'T1'), cls('2', null)];
    const { assignments } = assignTeachers({ classes, teachers, options });
    const { entries, unplaced } = solveTimetable({ days, classes, assignments, teachers, options });
    assert.deepEqual(unplaced, []);
    for (const c of classes) {
      for (const f of fixed.slots) {
        const at = entries[c.classId].find((e) => e.weekday === f.weekday && e.period === f.period);
        assert.equal(String(at?.subjectId), HDTN, `${c.className} ${f.label}`);
      }
    }
  });
});
