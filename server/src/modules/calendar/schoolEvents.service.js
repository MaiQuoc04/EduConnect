// School calendar (FE-10 Schedule, Dung, 13/11/2026) – school-wide dates set by the School Manager: the "Lịch sắp tới
// của trường" column of the school feed (Stitch SCR-34), the /school-events page and the class calendar.
// Table school_events (proposed patch_v0.3_school_events.sql): grade_level_id NULL = whole school, else one grade.
//
// Who sees what (ASSUMPTION – the school calendar is public inside the school):
//   School Manager, Teacher: every school event.
//   Student, Parent: whole-school events + events of the grades of their (children's) classes being studied.
// ?classId= narrows to whole-school events + the grade of that class (class calendar).
import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, notFound } from '../../utils/AppError.js';
import { ROLES, SCHOOL_EVENT_CODES as C, SCHOOL_EVENT_LIMITS as L, TIME_ZONE } from './calendar.constants.js';

const TZ = `'${TIME_ZONE}'`;
const LOCAL_TEXT = (col) => `to_char(${col} AT TIME ZONE ${TZ}, 'YYYY-MM-DD"T"HH24:MI')`;
const LOCAL_DAY = (col) => `(${col} AT TIME ZONE ${TZ})::date`;
const FROM_LOCAL = (param) => `(${param}::timestamp AT TIME ZONE ${TZ})`;
const conflict = (code, message, details) => new AppError(409, code, message, details);
const missing = () => notFound(C.NOT_FOUND, 'School event not found.');

async function guard(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err?.code === '42P01' || err?.code === '42703') throw new AppError(503, C.NOT_READY, 'Table school_events is not created yet.');
    throw err;
  }
}

const STAMP = `md5(concat_ws('|', se.title, se.description, se.location, se.start_at, se.end_at, se.grade_level_id, se.updated_at))`;
const COLUMNS = `se.event_id AS "eventId", se.title, se.description, se.location,
  ${LOCAL_TEXT('se.start_at')} AS "startAt", ${LOCAL_TEXT('se.end_at')} AS "endAt",
  se.grade_level_id AS "gradeLevelId", gl.grade_level_name AS "gradeName", se.school_year_id AS "schoolYearId",
  cu.full_name AS "createdByName", ${LOCAL_TEXT('se.created_at')} AS "createdAt", ${LOCAL_TEXT('se.updated_at')} AS "updatedAt",
  (NOW() >= se.start_at) AS "started", (NOW() >= COALESCE(se.end_at, se.start_at)) AS "ended", ${STAMP} AS "stamp"`;
const FROM = `FROM school_events se
  LEFT JOIN grade_levels gl ON gl.grade_level_id = se.grade_level_id
  JOIN users cu ON cu.user_id = se.created_by`;

// Grades a student / parent follows: the classes studied by the student or the parent's children. $1 = user id.
const MY_GRADES = {
  [ROLES.STUDENT]: `SELECT c.grade_level_id FROM students s JOIN class_enrollments ce ON ce.student_id = s.student_id AND ce.status = 'STUDYING'
                     JOIN classes c ON c.class_id = ce.class_id AND c.deleted_at IS NULL WHERE s.user_id = $1`,
  [ROLES.PARENT]: `SELECT c.grade_level_id FROM parents pa JOIN student_parents sp ON sp.parent_id = pa.parent_id
                    JOIN class_enrollments ce ON ce.student_id = sp.student_id AND ce.status = 'STUDYING'
                    JOIN classes c ON c.class_id = ce.class_id AND c.deleted_at IS NULL WHERE pa.user_id = $1`,
};

// WHERE part for the viewer (+ optional class). Parameters: $1 user id; the class id is pushed to `params`.
function scope(user, params, classId) {
  let sql = 'se.deleted_at IS NULL';
  const mine = MY_GRADES[user.activeRole];
  if (mine) sql += ` AND (se.grade_level_id IS NULL OR se.grade_level_id IN (${mine}))`;
  if (classId) {
    params.push(classId);
    sql += ` AND (se.grade_level_id IS NULL OR se.grade_level_id = (SELECT grade_level_id FROM classes WHERE class_id = $${params.length}))`;
  }
  return sql;
}

const canManage = (user) => user.activeRole === ROLES.SCHOOL_MANAGER;
const shape = (user) => (row) => {
  const { stamp, ...rest } = row;
  return {
    ...rest,
    audience: row.gradeName ? `Khối ${row.gradeName}` : 'Toàn trường',
    ...(canManage(user) ? { stamp, can: { edit: !row.started, delete: !row.started } } : { can: { edit: false, delete: false } }),
  };
};
async function nowText(db = pool) {
  const { rows } = await db.query(`SELECT ${LOCAL_TEXT('NOW()')} AS now`);
  return rows[0].now;
}

// GET /school-events?from=&to=&classId= – events touching [from, to] (local days).
export function listSchoolEvents({ from, to, classId }, user) {
  return guard(async () => {
    const params = [user.userId, from, to];
    const where = scope(user, params, classId);
    const { rows } = await pool.query(
      `SELECT ${COLUMNS} ${FROM}
       WHERE ${where} AND ${LOCAL_DAY('se.start_at')} <= $3::date AND ${LOCAL_DAY('COALESCE(se.end_at, se.start_at)')} >= $2::date
         AND $1::bigint IS NOT NULL
       ORDER BY se.start_at, se.event_id`,
      params,
    );
    return { from, to, now: await nowText(), canManage: canManage(user), events: rows.map(shape(user)) };
  });
}

// GET /school-events/upcoming?limit= – not finished yet, soonest first (school feed column).
export function upcomingSchoolEvents({ limit }, user) {
  return guard(async () => {
    const params = [user.userId];
    const where = scope(user, params, null);
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT ${COLUMNS} ${FROM}
       WHERE ${where} AND COALESCE(se.end_at, se.start_at) > NOW() AND $1::bigint IS NOT NULL
       ORDER BY se.start_at, se.event_id LIMIT $${params.length}`,
      params,
    );
    return { now: await nowText(), canManage: canManage(user), events: rows.map(shape(user)) };
  });
}

// GET /school-events/past?limit= – finished, latest first (the "Đã qua" tab).
export function pastSchoolEvents({ limit }, user) {
  return guard(async () => {
    const params = [user.userId];
    const where = scope(user, params, null);
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT ${COLUMNS} ${FROM}
       WHERE ${where} AND COALESCE(se.end_at, se.start_at) <= NOW() AND $1::bigint IS NOT NULL
       ORDER BY se.start_at DESC, se.event_id DESC LIMIT $${params.length}`,
      params,
    );
    return { now: await nowText(), canManage: canManage(user), events: rows.map(shape(user)) };
  });
}

async function findOne(db, eventId, user, { lock = false } = {}) {
  const params = [user.userId, eventId];
  const where = scope(user, params, null);
  const { rows } = await db.query(
    `SELECT ${COLUMNS} ${FROM} WHERE se.event_id = $2 AND ${where} AND $1::bigint IS NOT NULL ${lock ? 'FOR UPDATE OF se' : ''}`,
    params,
  );
  if (!rows.length) throw missing();
  return rows[0];
}

// GET /school-events/:eventId
export function getSchoolEvent(eventId, user) {
  return guard(async () => shape(user)(await findOne(pool, eventId, user)));
}

// GET /school-events/options (School Manager) – grades and the open school years for the form.
export function schoolEventOptions() {
  return guard(async () => {
    const [{ rows: grades }, { rows: years }] = await Promise.all([
      pool.query(`SELECT grade_level_id AS "gradeLevelId", grade_level_name AS "name" FROM grade_levels ORDER BY grade_level_name`),
      pool.query(
        `SELECT school_year_id AS "schoolYearId", year_name AS "name", to_char(start_date, 'YYYY-MM-DD') AS "startDate",
                to_char(end_date, 'YYYY-MM-DD') AS "endDate"
         FROM school_years WHERE end_date >= CURRENT_DATE ORDER BY start_date`,
      ),
    ]);
    await pool.query('SELECT 1 FROM school_events LIMIT 0'); // 503 before the patch, like the other endpoints
    return { now: await nowText(), grades, years, limits: L };
  });
}

// Start in the future (only checked when it changes on update), a school year that contains the start and the end.
async function checkTimes(db, input, { before } = {}) {
  const startChanged = !before || before.startAt !== input.startAt;
  const { rows } = await db.query(
    `SELECT ($1::timestamp AT TIME ZONE ${TZ}) <= NOW() AS "past",
            (SELECT json_build_object('id', sy.school_year_id, 'min', to_char(sy.start_date, 'YYYY-MM-DD'), 'max', to_char(sy.end_date, 'YYYY-MM-DD'))
             FROM school_years sy WHERE $1::date BETWEEN sy.start_date AND sy.end_date ORDER BY sy.start_date LIMIT 1) AS "year"`,
    [input.startAt],
  );
  const { past, year } = rows[0];
  if (startChanged && past) throw badRequest(C.TIME, 'The start must be in the future.', { reason: 'PAST' });
  if (!year) throw badRequest(C.TIME, 'No school year contains this date.', { reason: 'NO_YEAR' });
  const lastDay = (input.endAt ?? input.startAt).slice(0, 10);
  if (lastDay > year.max) throw badRequest(C.TIME, 'The event must end inside its school year.', { reason: 'OUTSIDE_YEAR', min: year.min, max: year.max });
  return year.id;
}

async function checkGrade(db, gradeLevelId) {
  if (!gradeLevelId) return;
  const { rows } = await db.query('SELECT 1 FROM grade_levels WHERE grade_level_id = $1', [gradeLevelId]);
  if (!rows.length) throw badRequest(C.GRADE, 'Unknown grade.');
}

// POST /school-events (School Manager)
export function createSchoolEvent(input, user) {
  return guard(() =>
    withTransaction(async (db) => {
      await checkGrade(db, input.gradeLevelId);
      const yearId = await checkTimes(db, input);
      const { rows } = await db.query(
        `INSERT INTO school_events (school_year_id, grade_level_id, title, description, location, start_at, end_at, created_by)
         VALUES ($1, $2, $3, $4, $5, ${FROM_LOCAL('$6')}, ${FROM_LOCAL('$7')}, $8) RETURNING event_id AS "eventId"`,
        [yearId, input.gradeLevelId, input.title, input.description, input.location, input.startAt, input.endAt, user.userId],
      );
      return shape(user)(await findOne(db, rows[0].eventId, user));
    }),
  );
}

// PUT /school-events/:eventId (School Manager) – not started yet; stale stamp → 409.
export function updateSchoolEvent(eventId, input, user) {
  return guard(() =>
    withTransaction(async (db) => {
      const before = await findOne(db, eventId, user, { lock: true });
      if (before.stamp !== input.stamp) throw conflict(C.CHANGED, 'The event was changed after the form was opened.');
      if (before.started) throw conflict(C.STARTED, 'The event already started.');
      await checkGrade(db, input.gradeLevelId);
      const yearId = await checkTimes(db, input, { before });
      const same = before.title === input.title && (before.description ?? null) === input.description && (before.location ?? null) === input.location
        && before.startAt === input.startAt && (before.endAt ?? null) === input.endAt && String(before.gradeLevelId ?? '') === String(input.gradeLevelId ?? '');
      if (!same) {
        await db.query(
          `UPDATE school_events SET school_year_id = $2, grade_level_id = $3, title = $4, description = $5, location = $6,
                  start_at = ${FROM_LOCAL('$7')}, end_at = ${FROM_LOCAL('$8')}, updated_by = $9, updated_at = NOW()
           WHERE event_id = $1`,
          [eventId, yearId, input.gradeLevelId, input.title, input.description, input.location, input.startAt, input.endAt, user.userId],
        );
      }
      return { ...shape(user)(await findOne(db, eventId, user)), changed: !same };
    }),
  );
}

// DELETE /school-events/:eventId (School Manager) – soft delete, not started yet (ASSUMPTION: past dates stay as record).
export function deleteSchoolEvent(eventId, user) {
  return guard(() =>
    withTransaction(async (db) => {
      const ev = await findOne(db, eventId, user, { lock: true });
      if (ev.started) throw conflict(C.STARTED, 'The event already started.');
      await db.query('UPDATE school_events SET deleted_at = NOW(), deleted_by = $2 WHERE event_id = $1', [eventId, user.userId]);
      return { eventId, deleted: true };
    }),
  );
}
