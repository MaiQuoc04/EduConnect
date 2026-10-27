import { pool } from '../config/db.js';
import { HOMEROOM_FILTER } from '../constants/teacher.constants.js';
import { escapeLike, foldVietnamese, phoneSearchDigits, VI_TRANSLATE } from '../utils/text.js';

// "Current school year" as a sub-query (MOM-05: latest year that has started). Constant SQL, no user input.
const CURRENT_YEAR_SQL = `(SELECT school_year_id FROM school_years
                          WHERE start_date <= CURRENT_DATE
                          ORDER BY start_date DESC LIMIT 1)`;

// ── SCR-13 list ─────────────────────────────────────────────────────────────

// Accent-insensitive, case-insensitive form of a column (same result as foldVietnamese() in JS).
const fold = (column) => `lower(translate(${column}, ?, ?))`;
const foldParams = () => [VI_TRANSLATE.from, VI_TRANSLATE.to];

function listFilters({ search, subject, homeroom, status }) {
  // users has no deleted_at column (accounts are LOCKED, not soft-deleted)
  const conditions = [];
  const params = [];
  if (search) {
    // name without accents ("nguyen" finds "Nguyễn"), teacher code, email, phone ("0914 882 119", "+84914…").
    // User input is matched literally: % and _ are escaped.
    const parts = [
      `${fold('u.full_name')} LIKE ? ESCAPE '\\'`,
      `t.teacher_code ILIKE ? ESCAPE '\\'`,
      `u.email ILIKE ? ESCAPE '\\'`,
    ];
    params.push(...foldParams(), `%${escapeLike(foldVietnamese(search))}%`, `%${escapeLike(search)}%`, `%${escapeLike(search)}%`);
    const digits = phoneSearchDigits(search);
    if (digits) {
      parts.push(`regexp_replace(regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g'), '^84(\\d{9,})$', '0\\1') LIKE ?`);
      params.push(`%${digits}%`);
    }
    conditions.push(`(${parts.join(' OR ')})`);
  }
  if (status) {
    conditions.push('u.status = ?');
    params.push(status);
  }
  if (homeroom === HOMEROOM_FILTER.HAS || homeroom === HOMEROOM_FILTER.NONE) {
    conditions.push(`${homeroom === HOMEROOM_FILTER.NONE ? 'NOT ' : ''}EXISTS (
      SELECT 1 FROM classes c2
      WHERE c2.homeroom_teacher_id = t.teacher_id AND c2.deleted_at IS NULL
    )`);
  }
  if (subject) {
    conditions.push(`EXISTS (
      SELECT 1 FROM teacher_subjects ts2
      JOIN subjects s2 ON s2.subject_id = ts2.subject_id
      WHERE ts2.teacher_id = t.teacher_id AND ${fold('s2.subject_name')} LIKE ? ESCAPE '\\' AND s2.deleted_at IS NULL
    )`);
    params.push(...foldParams(), `%${escapeLike(foldVietnamese(subject))}%`);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

export async function countTeachers(filters, db = pool) {
  const { where, params } = listFilters(filters);
  const [rows] = await db.query(
    `SELECT COUNT(*) AS n FROM teachers t JOIN users u ON u.user_id = t.user_id ${where}`,
    params,
  );
  return Number(rows[0].n);
}

export async function findTeachersPage(filters, { limit, offset }, db = pool) {
  const { where, params } = listFilters(filters);
  const [rows] = await db.query(
    `SELECT
       t.teacher_id    AS "teacherId",
       t.teacher_code  AS "teacherCode",
       u.full_name     AS "fullName",
       u.email,
       u.phone,
       u.status,
       u.avatar_url    AS "avatarUrl"
     FROM teachers t
     JOIN users u ON u.user_id = t.user_id
     ${where}
     ORDER BY u.full_name
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return rows;
}

export async function findSubjectNamesByTeacherIds(teacherIds, db = pool) {
  const [rows] = await db.query(
    `SELECT ts.teacher_id AS "teacherId", s.subject_name AS name
     FROM teacher_subjects ts
     JOIN subjects s ON s.subject_id = ts.subject_id
     WHERE ts.teacher_id = ANY(?) AND s.deleted_at IS NULL
     ORDER BY s.subject_name`,
    [teacherIds],
  );
  return rows;
}

export async function findCurrentHomeroomByTeacherIds(teacherIds, db = pool) {
  const [rows] = await db.query(
    `SELECT c.homeroom_teacher_id AS "teacherId", c.class_name AS "className"
     FROM classes c
     WHERE c.homeroom_teacher_id = ANY(?)
       AND c.deleted_at IS NULL
       AND c.school_year_id = ${CURRENT_YEAR_SQL}
     ORDER BY c.class_name`,
    [teacherIds],
  );
  return rows;
}

// Class count and periods/week of assignments running today (periods from track_subjects, not subjects).
export async function findCurrentLoadByTeacherIds(teacherIds, db = pool) {
  const [rows] = await db.query(
    `SELECT
       ta.teacher_id      AS "teacherId",
       COUNT(DISTINCT ta.class_id) AS "classCount",
       COALESCE(SUM(tsj.periods_per_week), 0) AS "periodsPerWeek"
     FROM teaching_assignments ta
     JOIN classes c ON c.class_id = ta.class_id AND c.deleted_at IS NULL
     LEFT JOIN track_subjects tsj
       ON tsj.track_id = c.track_id
      AND tsj.subject_id = ta.subject_id
      AND tsj.school_year_id = c.school_year_id
     WHERE ta.teacher_id = ANY(?)
       AND ta.deleted_at IS NULL
       AND c.school_year_id = ${CURRENT_YEAR_SQL}
       AND CURRENT_DATE BETWEEN ta.start_date AND ta.end_date
     GROUP BY ta.teacher_id`,
    [teacherIds],
  );
  return rows;
}

// ── SCR-14 detail ───────────────────────────────────────────────────────────

export async function findTeacherProfileById(teacherId, db = pool) {
  const [rows] = await db.query(
    `SELECT
       t.teacher_id    AS "teacherId",
       t.teacher_code  AS "teacherCode",
       t.department,
       u.user_id       AS "userId",
       u.username,
       u.full_name     AS "fullName",
       u.email,
       u.phone,
       u.avatar_url    AS "avatarUrl",
       u.status,
       (u.locked_until IS NOT NULL AND u.locked_until > NOW()) AS "tempLocked",
       to_char(u.created_at, 'YYYY-MM-DD') AS "createdAt",
       to_char(u.updated_at, 'YYYY-MM-DD HH24:MI') AS "updatedAt"
     FROM teachers t
     JOIN users u ON u.user_id = t.user_id
     WHERE t.teacher_id = ?`,
    [teacherId],
  );
  return rows[0] ?? null;
}

export async function findSubjectsOfTeacher(teacherId, db = pool) {
  const [rows] = await db.query(
    `SELECT s.subject_id AS "subjectId", s.subject_name AS "name"
     FROM teacher_subjects ts
     JOIN subjects s ON s.subject_id = ts.subject_id
     WHERE ts.teacher_id = ? AND s.deleted_at IS NULL
     ORDER BY s.subject_name`,
    [teacherId],
  );
  return rows;
}

export async function findHomeroomClassesOfTeacher(teacherId, schoolYearId, db = pool) {
  const [rows] = await db.query(
    `SELECT c.class_id AS "classId", c.class_name AS "className"
     FROM classes c
     WHERE c.homeroom_teacher_id = ? AND c.school_year_id = ? AND c.deleted_at IS NULL
     ORDER BY c.class_name`,
    [teacherId, schoolYearId],
  );
  return rows;
}

// periods_per_week comes from track_subjects (track × subject × school year)
export async function findAssignmentsOfTeacher(teacherId, schoolYearId, db = pool) {
  const [rows] = await db.query(
    `SELECT
       ta.assignment_id   AS "assignmentId",
       c.class_id         AS "classId",
       c.class_name       AS "className",
       gl.grade_level_name AS "gradeLevel",
       ct.track_name      AS "trackName",
       s.subject_id       AS "subjectId",
       s.subject_name     AS "subjectName",
       tsj.periods_per_week AS "periodsPerWeek",
       to_char(ta.start_date, 'YYYY-MM-DD') AS "startDate",
       to_char(ta.end_date,   'YYYY-MM-DD') AS "endDate",
       (CURRENT_DATE BETWEEN ta.start_date AND ta.end_date) AS "isActive",
       (c.homeroom_teacher_id = ta.teacher_id)              AS "isHomeroomClass"
     FROM teaching_assignments ta
     JOIN classes c       ON c.class_id = ta.class_id AND c.deleted_at IS NULL
     JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
     JOIN class_tracks ct ON ct.track_id = c.track_id
     JOIN subjects s      ON s.subject_id = ta.subject_id
     LEFT JOIN track_subjects tsj
       ON tsj.track_id = c.track_id
      AND tsj.subject_id = ta.subject_id
      AND tsj.school_year_id = c.school_year_id
     WHERE ta.teacher_id = ? AND ta.deleted_at IS NULL AND c.school_year_id = ?
     ORDER BY c.class_name, s.subject_name, ta.start_date`,
    [teacherId, schoolYearId],
  );
  return rows;
}

// Week = Monday..Saturday of the given date (default today). One row even if the week is empty (for weekStart).
export async function findWeekSchedule(teacherId, week, db = pool) {
  const [rows] = await db.query(
    `WITH wk AS (SELECT date_trunc('week', COALESCE(?::date, CURRENT_DATE))::date AS monday)
     SELECT
       to_char(wk.monday, 'YYYY-MM-DD')     AS "weekStart",
       to_char(wk.monday + 5, 'YYYY-MM-DD') AS "weekEnd",
       to_char(ts."date", 'YYYY-MM-DD')     AS "date",
       EXTRACT(ISODOW FROM ts."date")::int  AS "dayOfWeek",
       sl.period_number                      AS "period",
       to_char(sl.start_time, 'HH24:MI')    AS "startTime",
       to_char(sl.end_time,   'HH24:MI')    AS "endTime",
       c.class_name                          AS "className",
       s.subject_name                        AS "subjectName",
       ts.room
     FROM wk
     LEFT JOIN timetable_slots ts
       ON ts.teacher_id = ? AND ts."date" BETWEEN wk.monday AND wk.monday + 5
     LEFT JOIN classes c    ON c.class_id = ts.class_id
     LEFT JOIN subjects s   ON s.subject_id = ts.subject_id
     LEFT JOIN time_slots sl ON sl.slot_id = ts.slot_id
     WHERE ts.timetable_slot_id IS NULL OR c.deleted_at IS NULL
     ORDER BY ts."date", sl.period_number`,
    [week || null, teacherId],
  );
  return rows;
}

// ── SCR-15 update (inside a transaction: pass `conn`) ───────────────────────

export async function lockTeacherForUpdate(teacherId, db) {
  const [rows] = await db.query(
    'SELECT teacher_id AS "teacherId", user_id AS "userId" FROM teachers WHERE teacher_id = ? FOR UPDATE',
    [teacherId],
  );
  return rows[0] ?? null;
}

// Current or future assignments that use a subject NOT in `keepSubjectIds` (those subjects cannot be removed).
export async function findAssignmentsBlockingSubjectRemoval(teacherId, keepSubjectIds, db) {
  const [rows] = await db.query(
    `SELECT s.subject_name AS "subjectName", c.class_name AS "className"
     FROM teaching_assignments ta
     JOIN subjects s ON s.subject_id = ta.subject_id
     JOIN classes c  ON c.class_id = ta.class_id AND c.deleted_at IS NULL
     WHERE ta.teacher_id = ? AND ta.deleted_at IS NULL
       AND ta.end_date >= CURRENT_DATE
       AND NOT (ta.subject_id = ANY(?::bigint[]))
     ORDER BY s.subject_name, c.class_name`,
    [teacherId, keepSubjectIds],
  );
  return rows;
}

export async function updateUserFullName(userId, fullName, db) {
  await db.query('UPDATE users SET full_name = ?, updated_at = NOW() WHERE user_id = ?', [fullName, userId]);
}

export async function updateDepartment(teacherId, department, db) {
  await db.query('UPDATE teachers SET department = ? WHERE teacher_id = ?', [department, teacherId]);
}

// teacher_subjects is a configuration table: hard delete is allowed (business-rules §14).
export async function replaceTeacherSubjects(teacherId, subjectIds, db) {
  await db.query('DELETE FROM teacher_subjects WHERE teacher_id = ? AND NOT (subject_id = ANY(?::bigint[]))', [
    teacherId,
    subjectIds,
  ]);
  await db.query(
    `INSERT INTO teacher_subjects (teacher_id, subject_id)
     SELECT ?, s FROM unnest(?::bigint[]) AS s
     ON CONFLICT (teacher_id, subject_id) DO NOTHING`,
    [teacherId, subjectIds],
  );
}

// ── SCR-16 / SCR-17 option lists ────────────────────────────────────────────

// All teachers with their subjects as one text ("Toán học, Vật lý") – homeroom picker.
export async function findAllTeachersWithSubjectNames(db = pool) {
  const [rows] = await db.query(
    `SELECT
       t.teacher_id   AS "teacherId",
       t.teacher_code AS "teacherCode",
       u.full_name    AS "fullName",
       u.status,
       COALESCE((
         SELECT string_agg(s.subject_name, ', ' ORDER BY s.subject_name)
         FROM teacher_subjects ts JOIN subjects s ON s.subject_id = ts.subject_id AND s.deleted_at IS NULL
         WHERE ts.teacher_id = t.teacher_id
       ), '') AS "subjects"
     FROM teachers t
     JOIN users u ON u.user_id = t.user_id
     ORDER BY u.full_name`,
  );
  return rows;
}

export async function findAllTeachersBasic(db = pool) {
  const [rows] = await db.query(
    `SELECT t.teacher_id AS "teacherId", t.teacher_code AS "teacherCode", t.department,
            u.full_name AS "fullName", u.status
     FROM teachers t JOIN users u ON u.user_id = t.user_id
     ORDER BY u.full_name`,
  );
  return rows;
}

export async function findAllTeacherSubjectPairs(db = pool) {
  const [rows] = await db.query(
    `SELECT ts.teacher_id AS "teacherId", ts.subject_id AS "subjectId"
     FROM teacher_subjects ts JOIN subjects s ON s.subject_id = ts.subject_id AND s.deleted_at IS NULL`,
  );
  return rows;
}

// Name + status of the given teachers (homeroom save).
export async function findTeachersStatusByIds(teacherIds, db = pool) {
  const [rows] = await db.query(
    `SELECT t.teacher_id AS "teacherId", u.full_name AS "fullName", u.status
     FROM teachers t JOIN users u ON u.user_id = t.user_id
     WHERE t.teacher_id = ANY(?::bigint[])`,
    [teacherIds],
  );
  return rows;
}

// Name + status + registered subjects of the given teachers (teaching assignment save).
export async function findTeachersWithSubjectIds(teacherIds, db = pool) {
  const [rows] = await db.query(
    `SELECT t.teacher_id AS "teacherId", u.full_name AS "fullName", u.status,
            COALESCE(array_agg(ts.subject_id) FILTER (WHERE ts.subject_id IS NOT NULL), '{}') AS "subjectIds"
     FROM teachers t
     JOIN users u ON u.user_id = t.user_id
     LEFT JOIN teacher_subjects ts ON ts.teacher_id = t.teacher_id
     WHERE t.teacher_id = ANY(?::bigint[])
     GROUP BY t.teacher_id, u.full_name, u.status`,
    [teacherIds],
  );
  return rows;
}
