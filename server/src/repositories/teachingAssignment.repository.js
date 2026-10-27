import { pool } from '../config/db.js';

// Assignments of the year that run on `date` (start_date <= date <= end_date).
export async function findActiveOnDate(schoolYearId, date, db = pool) {
  const [rows] = await db.query(
    `SELECT ta.assignment_id AS "assignmentId", ta.class_id AS "classId", ta.subject_id AS "subjectId",
            ta.teacher_id AS "teacherId",
            to_char(ta.start_date, 'YYYY-MM-DD') AS "startDate", to_char(ta.end_date, 'YYYY-MM-DD') AS "endDate"
     FROM teaching_assignments ta
     JOIN classes c ON c.class_id = ta.class_id AND c.deleted_at IS NULL
     WHERE c.school_year_id = ? AND ta.deleted_at IS NULL
       AND ?::date BETWEEN ta.start_date AND ta.end_date
     ORDER BY ta.start_date`,
    [schoolYearId, date],
  );
  return rows;
}

// Rows planned to start on/after `date` are replaced → soft delete (business-rules §14).
export async function softDeleteStartingFrom(classId, subjectId, date, db) {
  await db.query(
    `UPDATE teaching_assignments SET deleted_at = NOW()
     WHERE class_id = ? AND subject_id = ? AND deleted_at IS NULL AND start_date >= ?::date`,
    [classId, subjectId, date],
  );
}

// The row running on `date` ends the day before.
export async function endRunningBefore(classId, subjectId, date, db) {
  await db.query(
    `UPDATE teaching_assignments SET end_date = ?::date - 1
     WHERE class_id = ? AND subject_id = ? AND deleted_at IS NULL
       AND start_date < ?::date AND end_date >= ?::date`,
    [date, classId, subjectId, date, date],
  );
}

export async function insertAssignment({ classId, subjectId, teacherId, startDate, endDate }, db) {
  await db.query(
    `INSERT INTO teaching_assignments (class_id, subject_id, teacher_id, start_date, end_date)
     VALUES (?, ?, ?, ?::date, ?::date)`,
    [classId, subjectId, teacherId, startDate, endDate],
  );
}
