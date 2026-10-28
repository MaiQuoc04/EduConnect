import { pool } from '../config/db.js';

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
