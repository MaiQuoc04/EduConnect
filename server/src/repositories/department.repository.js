import { pool } from '../config/db.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { AppError } from '../utils/AppError.js';

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
