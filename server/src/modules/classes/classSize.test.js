import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkBody } from '../school-settings/schoolSettings.service.js';
import { assessClassSize } from './classSize.js';

// FE-04 class size settings (27/11/2026): warning 45, hard cap 55 by default.
const LIMITS = { warnStudents: 45, maxStudents: 55 };
const code = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return { code: err.code, status: err.status, details: err.details };
  }
};

describe('assessClassSize', () => {
  it('accepts a class up to the recommended size', () => {
    assert.equal(code(() => assessClassSize([{ className: '10A1', current: 44, adding: 1 }], LIMITS)), null);
  });

  it('asks for a confirmation above the recommended size', () => {
    const r = code(() => assessClassSize([{ className: '10A1', current: 45, adding: 1 }], LIMITS));
    assert.equal(r.code, 'MSG_CLASS_OVER_WARNING');
    assert.equal(r.status, 409);
    assert.deepEqual(r.details.classes, [{ className: '10A1', current: 45, after: 46 }]);
  });

  it('accepts it once confirmed, up to the hard cap', () => {
    const run = () => assessClassSize([{ className: '10A1', current: 50, adding: 5 }], LIMITS, { confirmOverWarning: true });
    assert.equal(code(run), null);
  });

  it('refuses above the hard cap even when confirmed', () => {
    const r = code(() => assessClassSize([{ className: '10A1', current: 55, adding: 1 }], LIMITS, { confirmOverWarning: true }));
    assert.equal(r.code, 'MSG_CLASS_FULL');
    assert.equal(r.details.max, 55);
    assert.equal(r.details.current, 55);
  });

  it('lists every class above the recommended size (promotion into several classes)', () => {
    const r = code(() => assessClassSize([
      { className: '11A1', current: 40, adding: 8 },
      { className: '11A2', current: 30, adding: 5 },
      { className: '11A3', current: 44, adding: 3 },
    ], LIMITS));
    assert.deepEqual(r.details.classes.map((c) => c.className), ['11A1', '11A3']);
  });

  it('ignores a class the request adds nobody to, even when it is already above a lowered limit', () => {
    assert.equal(code(() => assessClassSize([{ className: '10A1', current: 58, adding: 0 }], LIMITS)), null);
  });
});

describe('school settings cross checks (FE-04)', () => {
  const teaching = { teacherMaxWeek: 25, classMaxDay: 7, classMaxWeek: 38, subjectMaxWeek: 10 };

  it('accepts the defaults', () => {
    assert.deepEqual(checkBody({ teaching, classes: { warnStudents: 45, maxStudents: 55 } }).classes, {
      warnStudents: 45,
      maxStudents: 55,
    });
  });

  it('refuses a recommended size above the hard cap', () => {
    const r = code(() => checkBody({ classes: { warnStudents: 50, maxStudents: 48 } }));
    assert.deepEqual([r.code, r.details.reason, r.details.field], ['MSG_SCHOOL_SETTINGS_INVALID', 'ABOVE_MAX_STUDENTS', 'warnStudents']);
  });

  it('refuses periods of one subject above the week of a class', () => {
    const r = code(() => checkBody({ teaching: { ...teaching, classMaxWeek: 10, subjectMaxWeek: 12 } }));
    assert.deepEqual([r.details.reason, r.details.field, r.details.max], ['ABOVE_CLASS_WEEK', 'subjectMaxWeek', 10]);
  });

  it('caps one subject at 12 periods (2 a day × 6 days) and class size at 10–60', () => {
    assert.equal(code(() => checkBody({ teaching: { ...teaching, subjectMaxWeek: 13 } })).details.reason, 'RANGE');
    assert.equal(code(() => checkBody({ classes: { warnStudents: 45, maxStudents: 61 } })).details.reason, 'RANGE');
    assert.equal(code(() => checkBody({ classes: { warnStudents: 9, maxStudents: 55 } })).details.reason, 'RANGE');
  });

  it('needs subjectMaxWeek whenever the teaching group is sent', () => {
    const { subjectMaxWeek: _omit, ...old } = teaching;
    assert.equal(code(() => checkBody({ teaching: old })).details.field, 'subjectMaxWeek');
  });
});
