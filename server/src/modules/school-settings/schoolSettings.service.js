// School Manager settings ("Cài đặt hệ thống" of the School Manager, Dung, 21/11/2026). Two groups:
//   teaching   – school-wide limits (26/11/2026, replace the teacher norms – no separate norm for homeroom teachers,
//                no periods over the norm, no teacher limit a day): the most periods a teacher teaches in a week, and
//                the most periods a class has in a day and in a week. Checked by automatic scheduling, by every save
//                of a class timetable (editor, Excel import) and by the teaching assignment (FE-03, SCR-19).
//                27/11/2026 (Khanh, FE-04): also the most periods of one subject a week (SCR-70, UC-26), and the class
//                types of SCR-70 are checked against classMaxWeek;
//   classes    – class size (27/11/2026, Khanh, FE-04): above warnStudents a student is still added once the School
//                Manager confirms; maxStudents is never passed (UC-28, class import UC-27, UC-10, UC-11);
//   attendance – the time of day until which a subject teacher can still edit the attendance of that day (business
//                rules §12; moved here from the System Admin settings 24/11/2026, key attendance.edit_deadline_time).
// The values live in school_settings (database/patch_v0.3_school_settings.sql, approved by the lead and run on the
// shared DB 21/11/2026). On a database without the table the built-in defaults are used and saving answers 503
// MSG_SCHOOL_SETTINGS_NOT_READY. A key that is not in school_settings yet falls back to system_settings (the attendance
// deadline before patch_v0.3_school_settings_attendance.sql moves it), then to the built-in default.
// ASSUMPTION: no UC / SCR id yet (to be given by the lead).
// school_settings is separate from system_settings on purpose: system_settings is edited by the System Admin only
// (UC-102, business rules §13) and its screen lists every row of that table.
import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest } from '../../utils/AppError.js';
import { logActivity } from '../../utils/activityLog.js';
import { AUTO_LIMITS } from '../timetable/timetable.constants.js';

export const ERROR_CODES = Object.freeze({
  NOT_READY: 'MSG_SCHOOL_SETTINGS_NOT_READY', // 503 – patch_v0.3_school_settings.sql not run on this database
  // 400 details: { field, reason: REQUIRED | RANGE | TIME | ABOVE_DAYS | ABOVE_CLASS_WEEK | ABOVE_MAX_STUDENTS, min?, max? }
  INVALID: 'MSG_SCHOOL_SETTINGS_INVALID',
  CHANGED: 'MSG_SCHOOL_SETTINGS_CHANGED', // 409 – saved by someone else after the page was opened
  NOTHING: 'MSG_NOTHING_CHANGED', // 400 – same code as the System Admin settings
});

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// FE-04 defaults (27/11/2026). Periods of one subject: the old fixed range 1–10; at most 2 periods a day
// (AUTO_LIMITS.MAX_PER_SUBJECT_DAY) × 6 days, more could never be placed in a timetable.
// Class size: a warning above 45 (Điều lệ trường), a hard cap of 55 – the school's choice, agreed by the lead 27/11/2026.
export const CLASS_LIMITS = Object.freeze({
  SUBJECT_MAX_WEEK: 10,
  SUBJECT_MAX_WEEK_CAP: AUTO_LIMITS.MAX_PER_SUBJECT_DAY * AUTO_LIMITS.DAYS_MAX,
  WARN_STUDENTS: 45,
  MAX_STUDENTS: 55,
  STUDENTS_MIN: 10,
  STUDENTS_CAP: 60, // ASSUMPTION: highest class size the School Manager may set
});

// group -> field (API, camelCase) -> row key, type, built-in default, allowed range.
// New keys (26/11/2026) are new rows of school_settings (no schema change); the old rows teaching.norm,
// teaching.homeroom_norm, teaching.max_over and teaching.max_periods_per_day are no longer read.
export const GROUPS = Object.freeze({
  teaching: {
    // Never above the legal caps: 25 periods a week for a teacher, 7 periods a day for a class (and 7 × 6 a week).
    teacherMaxWeek: { key: 'teaching.teacher_max_week', type: 'int', fallback: AUTO_LIMITS.TEACHER_MAX_WEEK, min: 1, max: AUTO_LIMITS.TEACHER_MAX_WEEK },
    classMaxDay: { key: 'teaching.class_max_day', type: 'int', fallback: AUTO_LIMITS.CLASS_MAX_DAY, min: 1, max: AUTO_LIMITS.CLASS_MAX_DAY },
    classMaxWeek: { key: 'teaching.class_max_week', type: 'int', fallback: AUTO_LIMITS.CLASS_MAX_WEEK, min: 1, max: AUTO_LIMITS.CLASS_MAX_DAY * AUTO_LIMITS.DAYS_MAX },
    // FE-04 (27/11/2026): most periods of one subject a week in a class type (SCR-70); never above classMaxWeek.
    subjectMaxWeek: { key: 'teaching.subject_max_week', type: 'int', fallback: CLASS_LIMITS.SUBJECT_MAX_WEEK, min: 1, max: CLASS_LIMITS.SUBJECT_MAX_WEEK_CAP },
  },
  // FE-04 (27/11/2026): class size, warnStudents <= maxStudents.
  classes: {
    warnStudents: { key: 'class.warn_students', type: 'int', fallback: CLASS_LIMITS.WARN_STUDENTS, min: CLASS_LIMITS.STUDENTS_MIN, max: CLASS_LIMITS.STUDENTS_CAP },
    maxStudents: { key: 'class.max_students', type: 'int', fallback: CLASS_LIMITS.MAX_STUDENTS, min: CLASS_LIMITS.STUDENTS_MIN, max: CLASS_LIMITS.STUDENTS_CAP },
  },
  attendance: {
    // ASSUMPTION: earliest 12:00 (not in the business rules) – an earlier deadline would close the morning periods
    // before the school day ends. To confirm with the lead.
    editDeadlineTime: { key: 'attendance.edit_deadline_time', type: 'time', fallback: '23:59', min: '12:00', max: '23:59', legacy: true },
  },
});
export const TEACHING_FIELDS = GROUPS.teaching;
const FIELDS = Object.entries(GROUPS).flatMap(([group, fields]) => Object.entries(fields).map(([field, f]) => ({ group, field, ...f })));
const KEYS = FIELDS.map((f) => f.key);
const LEGACY_KEYS = FIELDS.filter((f) => f.legacy).map((f) => f.key);

const missingTable = (err) => err?.code === '42P01';

const parse = (f, raw) => {
  const text = String(raw ?? '').trim();
  if (f.type === 'time') return TIME_RE.test(text) && text >= f.min && text <= f.max ? text : null;
  const n = Number(text);
  return text !== '' && Number.isInteger(n) && n >= f.min && n <= f.max ? n : null;
};

async function readRows(db, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT s.setting_key AS "key", s.setting_value AS "value", s.updated_at AS "updatedAt", u.full_name AS "updatedByName"
     FROM school_settings s LEFT JOIN users u ON u.user_id = s.updated_by
     WHERE s.setting_key = ANY($1::varchar[])${lock ? ' FOR UPDATE OF s' : ''}`,
    [KEYS],
  );
  return rows;
}

// Values still kept in system_settings (keys moved to school_settings by a patch not run yet).
async function legacyRows(db) {
  const { rows } = await db.query(
    `SELECT setting_key AS "key", setting_value AS "value" FROM system_settings WHERE setting_key = ANY($1::varchar[])`,
    [LEGACY_KEYS],
  );
  return rows;
}

function shape(rows, legacy, ready) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const oldByKey = new Map(legacy.map((r) => [r.key, r.value]));
  const out = { ready };
  for (const g of Object.keys(GROUPS)) out[g] = {};
  for (const f of FIELDS) {
    out[f.group][f.field] = parse(f, byKey.get(f.key)?.value) ?? parse(f, oldByKey.get(f.key)) ?? f.fallback;
  }
  const last = rows.filter((r) => r.updatedAt).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  return {
    ...out,
    limits: Object.fromEntries(Object.entries(GROUPS).map(([g, fields]) => [g, Object.fromEntries(Object.entries(fields)
      .map(([k, f]) => [k, { min: f.min, max: f.max, default: f.fallback }]))])),
    updatedAt: last?.updatedAt ?? null,
    updatedByName: last?.updatedByName ?? null,
    stamp: FIELDS.map((f) => out[f.group][f.field]).join('|'),
  };
}

async function read(db, opts) {
  try {
    const [rows, legacy] = await Promise.all([readRows(db, opts), legacyRows(db)]);
    return shape(rows, legacy, true);
  } catch (err) {
    if (missingTable(err)) return shape([], [], false);
    throw err;
  }
}

// The teacher and class limits in force { teacherNormWeek, teacherMaxWeek, classMaxDay, classMaxWeek } (automatic scheduling on every
// run and apply, class timetable saves, teaching assignment saves).
// teacherNormWeek ("nên dạy", warning only) is not a setting: the norm of Thông tư 05/2025 (17), built in (27/11/2026).
export async function schoolLimits(db = pool) {
  return { ...(await read(db)).teaching, teacherNormWeek: AUTO_LIMITS.TEACHER_NORM_WEEK };
}

// Class size in force { warnStudents, maxStudents } (FE-04: UC-28, class import, UC-10 transfer, UC-11 promotion).
export async function classSizeLimits(db = pool) {
  return (await read(db)).classes;
}

// The subject teacher's attendance deadline of the day (HH:MM), read by FE-12 (attendance.scope.js).
export async function attendanceDeadline(db = pool) {
  return (await read(db)).attendance.editDeadlineTime;
}

// GET /api/v1/school-settings
export function getSettings() {
  return read(pool);
}

const invalid = (field, reason, more = {}) => badRequest(ERROR_CODES.INVALID, `Invalid ${field}.`, { field, reason, ...more });

// Body { teaching?, classes?, attendance?, stamp }: each group sent is checked in full; a group left out keeps its values.
export function checkBody(body) {
  const out = {};
  for (const [group, fields] of Object.entries(GROUPS)) {
    const g = body?.[group];
    if (g === undefined) continue;
    if (!g || typeof g !== 'object' || Array.isArray(g)) throw invalid(group, 'REQUIRED');
    out[group] = {};
    for (const [field, f] of Object.entries(fields)) {
      const raw = g[field];
      if (raw === undefined || raw === null || String(raw).trim() === '') throw invalid(field, 'REQUIRED');
      const v = parse(f, typeof raw === 'number' ? String(raw) : raw);
      if (v === null) throw invalid(field, f.type === 'time' ? 'TIME' : 'RANGE', { min: f.min, max: f.max });
      out[group][field] = v;
    }
  }
  if (!Object.keys(out).length) throw invalid('teaching', 'REQUIRED');
  // A week of more periods than classMaxDay × 6 school days can never be filled.
  if (out.teaching && out.teaching.classMaxWeek > out.teaching.classMaxDay * AUTO_LIMITS.DAYS_MAX) {
    throw invalid('classMaxWeek', 'ABOVE_DAYS', { max: out.teaching.classMaxDay * AUTO_LIMITS.DAYS_MAX });
  }
  // One subject cannot have more periods than the whole week of a class (FE-04).
  if (out.teaching && out.teaching.subjectMaxWeek > out.teaching.classMaxWeek) {
    throw invalid('subjectMaxWeek', 'ABOVE_CLASS_WEEK', { max: out.teaching.classMaxWeek });
  }
  if (out.classes && out.classes.warnStudents > out.classes.maxStudents) {
    throw invalid('warnStudents', 'ABOVE_MAX_STUDENTS', { max: out.classes.maxStudents });
  }
  return out;
}

// PUT /api/v1/school-settings
export async function updateSettings({ values, stamp }, user, ip) {
  let before;
  try {
    before = await withTransaction(async (db) => {
      const current = await read(db, { lock: true });
      if (!current.ready) throw new AppError(503, ERROR_CODES.NOT_READY, 'The school_settings table is not created yet.');
      if (stamp !== current.stamp) throw new AppError(409, ERROR_CODES.CHANGED, 'The settings were changed after the page was opened.');
      const changed = FIELDS.filter((f) => values[f.group] && values[f.group][f.field] !== current[f.group][f.field]);
      if (!changed.length) throw badRequest(ERROR_CODES.NOTHING, 'Nothing was changed.');
      for (const f of changed) {
        await db.query(
          `INSERT INTO school_settings (setting_key, setting_value, updated_by, updated_at) VALUES ($1, $2, $3, NOW())
           ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
          [f.key, String(values[f.group][f.field]), user.userId],
        );
      }
      return changed.map((f) => [f.key, { from: current[f.group][f.field], to: values[f.group][f.field] }]);
    });
  } catch (err) {
    if (missingTable(err)) throw new AppError(503, ERROR_CODES.NOT_READY, 'The school_settings table is not created yet.');
    throw err;
  }
  await logActivity({ userId: user.userId, action: 'SETTING_CHANGE', targetType: 'SCHOOL_SETTINGS', ip, detail: Object.fromEntries(before) })
    .catch(() => {}); // the change is saved; a failed log line must not turn it into an error
  return getSettings();
}
