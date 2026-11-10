// FE-10 timetable (Dung, It2) – UC-70..UC-75. Business rules §10 and §4 (teaching assignments with dates).
//
// A class timetable is a weekly pattern (timetable_entries: weekday + period -> subject, room) inside a version
// (timetables: class, start_date, end_date). Saving a version generates one timetable_slots row per period per day
// in its range; the teacher of each row is the one whose teaching assignment covers that date (no substitute
// teaching). Saving from date X never touches days before X, and rows that already have attendance are kept.
import { pool } from '../../config/db.js';
import { AppError, notFound } from '../../utils/AppError.js';
import { ERROR_CODES } from './timetable.constants.js';

// The tables of patch_v0.3_timetables.sql are missing on this database.
function notReady(err) {
  if (err?.code === '42P01') return new AppError(503, ERROR_CODES.TIMETABLES_NOT_READY, 'Timetable tables are not created yet.');
  return err;
}
async function guard(fn) {
  try {
    return await fn();
  } catch (err) {
    throw notReady(err);
  }
}

// ── Shared reads ─────────────────────────────────────────────────────────────

async function today(db = pool) {
  const { rows } = await db.query(`SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS "d"`);
  return rows[0].d;
}

const YEAR_COLUMNS = `sy.school_year_id AS "id", sy.year_name AS "name",
  to_char(sy.start_date, 'YYYY-MM-DD') AS "startDate", to_char(sy.end_date, 'YYYY-MM-DD') AS "endDate"`;

async function schoolYears(db = pool) {
  const { rows } = await db.query(`SELECT ${YEAR_COLUMNS} FROM school_years sy ORDER BY sy.start_date DESC`);
  return rows;
}

// The year running today, else the next one, else the latest.
function currentYear(years, day) {
  return (
    years.find((y) => y.startDate <= day && y.endDate >= day) ??
    [...years].reverse().find((y) => y.startDate > day) ??
    years[0] ??
    null
  );
}

// ── UC-70 View Timetable Management (School Manager) ────────────────────────

export function listClasses({ schoolYearId }) {
  return guard(async () => {
    const [years, day] = await Promise.all([schoolYears(), today()]);
    const year = schoolYearId ? years.find((y) => String(y.id) === String(schoolYearId)) : currentYear(years, day);
    if (schoolYearId && !year) throw notFound(ERROR_CODES.SCHOOL_YEAR_NOT_FOUND, 'School year not found.');
    if (!year) return { schoolYears: years, schoolYear: null, today: day, classes: [] };

    // Version shown per class: the one running today, else the next one, else the last one.
    const { rows } = await pool.query(
      `SELECT c.class_id AS "classId", c.class_name AS "className", gl.grade_level_name AS "gradeName",
              ct.track_name AS "trackName", hu.full_name AS "homeroomTeacher",
              (SELECT COALESCE(SUM(ts.periods_per_week), 0)::int FROM track_subjects ts
                 WHERE ts.track_id = c.track_id AND ts.school_year_id = c.school_year_id) AS "plannedPeriods",
              (SELECT COUNT(*)::int FROM timetables t WHERE t.class_id = c.class_id AND t.deleted_at IS NULL) AS "versions",
              v.timetable_id AS "timetableId", to_char(v.start_date, 'YYYY-MM-DD') AS "startDate",
              to_char(v.end_date, 'YYYY-MM-DD') AS "endDate",
              to_char(v.created_at, 'YYYY-MM-DD HH24:MI') AS "updatedAt", vu.full_name AS "updatedBy",
              (SELECT COUNT(*)::int FROM timetable_entries e WHERE e.timetable_id = v.timetable_id) AS "periodsPerWeek"
       FROM classes c
       JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
       JOIN class_tracks ct ON ct.track_id = c.track_id
       LEFT JOIN teachers ht ON ht.teacher_id = c.homeroom_teacher_id
       LEFT JOIN users hu ON hu.user_id = ht.user_id
       LEFT JOIN LATERAL (
         SELECT t.* FROM timetables t
         WHERE t.class_id = c.class_id AND t.deleted_at IS NULL
         ORDER BY (CURRENT_DATE BETWEEN t.start_date AND t.end_date) DESC, (t.start_date > CURRENT_DATE) DESC,
                  CASE WHEN t.start_date > CURRENT_DATE THEN t.start_date END, t.start_date DESC
         LIMIT 1
       ) v ON TRUE
       LEFT JOIN users vu ON vu.user_id = v.created_by
       WHERE c.school_year_id = $1 AND c.deleted_at IS NULL
       ORDER BY gl.grade_level_name, c.class_name`,
      [year.id],
    );
    const classes = rows.map(({ timetableId, startDate, endDate, periodsPerWeek, updatedAt, updatedBy, ...c }) => ({
      ...c,
      timetable: timetableId
        ? { timetableId, startDate, endDate, periodsPerWeek, updatedAt, updatedBy, running: startDate <= day && endDate >= day }
        : null,
    }));
    return { schoolYears: years, schoolYear: year, today: day, classes };
  });
}
