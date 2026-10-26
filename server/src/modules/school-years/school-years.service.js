import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, notFound } from '../../utils/AppError.js';

// MOM-05: school_years has no status column – it is derived from today's date.
const STATUS_SQL = `CASE WHEN CURRENT_DATE < sy.start_date THEN 'UPCOMING'
                         WHEN CURRENT_DATE > sy.end_date THEN 'ENDED'
                         ELSE 'CURRENT' END`;

const conflict = (code, message) => new AppError(409, code, message);

function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound('NOT_FOUND', 'School year not found.');
  return id;
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Returns the normalised input or throws a 400. Order: required → name format → date format.
function validateInput({ yearName, startDate, endDate }) {
  const name = typeof yearName === 'string' ? yearName.trim().replace(/\s*[–—-]\s*/, '-') : '';
  if (!name || !startDate || !endDate) {
    throw badRequest('MSG_REQUIRED', 'Please enter the school year name, start date and end date.');
  }
  // ASSUMPTION: the name is "YYYY-YYYY" with consecutive years (seed: '2026-2027'), agreed 26/10.
  const match = /^(\d{4})-(\d{4})$/.exec(name);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw badRequest('MSG_SCHOOL_YEAR_NAME_FORMAT', 'The school year name must look like 2026-2027.');
  }
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw badRequest('MSG_INVALID_DATE', 'Please enter valid dates.');
  }
  return { name, firstYear: Number(match[1]), startDate, endDate };
}

// Date checks run in SQL (CLAUDE.md: compare times in SQL). excludeId = the year being updated.
async function assertDates(client, { name, firstYear, startDate, endDate }, excludeId = null) {
  // Checked on its own first: daterange() below raises an error when start > end.
  const { rows: order } = await client.query(
    `SELECT $1::date < $2::date AS "ordered",
            -- ASSUMPTION: the year starts in the first year of its name and ends in the second.
            EXTRACT(YEAR FROM $1::date)::int = $3::int AND EXTRACT(YEAR FROM $2::date)::int = $3::int + 1 AS "matchesName"`,
    [startDate, endDate, firstYear],
  );
  if (!order[0].ordered) throw badRequest('MSG_SCHOOL_YEAR_DATES', 'The start date must be before the end date.');
  if (!order[0].matchesName) {
    throw badRequest('MSG_SCHOOL_YEAR_DATES_NAME', 'The dates must fall in the years of the school year name.');
  }
  const { rows } = await client.query(
    `SELECT EXISTS (SELECT 1 FROM school_years
                    WHERE year_name = $3 AND ($4::bigint IS NULL OR school_year_id <> $4)) AS "nameTaken",
            EXISTS (SELECT 1 FROM school_years
                    WHERE daterange(start_date, end_date, '[]') && daterange($1::date, $2::date, '[]')
                      AND ($4::bigint IS NULL OR school_year_id <> $4)) AS "overlaps"`,
    [startDate, endDate, name, excludeId],
  );
  const check = rows[0];
  if (check.nameTaken) throw conflict('MSG_SCHOOL_YEAR_NAME_TAKEN', 'This school year already exists.');
  // ASSUMPTION: two school years never overlap, agreed 26/10 (the current year is found by date).
  if (check.overlaps) throw conflict('MSG_SCHOOL_YEAR_OVERLAP', 'The dates overlap another school year.');
}

// UC-20: every school year, newest first, for the list on SCR-18.
export async function listSchoolYears() {
  const { rows } = await pool.query(
    `SELECT sy.school_year_id AS "schoolYearId", sy.year_name AS "yearName",
            sy.start_date AS "startDate", sy.end_date AS "endDate", ${STATUS_SQL} AS "status",
            (SELECT COUNT(*) FROM semesters s WHERE s.school_year_id = sy.school_year_id) AS "semesterCount"
     FROM school_years sy
     ORDER BY sy.start_date DESC`,
  );
  return rows;
}

// UC-20: one school year with its semesters (read only here; UC-21 manages them) and its number of classes.
export async function getSchoolYear(idParam) {
  const id = parseId(idParam);
  const { rows } = await pool.query(
    `SELECT sy.school_year_id AS "schoolYearId", sy.year_name AS "yearName",
            sy.start_date AS "startDate", sy.end_date AS "endDate", ${STATUS_SQL} AS "status",
            (SELECT COUNT(*) FROM classes c
             WHERE c.school_year_id = sy.school_year_id AND c.deleted_at IS NULL) AS "classCount"
     FROM school_years sy
     WHERE sy.school_year_id = $1`,
    [id],
  );
  if (!rows.length) throw notFound('NOT_FOUND', 'School year not found.');
  const { rows: semesters } = await pool.query(
    `SELECT semester_id AS "semesterId", semester_no AS "semesterNo",
            start_date AS "startDate", end_date AS "endDate", status,
            CEIL((end_date - start_date + 1) / 7.0)::int AS "weekCount"
     FROM semesters
     WHERE school_year_id = $1
     ORDER BY semester_no`,
    [id],
  );
  return { ...rows[0], semesters };
}

// UC-20 Create a school year. Semesters are created separately (UC-21).
export async function createSchoolYear(input) {
  const data = validateInput(input);
  const id = await withTransaction(async (client) => {
    // School years are written rarely; the lock makes the overlap check and the insert atomic.
    await client.query('LOCK TABLE school_years IN SHARE ROW EXCLUSIVE MODE');
    await assertDates(client, data);
    const { rows } = await client.query(
      `INSERT INTO school_years (year_name, start_date, end_date) VALUES ($1, $2, $3)
       RETURNING school_year_id AS "schoolYearId"`,
      [data.name, data.startDate, data.endDate],
    );
    return rows[0].schoolYearId;
  });
  return getSchoolYear(id);
}

// UC-20 Update a school year's name and dates.
export async function updateSchoolYear(idParam, input) {
  const id = parseId(idParam);
  const data = validateInput(input);
  await withTransaction(async (client) => {
    await client.query('LOCK TABLE school_years IN SHARE ROW EXCLUSIVE MODE');
    const { rows } = await client.query(
      `SELECT CURRENT_DATE > end_date AS "ended" FROM school_years WHERE school_year_id = $1`,
      [id],
    );
    if (!rows.length) throw notFound('NOT_FOUND', 'School year not found.');
    // ASSUMPTION: an ended school year is read only, agreed 26/10.
    if (rows[0].ended) throw conflict('MSG_SCHOOL_YEAR_ENDED', 'An ended school year cannot be changed.');
    await assertDates(client, data, id);
    const { rows: outside } = await client.query(
      `SELECT 1 FROM semesters
       WHERE school_year_id = $1 AND (start_date < $2::date OR end_date > $3::date) LIMIT 1`,
      [id, data.startDate, data.endDate],
    );
    if (outside.length) {
      throw badRequest('MSG_SCHOOL_YEAR_SEMESTER_OUT_OF_RANGE', 'The semesters must stay inside the school year.');
    }
    await client.query(
      'UPDATE school_years SET year_name = $2, start_date = $3, end_date = $4 WHERE school_year_id = $1',
      [id, data.name, data.startDate, data.endDate],
    );
  });
  return getSchoolYear(id);
}
