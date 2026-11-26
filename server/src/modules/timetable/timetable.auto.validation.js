// FE-10 automatic scheduling – input checks (Dung, 17/11/2026). Shapes and ranges only; whether a class, teacher or
// subject exists and belongs to the year is checked in timetable.auto.js.
import { badRequest, notFound } from '../../utils/AppError.js';
import { DEFAULT_WEIGHTS } from './timetable.auto.solver.js';
import { AUTO_LIMITS as L, ERROR_CODES } from './timetable.constants.js';
import { isId } from './timetable.validation.js';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const bad = (field, reason, more = {}) => badRequest(ERROR_CODES.AUTO_INVALID, `Invalid ${field}.`, { field, reason, ...more });
const int = (v, field, min, max) => {
  const n = typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : v;
  if (!Number.isInteger(n) || n < min || n > max) throw bad(field, 'RANGE', { min, max });
  return n;
};
const idList = (v, field, max) => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max || v.some((x) => !isId(x))) throw bad(field, 'FORMAT');
  return [...new Set(v.map(String))];
};
const idMap = (v, field, min, max) => {
  if (v === undefined || v === null) return {};
  if (!isPlainObject(v) || Object.keys(v).length > 200) throw bad(field, 'FORMAT');
  const out = {};
  for (const [k, n] of Object.entries(v)) {
    if (!isId(k)) throw bad(field, 'FORMAT');
    if (n === null || n === '') continue; // blank = no limit / no change
    out[String(k)] = int(n, field, min, max);
  }
  return out;
};

// norm, homeroomNorm, maxOver and maxPerDay are no longer sent: they are the School Manager settings
// (school-settings module, Dung 21/11/2026) and timetable.auto.js reads them on every run and apply.
const FIELDS = ['schoolYearId', 'semesterId', 'classIds', 'mode', 'keepAssignments', 'grid', 'periods', 'maxPerSubjectDay', 'rooms', 'busy', 'heavySubjectIds', 'afternoonSubjectIds', 'fixed', 'weights',
  'seed', 'timeLimitSec'];
export const MODES = Object.freeze(['ALL', 'ASSIGN', 'TIMETABLE']);

// The settings of one run (POST /timetables/auto/run, and `config` of /apply).
export function autoConfig(b) {
  if (!isPlainObject(b)) throw bad('body', 'FORMAT');
  const extra = Object.keys(b).filter((k) => !FIELDS.includes(k));
  if (extra.length) throw bad(extra[0], 'UNKNOWN');
  if (!isId(b.schoolYearId)) throw notFound(ERROR_CODES.SCHOOL_YEAR_NOT_FOUND, 'School year not found.');
  if (!isId(b.semesterId)) throw notFound(ERROR_CODES.SEMESTER_NOT_FOUND, 'Semester not found.');
  const classIds = idList(b.classIds, 'classIds', L.CLASSES_MAX);
  if (!classIds.length) throw bad('classIds', 'REQUIRED');
  const mode = b.mode ?? 'ALL';
  if (!MODES.includes(mode)) throw bad('mode', 'FORMAT');

  if (!Array.isArray(b.grid) || !b.grid.length || b.grid.length > 7) throw bad('grid', 'FORMAT');
  const seen = new Set();
  const grid = b.grid.map((d) => {
    if (!isPlainObject(d)) throw bad('grid', 'FORMAT');
    const weekday = int(d.weekday, 'grid', 1, 7);
    if (seen.has(weekday)) throw bad('grid', 'DUPLICATE_DAY', { weekday });
    seen.add(weekday);
    return { weekday, morning: int(d.morning ?? 0, 'grid', 0, L.MORNING_MAX), afternoon: int(d.afternoon ?? 0, 'grid', 0, L.AFTERNOON_MAX) };
  }).filter((d) => d.morning + d.afternoon > 0).sort((x, y) => x.weekday - y.weekday);
  if (!grid.length) throw bad('grid', 'EMPTY');
  if (grid.length > L.DAYS_MAX) throw bad('grid', 'TOO_MANY_DAYS', { max: L.DAYS_MAX });
  if (grid.some((d) => d.weekday === 7)) throw bad('grid', 'SUNDAY');

  let busy = [];
  if (b.busy !== undefined && b.busy !== null) {
    if (!Array.isArray(b.busy) || b.busy.length > L.BUSY_MAX) throw bad('busy', 'FORMAT');
    busy = b.busy.map((x) => {
      if (!isPlainObject(x) || !isId(x.teacherId)) throw bad('busy', 'FORMAT');
      return { teacherId: String(x.teacherId), weekday: int(x.weekday, 'busy', 1, 7), period: int(x.period, 'busy', 1, 20) };
    });
  }

  let fixed = null;
  if (b.fixed !== undefined && b.fixed !== null) {
    if (!isPlainObject(b.fixed) || !isId(b.fixed.subjectId) || !Array.isArray(b.fixed.slots) || b.fixed.slots.length > 4) {
      throw bad('fixed', 'FORMAT');
    }
    const slots = b.fixed.slots.map((x) => {
      if (!isPlainObject(x)) throw bad('fixed', 'FORMAT');
      return { weekday: int(x.weekday, 'fixed', 1, 7), period: int(x.period, 'fixed', 1, 20), label: typeof x.label === 'string' ? x.label.slice(0, 40) : '' };
    });
    if (new Set(slots.map((x) => `${x.weekday}-${x.period}`)).size !== slots.length) throw bad('fixed', 'DUPLICATE_SLOT');
    fixed = { subjectId: String(b.fixed.subjectId), slots };
  }

  const weights = {};
  if (b.weights !== undefined && b.weights !== null) {
    if (!isPlainObject(b.weights)) throw bad('weights', 'FORMAT');
    for (const [k, v] of Object.entries(b.weights)) {
      if (!(k in DEFAULT_WEIGHTS)) throw bad('weights', 'UNKNOWN');
      weights[k] = int(v, 'weights', 0, 100);
    }
  }
  if (b.keepAssignments !== undefined && typeof b.keepAssignments !== 'boolean') throw bad('keepAssignments', 'FORMAT');

  return {
    schoolYearId: String(b.schoolYearId),
    semesterId: String(b.semesterId),
    classIds,
    mode,
    keepAssignments: b.keepAssignments ?? false,
    grid,
    periods: idMap(b.periods, 'periods', 0, 15),
    maxPerSubjectDay: int(b.maxPerSubjectDay ?? L.MAX_PER_SUBJECT_DAY, 'maxPerSubjectDay', 1, 5),
    rooms: idMap(b.rooms, 'rooms', 1, 100),
    busy,
    heavySubjectIds: idList(b.heavySubjectIds, 'heavySubjectIds', 100),
    afternoonSubjectIds: idList(b.afternoonSubjectIds, 'afternoonSubjectIds', 100),
    fixed,
    weights,
    seed: int(b.seed ?? 1, 'seed', 1, 1e9),
    timeLimitSec: int(b.timeLimitSec ?? L.TIME_LIMIT_SEC, 'timeLimitSec', 1, L.TIME_LIMIT_SEC_MAX),
  };
}

export const autoRunRequest = (req) => autoConfig(req.body);

// POST /timetables/auto/apply { config, stamp, confirmOverwrite, draft: { assignments: [{ classId, subjectId, teacherId }],
//   timetables: { classId: [{ weekday, period, subjectId }] } } }
export function autoApplyRequest(req) {
  const b = req.body;
  if (!isPlainObject(b)) throw bad('body', 'FORMAT');
  const extra = Object.keys(b).filter((k) => !['config', 'stamp', 'confirmOverwrite', 'draft'].includes(k));
  if (extra.length) throw bad(extra[0], 'UNKNOWN');
  const config = autoConfig(b.config);
  if (typeof b.stamp !== 'string' || !b.stamp || b.stamp.length > 100) throw bad('stamp', 'REQUIRED');
  if (b.confirmOverwrite !== undefined && typeof b.confirmOverwrite !== 'boolean') throw bad('confirmOverwrite', 'FORMAT');
  return { config, stamp: b.stamp, confirmOverwrite: b.confirmOverwrite ?? false, draft: draftOf(b.draft, config) };
}

// POST /timetables/auto/check { config, draft } – a draft edited by hand, checked without saving (Dung, 21/11/2026).
export function autoCheckRequest(req) {
  const b = req.body;
  if (!isPlainObject(b)) throw bad('body', 'FORMAT');
  const extra = Object.keys(b).filter((k) => !['config', 'draft'].includes(k));
  if (extra.length) throw bad(extra[0], 'UNKNOWN');
  const config = autoConfig(b.config);
  return { config, draft: draftOf(b.draft, config) };
}

// The draft of /apply and /check: assignments (unless step B alone) and the weekly pattern of each class (unless
// step A alone). Shapes only; the rules are checked in timetable.auto.review.js / timetable.auto.js.
function draftOf(d, config) {
  if (!isPlainObject(d)) throw bad('draft', 'FORMAT');
  let assignments = [];
  if (config.mode !== 'TIMETABLE') {
    if (!Array.isArray(d.assignments) || d.assignments.length > 5000) throw bad('draft', 'FORMAT');
    assignments = d.assignments.map((a) => {
      if (!isPlainObject(a) || !isId(a.classId) || !isId(a.subjectId) || !isId(a.teacherId)) throw bad('draft', 'FORMAT');
      return { classId: String(a.classId), subjectId: String(a.subjectId), teacherId: String(a.teacherId) };
    });
  }
  const timetables = {};
  if (config.mode !== 'ASSIGN') {
    if (!isPlainObject(d.timetables)) throw bad('draft', 'FORMAT');
    for (const [classId, list] of Object.entries(d.timetables)) {
      if (!isId(classId) || !Array.isArray(list) || list.length > 60) throw bad('draft', 'FORMAT');
      timetables[String(classId)] = list.map((e) => {
        if (!isPlainObject(e) || !isId(e.subjectId)) throw bad('draft', 'FORMAT');
        return { weekday: int(e.weekday, 'draft', 1, 7), period: int(e.period, 'draft', 1, 20), subjectId: String(e.subjectId) };
      });
    }
  }
  return { assignments, timetables };
}

// GET /timetables/auto/options?schoolYearId=
export function autoOptionsQuery(req) {
  const id = req.query?.schoolYearId;
  if (id !== undefined && id !== '' && !isId(id)) throw notFound(ERROR_CODES.SCHOOL_YEAR_NOT_FOUND, 'School year not found.');
  return { schoolYearId: id ? String(id) : undefined };
}
