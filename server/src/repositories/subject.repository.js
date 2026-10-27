import { pool } from '../config/db.js';

export async function findActiveSubjects(db = pool) {
  const [rows] = await db.query(
    `SELECT subject_id AS "subjectId", subject_code AS "code", subject_name AS "name"
     FROM subjects WHERE deleted_at IS NULL ORDER BY subject_name`,
  );
  return rows;
}

// How many of the given ids are existing, not deleted subjects.
export async function countActiveSubjectsByIds(subjectIds, db = pool) {
  const [rows] = await db.query(
    'SELECT subject_id AS "subjectId" FROM subjects WHERE subject_id = ANY(?::bigint[]) AND deleted_at IS NULL',
    [subjectIds],
  );
  return rows.length;
}
