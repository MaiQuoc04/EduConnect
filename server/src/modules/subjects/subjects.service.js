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
