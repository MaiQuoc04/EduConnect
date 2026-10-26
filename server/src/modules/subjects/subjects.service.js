import { pool } from '../../config/db.js';
import { notFound } from '../../utils/AppError.js';

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

