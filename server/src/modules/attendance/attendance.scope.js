import { pool } from '../../config/db.js';
import { badRequest, forbidden, notFound } from '../../utils/AppError.js';
import { getSetting } from '../../utils/settings.js';
import { DEFAULT_DEADLINE, LESSON_START_SQL, MODES, SETTING_DEADLINE, TZ } from './attendance.constants.js';

// FE-12 Attendance (owner: Quoc) – lookups, data scope and the edit windows of business rules §12 / permissions.md
// notes 7, 12, 13, 14. Permissions follow the ACTIVE role; System Admin never reaches FE-12 (routes refuse it).

export function parseId(value, code = 'NOT_FOUND', message = 'Not found.') {
  const text = String(value ?? '');
  if (!/^\d{1,15}$/.test(text) || Number(text) < 1) throw notFound(code, message);
  return Number(text);
}

// A calendar date YYYY-MM-DD that exists (2026-02-30 is refused), or null when empty.
export function parseDate(value, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest('MSG_INVALID_DATE', 'A valid date is required.');
    return null;
  }
  const text = String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const d = m && new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (!d || d.toISOString().slice(0, 10) !== text) throw badRequest('MSG_INVALID_DATE', 'Invalid date.');
  return text;
}

// The subject teacher's deadline of the day (system setting, SA edits it; HH:MM). A broken value falls back to 23:59.
export async function deadlineTime() {
  const value = String(await getSetting(SETTING_DEADLINE, DEFAULT_DEADLINE)).trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : DEFAULT_DEADLINE;
}

export async function teacherIdOf(db, userId) {
  const { rows } = await db.query('SELECT teacher_id FROM teachers WHERE user_id = $1', [userId]);
  return rows[0]?.teacher_id ?? null;
}

// Who is asking: active role + teacher id (teachers only).
export async function contextOf(user, db = pool) {
  return {
    role: user.activeRole,
    userId: user.userId,
    teacherId: user.activeRole === 'TEACHER' ? await teacherIdOf(db, user.userId) : null,
  };
}

/**
 * Columns of one period (timetable_slots row) with everything the edit windows need. Joined as
 * `timetable_slots ts JOIN time_slots sl … JOIN classes c … JOIN subjects s … JOIN teachers t … JOIN users tu …`.
 * $1 of the caller must be the deadline time (HH:MM).
 */
export const LESSON_COLUMNS = `ts.timetable_slot_id AS "lessonId", to_char(ts."date", 'YYYY-MM-DD') AS "date",
  sl.period_number AS "period", to_char(sl.start_time, 'HH24:MI') AS "start", to_char(sl.end_time, 'HH24:MI') AS "end",
  ts.class_id AS "classId", c.class_name AS "className", c.school_year_id AS "schoolYearId",
  c.homeroom_teacher_id AS "homeroomTeacherId",
  ts.subject_id AS "subjectId", s.subject_name AS "subjectName", ts.teacher_id AS "teacherId", tu.full_name AS "teacherName",
  ts.room,
  NOW() >= ${LESSON_START_SQL} AS "started",
  NOW() <= ((ts."date" + $1::time + INTERVAL '59 seconds') AT TIME ZONE '${TZ}') AS "beforeDeadline",
  se.semester_id AS "semesterId", se.semester_no AS "semesterNo", se.status AS "semesterStatus",
  (SELECT COUNT(*) FROM attendances a WHERE a.timetable_slot_id = ts.timetable_slot_id) AS "recordCount"`;
export const LESSON_JOINS = `JOIN time_slots sl ON sl.slot_id = ts.slot_id
  JOIN classes c ON c.class_id = ts.class_id AND c.deleted_at IS NULL
  JOIN subjects s ON s.subject_id = ts.subject_id
  JOIN teachers t ON t.teacher_id = ts.teacher_id JOIN users tu ON tu.user_id = t.user_id
  LEFT JOIN semesters se ON se.school_year_id = c.school_year_id AND ts."date" BETWEEN se.start_date AND se.end_date`;

// Can this teacher look at this period? Its teacher, the homeroom teacher, or a teacher of its subject in the class
// (§12 point 7: a subject teacher sees only the subjects they teach in the class).
export function teacherSeesLesson(ctx, lesson, subjectIds) {
  if (ctx.teacherId === null) return false;
  const me = String(ctx.teacherId);
  return (
    String(lesson.teacherId) === me ||
    String(lesson.homeroomTeacherId ?? '') === me ||
    subjectIds.includes(Number(lesson.subjectId))
  );
}

// Subjects a teacher teaches (or taught) in a class: every assignment of that class, past ones too.
export async function taughtSubjectIds(db, teacherId, classId) {
  if (!teacherId) return [];
  const { rows } = await db.query(
    `SELECT DISTINCT subject_id FROM teaching_assignments
     WHERE teacher_id = $1 AND class_id = $2 AND deleted_at IS NULL`,
    [teacherId, classId],
  );
  return rows.map((r) => Number(r.subject_id));
}

/**
 * What the caller may do with one period (MODES) and, when only VIEW, why (`blocked`, an error code the client
 * maps to Vietnamese). Order: the period's own teacher in the window wins (they may change everything), then School
 * Manager, then the homeroom teacher's excused <-> unexcused switch.
 * ASSUMPTION: the homeroom teacher may switch excused <-> unexcused as soon as the period is taken (also on the same
 * day), not only after the subject teacher's deadline – a family often explains an absence the same morning.
 */
export function resolveMode(ctx, lesson) {
  const taken = Number(lesson.recordCount) > 0;
  if (ctx.role === 'SCHOOL_MANAGER') {
    return lesson.started ? { mode: MODES.MANAGER } : { mode: MODES.VIEW, blocked: 'MSG_ATTENDANCE_NOT_STARTED' };
  }
  const me = String(ctx.teacherId ?? '');
  const ownLesson = me !== '' && String(lesson.teacherId) === me;
  const homeroom = me !== '' && String(lesson.homeroomTeacherId ?? '') === me;
  if (ownLesson && lesson.started && lesson.beforeDeadline) return { mode: MODES.TEACHER };
  if (homeroom && taken && lesson.semesterStatus === 'OPEN') return { mode: MODES.HOMEROOM };
  let blocked = 'MSG_ATTENDANCE_VIEW_ONLY';
  if (ownLesson && !lesson.started) blocked = 'MSG_ATTENDANCE_NOT_STARTED';
  else if (homeroom && taken && lesson.semesterStatus !== 'OPEN') blocked = 'MSG_SEMESTER_CLOSED';
  else if (ownLesson || homeroom) blocked = 'MSG_ATTENDANCE_DEADLINE_PASSED';
  return { mode: MODES.VIEW, blocked };
}

// One period with its edit window, checked against the caller's scope. Not allowed and not found look the same.
export async function loadLesson(db, ctx, lessonId, { forUpdate = false } = {}) {
  const id = parseId(lessonId, 'MSG_LESSON_NOT_FOUND', 'Period not found.');
  const deadline = await deadlineTime();
  const { rows } = await db.query(
    `SELECT ${LESSON_COLUMNS} FROM timetable_slots ts ${LESSON_JOINS}
     WHERE ts.timetable_slot_id = $2 ${forUpdate ? 'FOR UPDATE OF ts' : ''}`,
    [deadline, id],
  );
  const lesson = rows[0];
  if (!lesson) throw notFound('MSG_LESSON_NOT_FOUND', 'Period not found.');
  if (ctx.role === 'TEACHER') {
    const subjectIds = await taughtSubjectIds(db, ctx.teacherId, lesson.classId);
    if (!teacherSeesLesson(ctx, lesson, subjectIds)) throw notFound('MSG_LESSON_NOT_FOUND', 'Period not found.');
  } else if (ctx.role !== 'SCHOOL_MANAGER') {
    throw forbidden();
  }
  return { ...lesson, deadline, ...resolveMode(ctx, lesson) };
}

export async function loadClass(db, classId) {
  const id = parseId(classId, 'MSG_CLASS_NOT_FOUND', 'Class not found.');
  const { rows } = await db.query(
    `SELECT c.class_id AS "classId", c.class_name AS "className", c.school_year_id AS "schoolYearId",
            c.homeroom_teacher_id AS "homeroomTeacherId", g.grade_level_name AS "gradeLevelName", sy.year_name AS "yearName",
            hu.full_name AS "homeroomTeacherName"
     FROM classes c
     JOIN grade_levels g ON g.grade_level_id = c.grade_level_id
     JOIN school_years sy ON sy.school_year_id = c.school_year_id
     LEFT JOIN teachers ht ON ht.teacher_id = c.homeroom_teacher_id
     LEFT JOIN users hu ON hu.user_id = ht.user_id
     WHERE c.class_id = $1 AND c.deleted_at IS NULL`,
    [id],
  );
  if (!rows[0]) throw notFound('MSG_CLASS_NOT_FOUND', 'Class not found.');
  return rows[0];
}

/**
 * Which subjects of a class the caller may see: null = every subject (School Manager, homeroom teacher), else the
 * subject ids the teacher teaches there (§12 point 7). A teacher with neither = "class not found".
 */
export async function classSubjectScope(db, ctx, cls) {
  if (ctx.role === 'SCHOOL_MANAGER') return null;
  if (ctx.role === 'TEACHER' && ctx.teacherId !== null) {
    if (String(cls.homeroomTeacherId ?? '') === String(ctx.teacherId)) return null;
    const ids = await taughtSubjectIds(db, ctx.teacherId, cls.classId);
    // A period taught by this teacher in a subject without an assignment row (should not happen: no substitutes).
    if (ids.length) return ids;
  }
  throw notFound('MSG_CLASS_NOT_FOUND', 'Class not found.');
}

export async function loadSemester(db, semesterId) {
  const id = parseId(semesterId, 'MSG_SEMESTER_NOT_FOUND', 'Semester not found.');
  const { rows } = await db.query(
    `SELECT se.semester_id AS "semesterId", se.semester_no AS "semesterNo", se.status,
            to_char(se.start_date, 'YYYY-MM-DD') AS "startDate", to_char(se.end_date, 'YYYY-MM-DD') AS "endDate",
            sy.school_year_id AS "schoolYearId", sy.year_name AS "yearName"
     FROM semesters se JOIN school_years sy ON sy.school_year_id = se.school_year_id
     WHERE se.semester_id = $1`,
    [id],
  );
  if (!rows[0]) throw notFound('MSG_SEMESTER_NOT_FOUND', 'Semester not found.');
  return rows[0];
}

// Range of a report: the semester, narrowed by optional from / to (both inside the semester, from <= to).
export function reportRange(semester, query) {
  const from = parseDate(query.from) ?? semester.startDate;
  const to = parseDate(query.to) ?? semester.endDate;
  if (from < semester.startDate || to > semester.endDate || from > to) {
    throw badRequest('MSG_ATTENDANCE_RANGE', 'The dates must be inside the semester, the first before the last.');
  }
  return { from, to };
}

// Students a student / parent may see: themselves / their linked children (note 7).
export async function ownStudents(db, user) {
  if (user.activeRole === 'STUDENT') {
    const { rows } = await db.query(
      `SELECT s.student_id AS "studentId", s.student_code AS "studentCode", u.full_name AS "fullName"
       FROM students s JOIN users u ON u.user_id = s.user_id WHERE s.user_id = $1`,
      [user.userId],
    );
    return rows;
  }
  if (user.activeRole === 'PARENT') {
    const { rows } = await db.query(
      `SELECT s.student_id AS "studentId", s.student_code AS "studentCode", u.full_name AS "fullName"
       FROM parents p
       JOIN student_parents sp ON sp.parent_id = p.parent_id
       JOIN students s ON s.student_id = sp.student_id
       JOIN users u ON u.user_id = s.user_id
       WHERE p.user_id = $1
       ORDER BY u.full_name, s.student_id`,
      [user.userId],
    );
    return rows;
  }
  return [];
}
