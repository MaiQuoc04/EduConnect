import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, notFound } from '../../utils/AppError.js';

const conflict = (code, message) => new AppError(409, code, message);

// The year the figures are computed for: the requested one, or the current year by date (MOM-05) – the latest
// year that has started, else the first upcoming one. Null when no school year exists yet.
async function resolveSchoolYear(schoolYearId) {
  if (schoolYearId !== undefined && schoolYearId !== '') {
    const id = Number(schoolYearId);
    const { rows } = Number.isSafeInteger(id) && id > 0
      ? await pool.query(
        `SELECT school_year_id AS "schoolYearId", year_name AS "yearName" FROM school_years WHERE school_year_id = $1`,
        [id],
      )
      : { rows: [] };
    if (!rows.length) throw notFound('NOT_FOUND', 'School year not found.');
    return rows[0];
  }
  const { rows } = await pool.query(
    `SELECT school_year_id AS "schoolYearId", year_name AS "yearName" FROM school_years
     ORDER BY start_date <= CURRENT_DATE DESC,
              CASE WHEN start_date <= CURRENT_DATE THEN start_date END DESC,
              start_date
     LIMIT 1`,
  );
  return rows[0] ?? null;
}

// UC-22 View Subject List: every subject with, for the chosen school year, the class types it is taught in
// (periods per week per type), how many classes have a teacher assigned for it, and how many active teachers can
// teach it. Ordered as the subjects were added (curriculum order). Search and filters are done by the client.
export async function listSubjects({ schoolYearId }) {
  const schoolYear = await resolveSchoolYear(schoolYearId);
  const { rows } = await pool.query(
    `SELECT s.subject_id AS "subjectId", s.subject_code AS "subjectCode", s.subject_name AS "subjectName",
            COALESCE(tr.tracks, '[]'::json) AS "tracks",
            tr.periods_min AS "periodsMin", tr.periods_max AS "periodsMax",
            (SELECT COUNT(DISTINCT ta.class_id)
             FROM teaching_assignments ta
             JOIN classes c ON c.class_id = ta.class_id AND c.deleted_at IS NULL AND c.school_year_id = $1
             WHERE ta.subject_id = s.subject_id AND ta.deleted_at IS NULL) AS "classCount",
            (SELECT COUNT(*)
             FROM teacher_subjects tsj
             JOIN teachers t ON t.teacher_id = tsj.teacher_id
             JOIN users u ON u.user_id = t.user_id AND u.status = 'ACTIVE'
             WHERE tsj.subject_id = s.subject_id) AS "teacherCount"
     FROM subjects s
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object('trackId', ct.track_id, 'trackName', ct.track_name,
                                         'periodsPerWeek', ts.periods_per_week) ORDER BY ct.track_name) AS tracks,
              MIN(ts.periods_per_week) AS periods_min, MAX(ts.periods_per_week) AS periods_max
       FROM track_subjects ts
       JOIN class_tracks ct ON ct.track_id = ts.track_id AND ct.deleted_at IS NULL
       WHERE ts.subject_id = s.subject_id AND ts.school_year_id = $1
     ) tr ON TRUE
     WHERE s.deleted_at IS NULL
     ORDER BY s.subject_id`,
    [schoolYear?.schoolYearId ?? null],
  );
  return { schoolYear, subjects: rows };
}

function parseSubjectId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound('NOT_FOUND', 'Subject not found.');
  return id;
}

// The subject row (404 when missing or deleted). db = the pool, or a transaction client.
// codeLocked = the subject is already used somewhere, so its code can no longer change (UC-25).
async function loadSubject(db, id) {
  const { rows } = await db.query(
    `SELECT s.subject_id AS "subjectId", s.subject_code AS "subjectCode", s.subject_name AS "subjectName",
            (EXISTS (SELECT 1 FROM track_subjects x WHERE x.subject_id = s.subject_id)
             OR EXISTS (SELECT 1 FROM teacher_subjects x WHERE x.subject_id = s.subject_id)
             OR EXISTS (SELECT 1 FROM teaching_assignments x WHERE x.subject_id = s.subject_id)
             OR EXISTS (SELECT 1 FROM timetable_slots x WHERE x.subject_id = s.subject_id)
             OR EXISTS (SELECT 1 FROM grade_components x WHERE x.subject_id = s.subject_id)
             OR EXISTS (SELECT 1 FROM grade_locks x WHERE x.subject_id = s.subject_id)
             OR EXISTS (SELECT 1 FROM class_events x WHERE x.subject_id = s.subject_id)) AS "codeLocked"
     FROM subjects s
     WHERE s.subject_id = $1 AND s.deleted_at IS NULL`,
    [id],
  );
  if (!rows.length) throw notFound('NOT_FOUND', 'Subject not found.');
  return rows[0];
}

// UC-23 View Subject Detail: the subject, the class types it is taught in (periods, weight) for the chosen year,
// every class of that year that studies it (by its class type) or has a teacher assigned for it, and the teachers
// who can teach it.
export async function getSubject(idParam, { schoolYearId } = {}) {
  const id = parseSubjectId(idParam);
  const subject = await loadSubject(pool, id);
  const schoolYear = await resolveSchoolYear(schoolYearId);
  const yearId = schoolYear?.schoolYearId ?? null;

  const { rows: tracks } = await pool.query(
    `SELECT ct.track_id AS "trackId", ct.track_name AS "trackName", ts.periods_per_week AS "periodsPerWeek",
            ts.weight
     FROM track_subjects ts
     JOIN class_tracks ct ON ct.track_id = ts.track_id AND ct.deleted_at IS NULL
     WHERE ts.subject_id = $1 AND ts.school_year_id = $2
     ORDER BY ct.track_name`,
    [id, yearId],
  );

  // A class may have had several teachers over time: the latest assignment that is not deleted is the current one.
  const { rows: classRows } = await pool.query(
    `SELECT c.class_id AS "classId", c.class_name AS "className", gl.grade_level_name AS "gradeLevel",
            ct.track_name AS "trackName", ts.periods_per_week AS "periodsPerWeek",
            (SELECT COUNT(*) FROM class_enrollments e
             WHERE e.class_id = c.class_id AND e.status = 'STUDYING') AS "studentCount",
            a.teacher_id AS "teacherId", u.full_name AS "teacherName", t.teacher_code AS "teacherCode",
            u.status AS "teacherStatus"
     FROM classes c
     JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
     JOIN class_tracks ct ON ct.track_id = c.track_id
     LEFT JOIN track_subjects ts
       ON ts.track_id = c.track_id AND ts.subject_id = $1 AND ts.school_year_id = c.school_year_id
     LEFT JOIN LATERAL (
       SELECT ta.teacher_id FROM teaching_assignments ta
       WHERE ta.class_id = c.class_id AND ta.subject_id = $1 AND ta.deleted_at IS NULL
       ORDER BY ta.start_date DESC, ta.assignment_id DESC
       LIMIT 1
     ) a ON TRUE
     LEFT JOIN teachers t ON t.teacher_id = a.teacher_id
     LEFT JOIN users u ON u.user_id = t.user_id
     WHERE c.school_year_id = $2 AND c.deleted_at IS NULL
       AND (ts.track_subject_id IS NOT NULL OR a.teacher_id IS NOT NULL)
     ORDER BY gl.grade_level_name, c.class_name`,
    [id, yearId],
  );
  const classes = classRows.map(({ teacherId, teacherName, teacherCode, teacherStatus, ...c }) => ({
    ...c,
    teacher: teacherId ? { teacherId, fullName: teacherName, teacherCode, status: teacherStatus } : null,
  }));

  const { rows: teachers } = await pool.query(
    `SELECT t.teacher_id AS "teacherId", u.full_name AS "fullName", t.teacher_code AS "teacherCode", u.status
     FROM teacher_subjects tsj
     JOIN teachers t ON t.teacher_id = tsj.teacher_id
     JOIN users u ON u.user_id = t.user_id
     WHERE tsj.subject_id = $1
     ORDER BY u.status, u.full_name`,
    [id],
  );

  const summary = {
    classCount: classes.length,
    assignedCount: classes.filter((c) => c.teacher?.status === 'ACTIVE').length,
    totalPeriodsPerWeek: classes.reduce((sum, c) => sum + (c.periodsPerWeek ?? 0), 0),
  };
  return { subject, schoolYear, tracks, classes, teachers, summary };
}

// UC-24 / UC-25 input: code = upper-case letters without accents, digits or "_", 2–20 characters (seed: TOAN, HDTN);
// name = 1–150 characters (subjects.subject_name VARCHAR(150)).
function validateInput({ subjectCode, subjectName }) {
  const code = typeof subjectCode === 'string' ? subjectCode.trim() : '';
  const name = typeof subjectName === 'string' ? subjectName.trim().replace(/\s+/g, ' ') : '';
  if (!code || !name) throw badRequest('MSG_REQUIRED', 'Please enter the subject code and name.');
  if (!/^[A-Z0-9_]{2,20}$/.test(code)) {
    throw badRequest('MSG_SUBJECT_CODE_FORMAT', 'The code has 2–20 upper-case letters without accents, digits or _.');
  }
  if (name.length > 150) throw badRequest('MSG_SUBJECT_NAME_LENGTH', 'The subject name has at most 150 characters.');
  return { code, name };
}

// Codes are unique over every row, deleted ones included (UNIQUE constraint); names only among live subjects
// (ASSUMPTION: no two subjects share a name, case-insensitive – agreed 27/10).
async function assertUnique(client, { code, name }, excludeId = null) {
  const { rows } = await client.query(
    `SELECT EXISTS (SELECT 1 FROM subjects WHERE subject_code = $1
                    AND ($3::bigint IS NULL OR subject_id <> $3)) AS "codeTaken",
            EXISTS (SELECT 1 FROM subjects WHERE lower(subject_name) = lower($2) AND deleted_at IS NULL
                    AND ($3::bigint IS NULL OR subject_id <> $3)) AS "nameTaken"`,
    [code, name, excludeId],
  );
  if (rows[0].codeTaken) throw conflict('MSG_SUBJECT_CODE_TAKEN', 'This subject code is already used.');
  if (rows[0].nameTaken) throw conflict('MSG_SUBJECT_NAME_TAKEN', 'A subject with this name already exists.');
}

// 23505 can still happen if two School Managers save the same code at the same moment.
function mapDuplicate(err) {
  if (err.code === '23505') return conflict('MSG_SUBJECT_CODE_TAKEN', 'This subject code is already used.');
  return err;
}

// UC-24 Create Subject. Its class types, periods and weights are set later (UC-26).
export async function createSubject(input) {
  const data = validateInput(input);
  const id = await withTransaction(async (client) => {
    await client.query('LOCK TABLE subjects IN SHARE ROW EXCLUSIVE MODE'); // subjects are written rarely
    await assertUnique(client, data);
    const { rows } = await client.query(
      'INSERT INTO subjects (subject_code, subject_name) VALUES ($1, $2) RETURNING subject_id AS "subjectId"',
      [data.code, data.name],
    );
    return rows[0].subjectId;
  }).catch((err) => {
    throw mapDuplicate(err);
  });
  return getSubject(id);
}

