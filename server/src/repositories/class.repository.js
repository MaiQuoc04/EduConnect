import { pool } from '../config/db.js';
import { ENROLLMENT_STATUS } from '../constants/teacher.constants.js';

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
