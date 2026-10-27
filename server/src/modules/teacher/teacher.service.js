import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, notFound } from '../../utils/AppError.js';

/**
 * SCR-13 – Teacher list for School Manager.
 * Returns paginated teachers with subjects, homeroom class, class count & periods.
 */
export async function listTeachers({ page, limit, search, subject, homeroom, status }) {
  const offset = (page - 1) * limit;

  // --- WHERE conditions ---
  // users has no deleted_at column (accounts are LOCKED, not soft-deleted)
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push("(u.full_name ILIKE ? OR t.teacher_code ILIKE ? OR u.email ILIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (status === 'ACTIVE' || status === 'LOCKED') {
    conditions.push('u.status = ?');
    params.push(status);
  }
  if (homeroom === 'has') {
    conditions.push(`EXISTS (
      SELECT 1 FROM classes c2
      WHERE c2.homeroom_teacher_id = t.teacher_id AND c2.deleted_at IS NULL
    )`);
  } else if (homeroom === 'none') {
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM classes c2
      WHERE c2.homeroom_teacher_id = t.teacher_id AND c2.deleted_at IS NULL
    )`);
  }
  if (subject) {
    conditions.push(`EXISTS (
      SELECT 1 FROM teacher_subjects ts2
      JOIN subjects s2 ON s2.subject_id = ts2.subject_id
      WHERE ts2.teacher_id = t.teacher_id AND s2.subject_name ILIKE ? AND s2.deleted_at IS NULL
    )`);
    params.push(`%${subject}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // --- Count total ---
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM teachers t
     JOIN users u ON u.user_id = t.user_id
     ${where}`,
    params,
  );
  const total = Number(countRows[0].n);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // --- Fetch page ---
  const [rows] = await pool.query(
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

  if (!rows.length) return { teachers: [], total, page, totalPages };

  const teacherIds = rows.map((r) => r.teacherId);

  // --- Subjects per teacher ---
  const [subjectRows] = await pool.query(
    `SELECT ts.teacher_id AS "teacherId", s.subject_name AS name
     FROM teacher_subjects ts
     JOIN subjects s ON s.subject_id = ts.subject_id
     WHERE ts.teacher_id = ANY(?) AND s.deleted_at IS NULL
     ORDER BY s.subject_name`,
    [teacherIds],
  );

  // Current school year = the latest one that has already started.
  const currentYear = `(SELECT school_year_id FROM school_years
                        WHERE start_date <= CURRENT_DATE
                        ORDER BY start_date DESC LIMIT 1)`;

  // --- Homeroom class (current school year) ---
  const [homeroomRows] = await pool.query(
    `SELECT c.homeroom_teacher_id AS "teacherId", c.class_name AS "className"
     FROM classes c
     WHERE c.homeroom_teacher_id = ANY(?)
       AND c.deleted_at IS NULL
       AND c.school_year_id = ${currentYear}
     ORDER BY c.class_name`,
    [teacherIds],
  );

  // --- Class count & periods (current school year) ---
  const [assignRows] = await pool.query(
    `SELECT
       ta.teacher_id      AS "teacherId",
       COUNT(DISTINCT ta.class_id) AS "classCount",
       COALESCE(SUM(tsj.periods_per_week), 0) AS "periodsPerWeek"
     FROM teaching_assignments ta
     JOIN classes c ON c.class_id = ta.class_id AND c.deleted_at IS NULL
     -- periods_per_week lives in track_subjects (per track + subject + school year), not in subjects
     LEFT JOIN track_subjects tsj
       ON tsj.track_id = c.track_id
      AND tsj.subject_id = ta.subject_id
      AND tsj.school_year_id = c.school_year_id
     WHERE ta.teacher_id = ANY(?)
       AND ta.deleted_at IS NULL
       AND c.school_year_id = ${currentYear}
       AND CURRENT_DATE BETWEEN ta.start_date AND ta.end_date
     GROUP BY ta.teacher_id`,
    [teacherIds],
  );

  // --- Merge ---
  const subjectMap  = {};
  const homeroomMap = {};
  const assignMap   = {};

  for (const r of subjectRows) {
    (subjectMap[r.teacherId] ??= []).push(r.name);
  }
  for (const r of homeroomRows) {
    homeroomMap[r.teacherId] ??= r.className;
  }
  for (const r of assignRows) {
    assignMap[r.teacherId] = { classCount: Number(r.classCount), periodsPerWeek: Number(r.periodsPerWeek) };
  }

  const teachers = rows.map((t) => ({
    ...t,
    subjects:       subjectMap[t.teacherId]  ?? [],
    homeroomClass:  homeroomMap[t.teacherId] ?? null,
    classCount:     assignMap[t.teacherId]?.classCount     ?? 0,
    periodsPerWeek: assignMap[t.teacherId]?.periodsPerWeek ?? 0,
  }));

  return { teachers, total, page, totalPages };
}

// The current school year is found by date (MOM-05: no is_current); between two years, the latest one that started.
async function currentSchoolYear() {
  const [rows] = await pool.query(
    `SELECT school_year_id AS "id", year_name AS "name" FROM school_years
     WHERE start_date <= CURRENT_DATE ORDER BY start_date DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}

/**
 * SCR-14 / UC-16 – Teacher detail for School Manager:
 * profile, subjects, homeroom class, teaching assignments of the current school year
 * and the teaching schedule of one week (Mon–Sat) built from timetable_slots.
 * Dates are returned as 'YYYY-MM-DD' strings so no time-zone shift happens in JSON.
 */
export async function getTeacherDetail(teacherId, { week } = {}) {
  const [rows] = await pool.query(
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
  if (!rows.length) throw notFound('TEACHER_NOT_FOUND', 'Teacher not found.');
  const teacher = rows[0];

  const year = await currentSchoolYear();
  const yearId = year?.id ?? 0;

  const [subjects, homeroom, assignments, schedule] = await Promise.all([
    pool.query(
      `SELECT s.subject_id AS "subjectId", s.subject_name AS "name"
       FROM teacher_subjects ts
       JOIN subjects s ON s.subject_id = ts.subject_id
       WHERE ts.teacher_id = ? AND s.deleted_at IS NULL
       ORDER BY s.subject_name`,
      [teacherId],
    ),
    pool.query(
      `SELECT c.class_id AS "classId", c.class_name AS "className"
       FROM classes c
       WHERE c.homeroom_teacher_id = ? AND c.school_year_id = ? AND c.deleted_at IS NULL
       ORDER BY c.class_name`,
      [teacherId, yearId],
    ),
    // periods_per_week comes from track_subjects (track × subject × school year)
    pool.query(
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
      [teacherId, yearId],
    ),
    // Week = Monday..Saturday of the given date (default today); compared in SQL, not in JS.
    pool.query(
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
    ),
  ]).then((results) => results.map(([r]) => r));

  const slots = schedule.filter((r) => r.date);
  const activeAssignments = assignments.filter((a) => a.isActive);

  return {
    teacher: {
      ...teacher,
      tempLocked: Boolean(teacher.tempLocked),
      subjects,
      homeroomClasses: homeroom,
    },
    schoolYear: year?.name ?? null,
    assignments: assignments.map((a) => ({
      ...a,
      periodsPerWeek: a.periodsPerWeek == null ? null : Number(a.periodsPerWeek),
      isActive: Boolean(a.isActive),
      isHomeroomClass: Boolean(a.isHomeroomClass),
    })),
    workload: {
      classCount: new Set(activeAssignments.map((a) => a.classId)).size,
      periodsPerWeek: activeAssignments.reduce((sum, a) => sum + Number(a.periodsPerWeek ?? 0), 0),
    },
    schedule: {
      weekStart: schedule[0]?.weekStart ?? null,
      weekEnd: schedule[0]?.weekEnd ?? null,
      slots: slots.map(({ weekStart, weekEnd, ...slot }) => slot),
    },
  };
}

// Subjects a School Manager can pick on SCR-15 (not deleted).
// ASSUMPTION: served from the teacher module until FE-04 publishes GET /subjects.
export async function listSubjectOptions() {
  const [rows] = await pool.query(
    `SELECT subject_id AS "subjectId", subject_code AS "code", subject_name AS "name"
     FROM subjects WHERE deleted_at IS NULL ORDER BY subject_name`,
  );
  return { subjects: rows };
}

const FULL_NAME_MAX = 150; // users.full_name VARCHAR(150)
const DEPARTMENT_MAX = 100; // teachers.department VARCHAR(100)

/**
 * SCR-15 / UC-17 – School Manager updates a teacher's profile.
 * Editable: full name, department, subjects the teacher can teach (teacher_subjects).
 * Login identifiers (username, email, phone) are System Admin only (UC-99) and are ignored here.
 */
export async function updateTeacher(teacherId, input = {}) {
  // --- validate input ---
  const fullName = typeof input.fullName === 'string' ? input.fullName.trim().replace(/\s+/g, ' ') : '';
  if (!fullName) throw badRequest('MSG_REQUIRED', 'Full name is required.', { field: 'fullName' });
  if (fullName.length > FULL_NAME_MAX) {
    throw badRequest('MSG_FIELD_TOO_LONG', 'Full name is too long.', { field: 'fullName', max: FULL_NAME_MAX });
  }

  const department = typeof input.department === 'string' ? input.department.trim() : '';
  if (department.length > DEPARTMENT_MAX) {
    throw badRequest('MSG_FIELD_TOO_LONG', 'Department is too long.', { field: 'department', max: DEPARTMENT_MAX });
  }

  if (!Array.isArray(input.subjectIds)) {
    throw badRequest('MSG_REQUIRED', 'subjectIds must be a list.', { field: 'subjectIds' });
  }
  const subjectIds = [...new Set(input.subjectIds.map(String))];
  if (subjectIds.some((id) => !/^\d{1,18}$/.test(id))) {
    throw badRequest('MSG_SUBJECT_INVALID', 'Unknown subject.', { field: 'subjectIds' });
  }
  // ASSUMPTION: a teacher keeps at least one subject (SCR-15 design marks the field as required).
  if (!subjectIds.length) {
    throw badRequest('MSG_REQUIRED', 'Choose at least one subject.', { field: 'subjectIds' });
  }

  return withTransaction(async (conn) => {
    const [teachers] = await conn.query(
      'SELECT teacher_id AS "teacherId", user_id AS "userId" FROM teachers WHERE teacher_id = ? FOR UPDATE',
      [teacherId],
    );
    if (!teachers.length) throw notFound('TEACHER_NOT_FOUND', 'Teacher not found.');
    const { userId } = teachers[0];

    const [valid] = await conn.query(
      'SELECT subject_id AS "subjectId" FROM subjects WHERE subject_id = ANY(?::bigint[]) AND deleted_at IS NULL',
      [subjectIds],
    );
    if (valid.length !== subjectIds.length) {
      throw badRequest('MSG_SUBJECT_INVALID', 'Unknown subject.', { field: 'subjectIds' });
    }

    // business-rules §4: teaching assignments only for subjects the teacher can teach,
    // so a subject still used by a current (not ended) assignment cannot be removed.
    const [inUse] = await conn.query(
      `SELECT s.subject_name AS "subjectName", c.class_name AS "className"
       FROM teaching_assignments ta
       JOIN subjects s ON s.subject_id = ta.subject_id
       JOIN classes c  ON c.class_id = ta.class_id AND c.deleted_at IS NULL
       WHERE ta.teacher_id = ? AND ta.deleted_at IS NULL
         AND ta.end_date >= CURRENT_DATE
         AND NOT (ta.subject_id = ANY(?::bigint[]))
       ORDER BY s.subject_name, c.class_name`,
      [teacherId, subjectIds],
    );
    if (inUse.length) {
      const bySubject = {};
      for (const r of inUse) (bySubject[r.subjectName] ??= new Set()).add(r.className);
      throw new AppError(409, 'MSG_SUBJECT_IN_USE', 'Some removed subjects are still assigned to classes.', {
        subjects: Object.entries(bySubject).map(([name, classes]) => ({ name, classes: [...classes] })),
      });
    }

    await conn.query('UPDATE users SET full_name = ?, updated_at = NOW() WHERE user_id = ?', [fullName, userId]);
    await conn.query('UPDATE teachers SET department = ? WHERE teacher_id = ?', [department || null, teacherId]);
    // teacher_subjects is a configuration table: hard delete is allowed (business-rules §14).
    await conn.query('DELETE FROM teacher_subjects WHERE teacher_id = ? AND NOT (subject_id = ANY(?::bigint[]))', [
      teacherId,
      subjectIds,
    ]);
    await conn.query(
      `INSERT INTO teacher_subjects (teacher_id, subject_id)
       SELECT ?, s FROM unnest(?::bigint[]) AS s
       ON CONFLICT (teacher_id, subject_id) DO NOTHING`,
      [teacherId, subjectIds],
    );
    return { teacherId: Number(teacherId) };
  });
}
