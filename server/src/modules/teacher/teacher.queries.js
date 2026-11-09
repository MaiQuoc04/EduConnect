// FE-03 SQL (teachers, departments, subjects, school years, classes, teaching assignments, timetable slots).
// Every function takes an optional `db` (pool or a transaction client from withTransaction).
import { pool } from '../../config/db.js';
import { AppError } from '../../utils/AppError.js';
import { ENROLLMENT_STATUS, ERROR_CODES, HOMEROOM_FILTER } from './teacher.constants.js';
import { escapeLike, foldVietnamese, phoneSearchDigits, VI_TRANSLATE } from './teacher.text.js';

// ══ teacher ══════════════════════════════════════════════════════════════

// "Current school year" as a sub-query (MOM-05: latest year that has started). Constant SQL, no user input.
const CURRENT_YEAR_SQL = `(SELECT school_year_id FROM school_years
                          WHERE start_date <= CURRENT_DATE
                          ORDER BY start_date DESC LIMIT 1)`;

// ── SCR-14 list ─────────────────────────────────────────────────────────────

// Builds the WHERE clause of the list. Every user value goes in `params`; `add(v)` returns its "$n" placeholder.
function listFilters({ search, subject, homeroom, status }) {
  // users has no deleted_at column (accounts are LOCKED, not soft-deleted)
  const conditions = [];
  const params = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  // Accent-insensitive, case-insensitive form of a column (same result as foldVietnamese() in JS).
  const fold = (column) => `lower(translate(${column}, ${add(VI_TRANSLATE.from)}, ${add(VI_TRANSLATE.to)}))`;

  if (search) {
    // name without accents ("nguyen" finds "Nguyễn"), teacher code, email, phone ("0914 882 119", "+84914…").
    // User input is matched literally: % and _ are escaped.
    const parts = [
      `${fold('u.full_name')} LIKE ${add(`%${escapeLike(foldVietnamese(search))}%`)} ESCAPE '\\'`,
      `t.teacher_code ILIKE ${add(`%${escapeLike(search)}%`)} ESCAPE '\\'`,
      `u.email ILIKE ${add(`%${escapeLike(search)}%`)} ESCAPE '\\'`,
    ];
    const digits = phoneSearchDigits(search);
    if (digits) {
      parts.push(`regexp_replace(regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g'), '^84(\\d{9,})$', '0\\1') LIKE ${add(`%${digits}%`)}`);
    }
    conditions.push(`(${parts.join(' OR ')})`);
  }
  if (status) conditions.push(`u.status = ${add(status)}`);
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
      WHERE ts2.teacher_id = t.teacher_id
        AND ${fold('s2.subject_name')} LIKE ${add(`%${escapeLike(foldVietnamese(subject))}%`)} ESCAPE '\\'
        AND s2.deleted_at IS NULL
    )`);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

export async function countTeachers(filters, db = pool) {
  const { where, params } = listFilters(filters);
  const { rows } = await db.query(
    `SELECT COUNT(*) AS n FROM teachers t JOIN users u ON u.user_id = t.user_id ${where}`,
    params,
  );
  return Number(rows[0].n);
}

export async function findTeachersPage(filters, { limit, offset }, db = pool) {
  const { where, params } = listFilters(filters);
  const n = params.length;
  const { rows } = await db.query(
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
     LIMIT $${n + 1} OFFSET $${n + 2}`,
    [...params, limit, offset],
  );
  return rows;
}

export async function findSubjectNamesByTeacherIds(teacherIds, db = pool) {
  const { rows } = await db.query(
    `SELECT ts.teacher_id AS "teacherId", s.subject_name AS name
     FROM teacher_subjects ts
     JOIN subjects s ON s.subject_id = ts.subject_id
     WHERE ts.teacher_id = ANY($1) AND s.deleted_at IS NULL
     ORDER BY s.subject_name`,
    [teacherIds],
  );
  return rows;
}

export async function findCurrentHomeroomByTeacherIds(teacherIds, db = pool) {
  const { rows } = await db.query(
    `SELECT c.homeroom_teacher_id AS "teacherId", c.class_name AS "className"
     FROM classes c
     WHERE c.homeroom_teacher_id = ANY($1)
       AND c.deleted_at IS NULL
       AND c.school_year_id = ${CURRENT_YEAR_SQL}
     ORDER BY c.class_name`,
    [teacherIds],
  );
  return rows;
}

// Class count and periods/week of assignments running today (periods from track_subjects, not subjects).
export async function findCurrentLoadByTeacherIds(teacherIds, db = pool) {
  const { rows } = await db.query(
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
     WHERE ta.teacher_id = ANY($1)
       AND ta.deleted_at IS NULL
       AND c.school_year_id = ${CURRENT_YEAR_SQL}
       AND CURRENT_DATE BETWEEN ta.start_date AND ta.end_date
     GROUP BY ta.teacher_id`,
    [teacherIds],
  );
  return rows;
}

// ── SCR-15 detail ───────────────────────────────────────────────────────────

export async function findTeacherProfileById(teacherId, db = pool) {
  const { rows } = await db.query(
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
     WHERE t.teacher_id = $1`,
    [teacherId],
  );
  return rows[0] ?? null;
}

export async function findSubjectsOfTeacher(teacherId, db = pool) {
  const { rows } = await db.query(
    `SELECT s.subject_id AS "subjectId", s.subject_name AS "name"
     FROM teacher_subjects ts
     JOIN subjects s ON s.subject_id = ts.subject_id
     WHERE ts.teacher_id = $1 AND s.deleted_at IS NULL
     ORDER BY s.subject_name`,
    [teacherId],
  );
  return rows;
}

export async function findHomeroomClassesOfTeacher(teacherId, schoolYearId, db = pool) {
  const { rows } = await db.query(
    `SELECT c.class_id AS "classId", c.class_name AS "className"
     FROM classes c
     WHERE c.homeroom_teacher_id = $1 AND c.school_year_id = $2 AND c.deleted_at IS NULL
     ORDER BY c.class_name`,
    [teacherId, schoolYearId],
  );
  return rows;
}

// periods_per_week comes from track_subjects (track × subject × school year)
export async function findAssignmentsOfTeacher(teacherId, schoolYearId, db = pool) {
  const { rows } = await db.query(
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
     WHERE ta.teacher_id = $1 AND ta.deleted_at IS NULL AND c.school_year_id = $2
     ORDER BY c.class_name, s.subject_name, ta.start_date`,
    [teacherId, schoolYearId],
  );
  return rows;
}

// Week = Monday..Saturday of the given date (default today). One row even if the week is empty (for weekStart).
export async function findWeekSchedule(teacherId, week, db = pool) {
  const { rows } = await db.query(
    `WITH wk AS (SELECT date_trunc('week', COALESCE($1::date, CURRENT_DATE))::date AS monday)
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
       ON ts.teacher_id = $2 AND ts."date" BETWEEN wk.monday AND wk.monday + 5
     LEFT JOIN classes c    ON c.class_id = ts.class_id
     LEFT JOIN subjects s   ON s.subject_id = ts.subject_id
     LEFT JOIN time_slots sl ON sl.slot_id = ts.slot_id
     WHERE ts.timetable_slot_id IS NULL OR c.deleted_at IS NULL
     ORDER BY ts."date", sl.period_number`,
    [week || null, teacherId],
  );
  return rows;
}

// ── SCR-17 update (inside a transaction: pass `conn`) ───────────────────────

export async function lockTeacherForUpdate(teacherId, db) {
  const { rows } = await db.query(
    'SELECT teacher_id AS "teacherId", user_id AS "userId", department FROM teachers WHERE teacher_id = $1 FOR UPDATE',
    [teacherId],
  );
  return rows[0] ?? null;
}

// Current or future assignments that use a subject NOT in `keepSubjectIds` (those subjects cannot be removed).
export async function findAssignmentsBlockingSubjectRemoval(teacherId, keepSubjectIds, db) {
  const { rows } = await db.query(
    `SELECT s.subject_name AS "subjectName", c.class_name AS "className"
     FROM teaching_assignments ta
     JOIN subjects s ON s.subject_id = ta.subject_id
     JOIN classes c  ON c.class_id = ta.class_id AND c.deleted_at IS NULL
     WHERE ta.teacher_id = $1 AND ta.deleted_at IS NULL
       AND ta.end_date >= CURRENT_DATE
       AND NOT (ta.subject_id = ANY($2::bigint[]))
     ORDER BY s.subject_name, c.class_name`,
    [teacherId, keepSubjectIds],
  );
  return rows;
}

export async function updateUserFullName(userId, fullName, db) {
  // updated_at is set by the trigger trg_users_updated_at (schema v0.3)
  await db.query('UPDATE users SET full_name = $1 WHERE user_id = $2', [fullName, userId]);
}

export async function updateDepartment(teacherId, department, db) {
  await db.query('UPDATE teachers SET department = $1 WHERE teacher_id = $2', [department, teacherId]);
}

// teacher_subjects is a configuration table: hard delete is allowed (business-rules §14).
export async function replaceTeacherSubjects(teacherId, subjectIds, db) {
  await db.query('DELETE FROM teacher_subjects WHERE teacher_id = $1 AND NOT (subject_id = ANY($2::bigint[]))', [
    teacherId,
    subjectIds,
  ]);
  await db.query(
    `INSERT INTO teacher_subjects (teacher_id, subject_id)
     SELECT $1, s FROM unnest($2::bigint[]) AS s
     ON CONFLICT (teacher_id, subject_id) DO NOTHING`,
    [teacherId, subjectIds],
  );
}

// ── SCR-18 / SCR-19 option lists ────────────────────────────────────────────

// All teachers with their subjects as one text ("Toán học, Vật lý") – homeroom picker.
export async function findAllTeachersWithSubjectNames(db = pool) {
  const { rows } = await db.query(
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
  const { rows } = await db.query(
    `SELECT t.teacher_id AS "teacherId", t.teacher_code AS "teacherCode", t.department,
            u.full_name AS "fullName", u.status
     FROM teachers t JOIN users u ON u.user_id = t.user_id
     ORDER BY u.full_name`,
  );
  return rows;
}

export async function findAllTeacherSubjectPairs(db = pool) {
  const { rows } = await db.query(
    `SELECT ts.teacher_id AS "teacherId", ts.subject_id AS "subjectId"
     FROM teacher_subjects ts JOIN subjects s ON s.subject_id = ts.subject_id AND s.deleted_at IS NULL`,
  );
  return rows;
}

// Name + status of the given teachers (homeroom save).
export async function findTeachersStatusByIds(teacherIds, db = pool) {
  const { rows } = await db.query(
    `SELECT t.teacher_id AS "teacherId", u.full_name AS "fullName", u.status
     FROM teachers t JOIN users u ON u.user_id = t.user_id
     WHERE t.teacher_id = ANY($1::bigint[])`,
    [teacherIds],
  );
  return rows;
}

// Name + status + registered subjects of the given teachers (teaching assignment save).
export async function findTeachersWithSubjectIds(teacherIds, db = pool) {
  const { rows } = await db.query(
    `SELECT t.teacher_id AS "teacherId", u.full_name AS "fullName", u.status,
            COALESCE(array_agg(ts.subject_id) FILTER (WHERE ts.subject_id IS NOT NULL), '{}') AS "subjectIds"
     FROM teachers t
     JOIN users u ON u.user_id = t.user_id
     LEFT JOIN teacher_subjects ts ON ts.teacher_id = t.teacher_id
     WHERE t.teacher_id = ANY($1::bigint[])
     GROUP BY t.teacher_id, u.full_name, u.status`,
    [teacherIds],
  );
  return rows;
}

// ══ department ══════════════════════════════════════════════════════════════

// departments = the list of tổ chuyên môn (database/patch_v0.3_departments.sql). teachers.department stores the NAME.

// Postgres "undefined_table": the shared database has not run patch_v0.3_departments.sql yet.
function notReady(err) {
  if (err?.code === '42P01') {
    return new AppError(503, ERROR_CODES.DEPARTMENTS_NOT_READY, 'Table departments is missing: run database/patch_v0.3_departments.sql.');
  }
  return err;
}

export async function findActiveDepartments(db = pool) {
  try {
    const { rows } = await db.query(
      `SELECT department_id AS "departmentId", department_name AS "name"
       FROM departments WHERE deleted_at IS NULL ORDER BY department_name`,
    );
    return rows;
  } catch (err) {
    throw notReady(err);
  }
}

export async function findActiveDepartmentById(departmentId, db = pool) {
  try {
    const { rows } = await db.query(
      `SELECT department_id AS "departmentId", department_name AS "name"
       FROM departments WHERE department_id = $1 AND deleted_at IS NULL`,
      [departmentId],
    );
    return rows[0] ?? null;
  } catch (err) {
    throw notReady(err);
  }
}

// ── Departments screen (UC-114) and subjects of a department (department_subjects, patch 07/11) ─────────────

// Every active department with its subjects and number of teachers (teachers.department stores the name).
export async function findDepartmentsWithSubjects(db = pool) {
  try {
    const { rows } = await db.query(
      `SELECT d.department_id AS "departmentId", d.department_name AS "name",
              (SELECT COUNT(*) FROM teachers t WHERE t.department = d.department_name)::int AS "teacherCount",
              COALESCE(json_agg(json_build_object('subjectId', s.subject_id, 'code', s.subject_code, 'name', s.subject_name)
                                ORDER BY s.subject_name) FILTER (WHERE s.subject_id IS NOT NULL), '[]') AS "subjects"
       FROM departments d
       LEFT JOIN department_subjects ds ON ds.department_id = d.department_id
       LEFT JOIN subjects s ON s.subject_id = ds.subject_id AND s.deleted_at IS NULL
       WHERE d.deleted_at IS NULL
       GROUP BY d.department_id
       ORDER BY d.department_name`,
    );
    return rows;
  } catch (err) {
    throw notReady(err);
  }
}

// Every department row (deleted ones too) – used to check names; few rows.
export async function findAllDepartmentNames(db) {
  const { rows } = await db.query(
    `SELECT department_id AS "departmentId", department_name AS "name", (deleted_at IS NOT NULL) AS "deleted"
     FROM departments FOR UPDATE`,
  );
  return rows;
}

export async function insertDepartment(name, db) {
  const { rows } = await db.query('INSERT INTO departments (department_name) VALUES ($1) RETURNING department_id AS "departmentId"', [name]);
  return rows[0].departmentId;
}

// A deleted department with the same name comes back (department_name is UNIQUE, deleted rows included).
export async function restoreDepartment(departmentId, db) {
  await db.query('UPDATE departments SET deleted_at = NULL WHERE department_id = $1', [departmentId]);
}

export async function renameDepartment(departmentId, name, db) {
  await db.query('UPDATE departments SET department_name = $1 WHERE department_id = $2', [name, departmentId]);
}

// teachers.department keeps the name: a rename is copied to the teachers of the department.
export async function renameTeachersDepartment(oldName, newName, db) {
  await db.query('UPDATE teachers SET department = $1 WHERE department = $2', [newName, oldName]);
}

export async function countTeachersInDepartment(name, db) {
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM teachers WHERE department = $1', [name]);
  return Number(rows[0].n);
}

export async function softDeleteDepartment(departmentId, db) {
  await db.query('UPDATE departments SET deleted_at = NOW() WHERE department_id = $1', [departmentId]);
}

// Subjects (of `subjectIds`) that already belong to ANOTHER department.
export async function findSubjectsInOtherDepartments(departmentId, subjectIds, db) {
  const { rows } = await db.query(
    `SELECT s.subject_name AS "subject", d.department_name AS "department"
     FROM department_subjects ds
     JOIN subjects s    ON s.subject_id = ds.subject_id
     JOIN departments d ON d.department_id = ds.department_id
     WHERE ds.subject_id = ANY($1::bigint[]) AND ds.department_id IS DISTINCT FROM $2::bigint
     ORDER BY s.subject_name`,
    [subjectIds, departmentId],
  );
  return rows;
}

// department_subjects is a link table: hard delete is allowed (like teacher_subjects).
export async function replaceDepartmentSubjects(departmentId, subjectIds, db) {
  await db.query('DELETE FROM department_subjects WHERE department_id = $1 AND NOT (subject_id = ANY($2::bigint[]))', [
    departmentId,
    subjectIds,
  ]);
  await db.query(
    `INSERT INTO department_subjects (department_id, subject_id)
     SELECT $1, s FROM unnest($2::bigint[]) AS s
     ON CONFLICT DO NOTHING`,
    [departmentId, subjectIds],
  );
}

// False until patch_v0.3_department_subjects.sql has run on this database.
export async function hasDepartmentSubjects(db = pool) {
  const { rows } = await db.query(`SELECT to_regclass('public.department_subjects') IS NOT NULL AS "ok"`);
  return Boolean(rows[0].ok);
}

// subject id -> department id (null = no department) for the given subjects.
export async function findDepartmentOfSubjects(subjectIds, db = pool) {
  const { rows } = await db.query(
    `SELECT s.subject_id AS "subjectId", s.subject_name AS "name", ds.department_id AS "departmentId"
     FROM subjects s LEFT JOIN department_subjects ds ON ds.subject_id = s.subject_id
     WHERE s.subject_id = ANY($1::bigint[])`,
    [subjectIds],
  );
  return rows;
}

export async function findActiveDepartmentByName(name, db = pool) {
  const { rows } = await db.query(
    `SELECT department_id AS "departmentId", department_name AS "name"
     FROM departments WHERE department_name = $1 AND deleted_at IS NULL`,
    [name],
  );
  return rows[0] ?? null;
}

// ══ subject ══════════════════════════════════════════════════════════════

// With the department each subject belongs to (null = none). Before patch_v0.3_department_subjects.sql has run, every
// subject is listed without a department.
export async function findActiveSubjects(db = pool) {
  try {
    const { rows } = await db.query(
      `SELECT s.subject_id AS "subjectId", s.subject_code AS "code", s.subject_name AS "name",
              ds.department_id AS "departmentId"
       FROM subjects s LEFT JOIN department_subjects ds ON ds.subject_id = s.subject_id
       WHERE s.deleted_at IS NULL ORDER BY s.subject_name`,
    );
    return rows;
  } catch (err) {
    if (err?.code !== '42P01') throw err;
    const { rows } = await db.query(
      `SELECT subject_id AS "subjectId", subject_code AS "code", subject_name AS "name", NULL AS "departmentId"
       FROM subjects WHERE deleted_at IS NULL ORDER BY subject_name`,
    );
    return rows;
  }
}

// How many of the given ids are existing, not deleted subjects.
export async function countActiveSubjectsByIds(subjectIds, db = pool) {
  const { rows } = await db.query(
    'SELECT subject_id AS "subjectId" FROM subjects WHERE subject_id = ANY($1::bigint[]) AND deleted_at IS NULL',
    [subjectIds],
  );
  return rows.length;
}

// ══ schoolYear ══════════════════════════════════════════════════════════════

// MOM-05: no is_current column; the current year is the latest one that has started.
export async function findCurrentSchoolYear(db = pool) {
  const { rows } = await db.query(
    `SELECT school_year_id AS "id", year_name AS "name" FROM school_years
     WHERE start_date <= CURRENT_DATE ORDER BY start_date DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}

// Newest first, with "started" so the caller can tell which one is current.
export async function findAllSchoolYears(db = pool) {
  const { rows } = await db.query(
    `SELECT school_year_id AS "id", year_name AS "name",
            to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate",
            (start_date <= CURRENT_DATE) AS "started"
     FROM school_years ORDER BY start_date DESC`,
  );
  return rows;
}

export async function findSchoolYearById(id, db = pool) {
  const { rows } = await db.query(
    `SELECT school_year_id AS "id", year_name AS "name",
            to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate"
     FROM school_years WHERE school_year_id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// Today's date from the database (times are compared in SQL, not in JS).
export async function findToday(db = pool) {
  const { rows } = await db.query(`SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS "today"`);
  return rows[0].today;
}

// ══ class ══════════════════════════════════════════════════════════════

// Classes of one school year with grade, track, homeroom teacher and number of studying students.
export async function findClassesOfYear(schoolYearId, db = pool) {
  const { rows } = await db.query(
    `SELECT
       c.class_id            AS "classId",
       c.class_name          AS "className",
       gl.grade_level_name   AS "gradeLevel",
       ct.track_name         AS "trackName",
       c.homeroom_teacher_id AS "homeroomTeacherId",
       (SELECT COUNT(*) FROM class_enrollments e
         WHERE e.class_id = c.class_id AND e.status = $1)::int AS "studentCount"
     FROM classes c
     JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
     JOIN class_tracks ct ON ct.track_id = c.track_id
     WHERE c.school_year_id = $2 AND c.deleted_at IS NULL
     ORDER BY gl.grade_level_name, c.class_name`,
    [ENROLLMENT_STATUS.STUDYING, schoolYearId],
  );
  return rows;
}

// Locks every class row of the year (FOR UPDATE) so two managers saving at once are serialised.
export async function lockClassesOfYear(schoolYearId, db) {
  const { rows } = await db.query(
    `SELECT class_id AS "classId", class_name AS "className", track_id AS "trackId",
            homeroom_teacher_id AS "homeroomTeacherId"
     FROM classes WHERE school_year_id = $1 AND deleted_at IS NULL
     ORDER BY class_id FOR UPDATE`,
    [schoolYearId],
  );
  return rows;
}

export async function updateHomeroomTeacher(classId, teacherId, db) {
  await db.query('UPDATE classes SET homeroom_teacher_id = $1 WHERE class_id = $2', [teacherId, classId]);
}

// Subjects each class studies in its year (track_subjects of the class's track), with periods per week.
export async function findClassSubjectsOfYear(schoolYearId, db = pool) {
  const { rows } = await db.query(
    `SELECT c.class_id AS "classId", s.subject_id AS "subjectId", s.subject_name AS "subjectName",
            s.subject_code AS "subjectCode", tsj.periods_per_week AS "periodsPerWeek"
     FROM classes c
     JOIN track_subjects tsj ON tsj.track_id = c.track_id AND tsj.school_year_id = c.school_year_id
     JOIN subjects s ON s.subject_id = tsj.subject_id AND s.deleted_at IS NULL
     WHERE c.school_year_id = $1 AND c.deleted_at IS NULL`,
    [schoolYearId],
  );
  return rows;
}

// ══ teachingAssignment ══════════════════════════════════════════════════════════════

// Assignments of the year that run on `date` (start_date <= date <= end_date).
export async function findActiveOnDate(schoolYearId, date, db = pool) {
  return findOverlapping(schoolYearId, date, date, db);
}

// Assignments of the year that overlap [from, to] (history included), with the teacher's name, oldest first.
export async function findOverlapping(schoolYearId, from, to, db = pool) {
  const { rows } = await db.query(
    `SELECT ta.assignment_id AS "assignmentId", ta.class_id AS "classId", ta.subject_id AS "subjectId",
            ta.teacher_id AS "teacherId", u.full_name AS "teacherName", t.teacher_code AS "teacherCode",
            to_char(ta.start_date, 'YYYY-MM-DD') AS "startDate", to_char(ta.end_date, 'YYYY-MM-DD') AS "endDate"
     FROM teaching_assignments ta
     JOIN classes c  ON c.class_id = ta.class_id AND c.deleted_at IS NULL
     JOIN teachers t ON t.teacher_id = ta.teacher_id
     JOIN users u    ON u.user_id = t.user_id
     WHERE c.school_year_id = $1 AND ta.deleted_at IS NULL
       AND ta.start_date <= $3::date AND ta.end_date >= $2::date
     ORDER BY ta.class_id, ta.subject_id, ta.start_date`,
    [schoolYearId, from, to],
  );
  return rows;
}

/**
 * Frees [start, end] of one (class, subject) and keeps everything outside it (history is never deleted):
 * a row covering the whole range is split (its part after `end` becomes a new row), a row that starts before
 * ends the day before `start`, a row inside the range is soft-deleted (it starts today or later, so it is a plan,
 * not history), and a row that starts inside and runs past `end` starts the day after `end`.
 */
export async function clearRange(classId, subjectId, start, end, db) {
  const pair = 'class_id = $1 AND subject_id = $2 AND deleted_at IS NULL';
  await db.query(
    `INSERT INTO teaching_assignments (class_id, subject_id, teacher_id, start_date, end_date)
     SELECT class_id, subject_id, teacher_id, $4::date + 1, end_date FROM teaching_assignments
     WHERE ${pair} AND start_date < $3::date AND end_date > $4::date`,
    [classId, subjectId, start, end],
  );
  await db.query(
    `UPDATE teaching_assignments SET end_date = $3::date - 1
     WHERE ${pair} AND start_date < $3::date AND end_date >= $3::date`,
    [classId, subjectId, start],
  );
  await db.query(
    `UPDATE teaching_assignments SET deleted_at = NOW()
     WHERE ${pair} AND start_date >= $3::date AND end_date <= $4::date`,
    [classId, subjectId, start, end],
  );
  await db.query(
    `UPDATE teaching_assignments SET start_date = $4::date + 1
     WHERE ${pair} AND start_date >= $3::date AND start_date <= $4::date AND end_date > $4::date`,
    [classId, subjectId, start, end],
  );
}

export async function insertAssignment({ classId, subjectId, teacherId, startDate, endDate }, db) {
  await db.query(
    `INSERT INTO teaching_assignments (class_id, subject_id, teacher_id, start_date, end_date)
     VALUES ($1, $2, $3, $4::date, $5::date)`,
    [classId, subjectId, teacherId, startDate, endDate],
  );
}

// Two rows of the same teacher that touch (next starts the day after the previous ends) become one row, so
// "A, then B for two weeks, then A again – B cancelled" does not leave A in pieces.
export async function mergeTouchingRows(classId, subjectId, db) {
  for (;;) {
    const { rows } = await db.query(
      `SELECT prev_id AS "prevId", assignment_id AS "nextId", to_char(end_date, 'YYYY-MM-DD') AS "endDate"
       FROM (SELECT assignment_id, teacher_id, start_date, end_date,
                    LAG(assignment_id) OVER w AS prev_id, LAG(teacher_id) OVER w AS prev_teacher,
                    LAG(end_date) OVER w AS prev_end
             FROM teaching_assignments
             WHERE class_id = $1 AND subject_id = $2 AND deleted_at IS NULL
             WINDOW w AS (ORDER BY start_date)) x
       WHERE prev_teacher = teacher_id AND start_date = prev_end + 1
       LIMIT 1`,
      [classId, subjectId],
    );
    if (!rows.length) return;
    const { prevId, nextId, endDate } = rows[0];
    await db.query('UPDATE teaching_assignments SET end_date = $1::date WHERE assignment_id = $2', [endDate, prevId]);
    await db.query('UPDATE teaching_assignments SET deleted_at = NOW() WHERE assignment_id = $1', [nextId]);
  }
}

// ══ timetable ══════════════════════════════════════════════════════════════

// Timetable rows of one (class, subject) between two dates that have no attendance yet.
// business-rules §10: rows that already have attendance are kept as they are.
// `first` = number of the first placeholder used here (class $first, subject +1, start +2, end +3).
const freeSlots = (first) => `
  FROM timetable_slots ts
  WHERE ts.class_id = $${first} AND ts.subject_id = $${first + 1}
    AND ts."date" BETWEEN $${first + 2}::date AND $${first + 3}::date
    AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.timetable_slot_id = ts.timetable_slot_id)`;

export async function countFreeSlots(classId, subjectId, start, end, db) {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS "n" ${freeSlots(1)}`, [classId, subjectId, start, end]);
  return Number(rows[0].n);
}

// Periods between start and end where `teacherId` already teaches another lesson at the same date + period (first 5).
export async function findTeacherClashes(teacherId, classId, subjectId, start, end, db) {
  const { rows } = await db.query(
    `SELECT to_char(ts."date", 'YYYY-MM-DD') AS "date", sl.period_number AS "period", c2.class_name AS "otherClass"
     FROM timetable_slots ts
     JOIN time_slots sl ON sl.slot_id = ts.slot_id
     JOIN timetable_slots other
       ON other.teacher_id = $1 AND other."date" = ts."date" AND other.slot_id = ts.slot_id
      AND other.timetable_slot_id <> ts.timetable_slot_id
     JOIN classes c2 ON c2.class_id = other.class_id
     WHERE ts.class_id = $2 AND ts.subject_id = $3 AND ts."date" BETWEEN $4::date AND $5::date
       AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.timetable_slot_id = ts.timetable_slot_id)
     ORDER BY ts."date", sl.period_number
     LIMIT 5`,
    [teacherId, classId, subjectId, start, end],
  );
  return rows;
}

// No substitute teaching: the timetable teacher must match the assignment.
export async function moveFreeSlotsToTeacher(teacherId, classId, subjectId, start, end, db) {
  await db.query(`UPDATE timetable_slots SET teacher_id = $1 WHERE timetable_slot_id IN (SELECT ts.timetable_slot_id ${freeSlots(2)})`, [
    teacherId,
    classId,
    subjectId,
    start,
    end,
  ]);
}
