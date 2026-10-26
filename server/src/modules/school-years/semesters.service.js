import { pool, withTransaction } from '../../config/db.js';
import { badRequest, notFound } from '../../utils/AppError.js';
import { conflict, getSchoolYear, isIsoDate, parseId } from './school-years.service.js';

// UC-21 Manage Semesters. A school year has exactly two semesters (1, 2). Closing a semester only ends the
// homeroom teacher's attendance corrections for its dates (business-rules §4, §12); it never locks grades.

function assertIsoDates(...dates) {
  if (dates.some((d) => !d)) throw badRequest('MSG_REQUIRED', 'Please enter the start and end date of each semester.');
  if (!dates.every(isIsoDate)) throw badRequest('MSG_INVALID_DATE', 'Please enter valid dates.');
}

// Locks the year row for the rest of the transaction and returns whether it has ended.
async function lockYear(client, yearId) {
  const { rows } = await client.query(
    'SELECT CURRENT_DATE > end_date AS "ended" FROM school_years WHERE school_year_id = $1 FOR UPDATE',
    [yearId],
  );
  if (!rows.length) throw notFound('NOT_FOUND', 'School year not found.');
  return rows[0].ended;
}

// s1 / s2 = { startDate, endDate }, or undefined when that semester does not exist. Date comparisons run in SQL.
async function assertSemesterDates(client, yearId, s1, s2) {
  const { rows } = await client.query(
    `SELECT ($1::date IS NULL OR $1::date < $2::date) AND ($3::date IS NULL OR $3::date < $4::date) AS "ordered",
            ($2::date IS NULL OR $3::date IS NULL OR $2::date < $3::date) AS "inOrder",
            COALESCE($1::date, $3::date) >= sy.start_date AND COALESCE($4::date, $2::date) <= sy.end_date AS "insideYear"
     FROM school_years sy WHERE sy.school_year_id = $5`,
    [s1?.startDate ?? null, s1?.endDate ?? null, s2?.startDate ?? null, s2?.endDate ?? null, yearId],
  );
  const check = rows[0];
  if (!check.ordered) throw badRequest('MSG_SEMESTER_DATES', 'A semester must start before it ends.');
  // A break between the semesters is allowed (seed: 16/01 → 18/01).
  if (!check.inOrder) throw badRequest('MSG_SEMESTER_ORDER', 'Semester 1 must end before semester 2 starts.');
  if (!check.insideYear) throw badRequest('MSG_SEMESTER_OUT_OF_YEAR', 'The semesters must be inside the school year.');
}

// UC-21 Create the two semesters of a school year in one go.
// Body: { semesters: [{ semesterNo: 1, startDate, endDate }, { semesterNo: 2, startDate, endDate }] }
export async function createSemesters(yearIdParam, input) {
  const yearId = parseId(yearIdParam);
  const list = Array.isArray(input) ? input : [];
  const s1 = list.find((s) => Number(s?.semesterNo) === 1);
  const s2 = list.find((s) => Number(s?.semesterNo) === 2);
  if (list.length !== 2 || !s1 || !s2) {
    throw badRequest('MSG_REQUIRED', 'Please enter the start and end date of each semester.');
  }
  assertIsoDates(s1.startDate, s1.endDate, s2.startDate, s2.endDate);

  await withTransaction(async (client) => {
    if (await lockYear(client, yearId)) {
      throw conflict('MSG_SCHOOL_YEAR_ENDED', 'An ended school year cannot be changed.');
    }
    const { rows: existing } = await client.query('SELECT 1 FROM semesters WHERE school_year_id = $1 LIMIT 1', [yearId]);
    if (existing.length) throw conflict('MSG_SEMESTERS_EXIST', 'This school year already has its semesters.');
    await assertSemesterDates(client, yearId, s1, s2);
    await client.query(
      `INSERT INTO semesters (school_year_id, semester_no, start_date, end_date)
       VALUES ($1, 1, $2, $3), ($1, 2, $4, $5)`,
      [yearId, s1.startDate, s1.endDate, s2.startDate, s2.endDate],
    );
  });
  return getSchoolYear(yearId);
}

// UC-21 Update the dates of an open semester of a school year that has not ended.
export async function updateSemester(yearIdParam, semesterIdParam, { startDate, endDate } = {}) {
  const yearId = parseId(yearIdParam);
  const semesterId = parseId(semesterIdParam, 'Semester not found.');
  assertIsoDates(startDate, endDate);

  await withTransaction(async (client) => {
    const yearEnded = await lockYear(client, yearId);
    const { rows: semesters } = await client.query(
      `SELECT semester_id AS "semesterId", semester_no AS "semesterNo", start_date AS "startDate",
              end_date AS "endDate", status
       FROM semesters WHERE school_year_id = $1 ORDER BY semester_no FOR UPDATE`,
      [yearId],
    );
    const target = semesters.find((s) => s.semesterId === semesterId);
    if (!target) throw notFound('NOT_FOUND', 'Semester not found.');
    if (yearEnded) throw conflict('MSG_SCHOOL_YEAR_ENDED', 'An ended school year cannot be changed.');
    if (target.status === 'CLOSED') throw conflict('MSG_SEMESTER_CLOSED', 'A closed semester cannot be changed.');

    const updated = { ...target, startDate, endDate };
    const s1 = target.semesterNo === 1 ? updated : semesters.find((s) => s.semesterNo === 1);
    const s2 = target.semesterNo === 2 ? updated : semesters.find((s) => s.semesterNo === 2);
    await assertSemesterDates(client, yearId, s1, s2);
    await client.query('UPDATE semesters SET start_date = $2, end_date = $3 WHERE semester_id = $1', [
      semesterId,
      startDate,
      endDate,
    ]);
  });
  return getSchoolYear(yearId);
}

// Explains why a conditional status UPDATE changed nothing.
async function explainStatusMiss(yearId, semesterId) {
  const { rows } = await pool.query(
    `SELECT status, CURRENT_DATE > end_date AS "ended" FROM semesters WHERE semester_id = $1 AND school_year_id = $2`,
    [semesterId, yearId],
  );
  if (!rows.length) throw notFound('NOT_FOUND', 'Semester not found.');
  return rows[0];
}

// UC-21 Close a semester once its last day has passed. One conditional UPDATE, so two clicks cannot both succeed.
export async function closeSemester(yearIdParam, semesterIdParam) {
  const yearId = parseId(yearIdParam);
  const semesterId = parseId(semesterIdParam, 'Semester not found.');
  const { rowCount } = await pool.query(
    `UPDATE semesters SET status = 'CLOSED'
     WHERE semester_id = $1 AND school_year_id = $2 AND status = 'OPEN' AND CURRENT_DATE > end_date`,
    [semesterId, yearId],
  );
  if (!rowCount) {
    const current = await explainStatusMiss(yearId, semesterId);
    if (current.status === 'CLOSED') throw conflict('MSG_SEMESTER_CLOSED', 'This semester is already closed.');
    throw badRequest('MSG_SEMESTER_NOT_ENDED', 'A semester can be closed only after its last day.');
  }
  return getSchoolYear(yearId);
}

// ASSUMPTION: the School Manager may reopen a closed semester (e.g. closed by mistake); not in business-rules –
// requested by Khanh 27/10, to confirm with the team lead. Reopening gives the homeroom teacher back the
// excused ↔ unexcused correction for that semester's dates.
export async function reopenSemester(yearIdParam, semesterIdParam) {
  const yearId = parseId(yearIdParam);
  const semesterId = parseId(semesterIdParam, 'Semester not found.');
  const { rowCount } = await pool.query(
    `UPDATE semesters SET status = 'OPEN' WHERE semester_id = $1 AND school_year_id = $2 AND status = 'CLOSED'`,
    [semesterId, yearId],
  );
  if (!rowCount) {
    await explainStatusMiss(yearId, semesterId);
    throw conflict('MSG_SEMESTER_NOT_CLOSED', 'This semester is already open.');
  }
  return getSchoolYear(yearId);
}
