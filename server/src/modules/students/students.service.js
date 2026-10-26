import { pool } from '../../config/db.js';
import { badRequest } from '../../utils/AppError.js';
import { vietnameseNameOrder } from '../../utils/nameSort.js';

// FE-02 Student Management (owner: Anh). SQL lives here; the controller validates the query first.
// resolveSchoolYearId, enrollmentsOfYear and buildStudentFilter are shared by UC-07..UC-14.
//
// Schema v0.3: users, students, class_enrollments, school_years and grade_levels have no deleted_at; classes and
// class_tracks do. Accounts are never deleted, only LOCKED (business-rules §3).

// --- Accent-insensitive search -------------------------------------------------------------------------------
// The unaccent extension (database/2026-10-26_enable_unaccent.sql) may or may not be installed on the shared DB
// or a developer's local DB. It is looked up once (started when this module loads, i.e. at server start) and
// cached; restart the server after installing it. Without it, search falls back to plain ILIKE (accents must
// match). A failed lookup (DB unreachable) is not cached, so the next request tries again.
let unaccentLookup;

function getUnaccentFn() {
  unaccentLookup ??= pool
    .query(
      `SELECT n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
       WHERE e.extname = 'unaccent'`,
    )
    .then(({ rows }) => {
      const schema = rows[0]?.schema;
      if (!schema) {
        console.warn('[students] unaccent extension not installed: name search needs exact accents. '
          + 'See database/2026-10-26_enable_unaccent.sql');
        return null;
      }
      return `"${schema.replace(/"/g, '""')}".unaccent`;
    })
    .catch((err) => {
      unaccentLookup = undefined;
      throw err;
    });
  return unaccentLookup;
}

getUnaccentFn().catch((err) => console.warn('[students] unaccent check failed, retrying on first search:', err.message));

// --- School year -----------------------------------------------------------------------------------------------

// Returns the school_year_id to work in, or null when no school year exists yet (callers return an empty result).
// - schoolYearId given: it must exist.
// - classId given without schoolYearId: the class's own school year (classes are per school year, §4).
// - otherwise the current year. school_years has no is_current column (decision MOM-05), so it is found by date:
//   1. the year with CURRENT_DATE BETWEEN start_date AND end_date;
//   2. none (e.g. summer break between two years): the latest year that has already started;
//   3. every year is in the future: the earliest one.
//   ASSUMPTION: steps 2 and 3 are not in business-rules.md yet (waiting for the team lead to add them).
export async function resolveSchoolYearId({ schoolYearId, classId } = {}, db = pool) {
  if (schoolYearId) {
    const { rows } = await db.query('SELECT school_year_id FROM school_years WHERE school_year_id = $1', [schoolYearId]);
    if (!rows[0]) throw badRequest('MSG_SCHOOL_YEAR_NOT_FOUND', 'The school year does not exist.');
    return rows[0].school_year_id;
  }
  if (classId) {
    const { rows } = await db.query(
      'SELECT school_year_id FROM classes WHERE class_id = $1 AND deleted_at IS NULL',
      [classId],
    );
    if (!rows[0]) throw badRequest('MSG_CLASS_NOT_FOUND', 'The class does not exist.');
    return rows[0].school_year_id;
  }
  const { rows } = await db.query(
    `SELECT school_year_id FROM school_years
     ORDER BY (CURRENT_DATE BETWEEN start_date AND end_date) DESC,      -- 1. current year
              (start_date <= CURRENT_DATE) DESC,                        -- 2. else a year that has started…
              CASE WHEN start_date <= CURRENT_DATE THEN start_date END DESC, -- …the latest of them
              start_date ASC                                            -- 3. else the earliest future year
     LIMIT 1`,
  );
  return rows[0]?.school_year_id ?? null;
}

// --- Enrollments and filters -----------------------------------------------------------------------------------

/**
 * SQL subquery (aliased `e`) of the enrollments in school year $1 that a student list shows.
 * The caller's params must already hold the school_year_id at $1; a status value is pushed onto params.
 *
 * - No status: one row per student = their current enrollment of the year (the STUDYING one, otherwise the
 *   latest). A student who transferred 10A1 -> 10A2 is listed once, under 10A2.
 * - status = TRANSFERRED / DROPPED / STUDYING: every enrollment of the year with that status. A student who
 *   transferred twice appears once per class they left, so School Manager sees which class each move came from;
 *   with classId as well this gives the students who left that very class. (A student has at most one STUDYING
 *   enrollment per year, business-rules §4, so STUDYING still gives one row per student.)
 *
 * Columns: e.enrollment_id, e.student_id, e.class_id, e.status.
 */
export function enrollmentsOfYear(params, { status } = {}) {
  if (status) {
    params.push(status);
    return `(SELECT ce.enrollment_id, ce.student_id, ce.class_id, ce.status
     FROM class_enrollments ce
     JOIN classes yc ON yc.class_id = ce.class_id
     WHERE yc.school_year_id = $1 AND yc.deleted_at IS NULL AND ce.status = $${params.length}) e`;
  }
  return `(SELECT DISTINCT ON (ce.student_id) ce.enrollment_id, ce.student_id, ce.class_id, ce.status
     FROM class_enrollments ce
     JOIN classes yc ON yc.class_id = ce.class_id
     WHERE yc.school_year_id = $1 AND yc.deleted_at IS NULL
     ORDER BY ce.student_id, (ce.status = 'STUDYING') DESC, ce.enrolled_at DESC, ce.enrollment_id DESC) e`;
}

/**
 * Builds the WHERE conditions of the student filters. Pushes the values onto params (placeholders continue from
 * params.length) and returns the conditions joined with AND, or 'TRUE' when there are none.
 *
 * Alias contract – the surrounding query MUST name its tables:
 *   s = students, u = users (always needed: q, accountStatus), c = classes (needed only when classId is given).
 * The enrollment status filter is not here: it has to be applied inside enrollmentsOfYear (see there).
 *
 * @param {{ q?: string, classId?: number, accountStatus?: string, unaccentFn?: string|null }} filters
 *   unaccentFn: qualified name of unaccent() (from getUnaccentFn) for accent-insensitive name search, or null.
 * @param {unknown[]} params
 */
export function buildStudentFilter({ q, classId, accountStatus, unaccentFn } = {}, params) {
  const conditions = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (q) {
    // % and _ typed by the user are literal characters, not wildcards.
    const pattern = add(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    const name = unaccentFn
      ? `${unaccentFn}(u.full_name) ILIKE ${unaccentFn}(${pattern}::text)`
      : `u.full_name ILIKE ${pattern}`;
    // student_code has no accents: plain ILIKE.
    conditions.push(`(${name} OR s.student_code ILIKE ${pattern})`);
  }
  if (classId) conditions.push(`c.class_id = ${add(classId)}`);
  if (accountStatus) conditions.push(`u.status = ${add(accountStatus)}`);
  return conditions.length ? conditions.join(' AND ') : 'TRUE';
}

// --- UC-07 -----------------------------------------------------------------------------------------------------

const STUDENT_COLUMNS = `s.student_id AS "studentId", u.user_id AS "userId", s.student_code AS "studentCode",
            u.full_name AS "fullName", u.username AS "username", u.avatar_url AS "avatarUrl", s.dob, s.gender,
            u.email, u.phone`;
const PARENT_COUNT = `(SELECT COUNT(*) FROM student_parents sp WHERE sp.student_id = s.student_id) AS "parentCount"`;

// UC-07 View Student List (School Manager): search by name / student code, filter by class, enrollment status
// and account status, within one school year. An empty list is a normal result (the UI shows MSG01).
// email / phone are returned because only School Manager calls this (business-rules §6, permissions note 2);
// hide them if another role is ever allowed here.
export async function listStudents({ q, classId, schoolYearId, status, accountStatus, unassigned, page, pageSize }) {
  const yearId = await resolveSchoolYearId({ schoolYearId, classId });
  if (!yearId) return { items: [], page, pageSize, total: 0 };

  if (classId) {
    const { rows } = await pool.query(
      'SELECT 1 FROM classes WHERE class_id = $1 AND school_year_id = $2 AND deleted_at IS NULL',
      [classId, yearId],
    );
    if (!rows[0]) throw badRequest('MSG_CLASS_NOT_FOUND', 'The class does not exist in this school year.');
  }

  const unaccentFn = q ? await getUnaccentFn() : null;
  const params = [yearId];
  let from;
  let columns;
  let orderBy;
  if (unassigned) {
    // Students with an account but no enrollment in the year. business-rules §3: SA creates accounts first and
    // SM imports classes afterwards (UC-27 needs the accounts to exist), so there is always a period when
    // students have an account but no class; SM uses this list to see who has not been imported yet.
    from = `students s
     JOIN users u ON u.user_id = s.user_id
     WHERE NOT EXISTS (SELECT 1 FROM class_enrollments ce JOIN classes yc ON yc.class_id = ce.class_id
                       WHERE ce.student_id = s.student_id AND yc.school_year_id = $1 AND yc.deleted_at IS NULL)`;
    columns = `${STUDENT_COLUMNS},
            NULL::bigint AS "classId", NULL::text AS "className", NULL::text AS "gradeLevelName",
            NULL::text AS "trackName", NULL::text AS "enrollmentStatus", u.status AS "accountStatus", ${PARENT_COUNT}`;
    orderBy = `${vietnameseNameOrder('u.full_name')}, s.student_id`;
  } else {
    // class_tracks.deleted_at is not filtered: a class keeps showing the type it was created with.
    from = `${enrollmentsOfYear(params, { status })}
     JOIN students s ON s.student_id = e.student_id
     JOIN users u ON u.user_id = s.user_id
     JOIN classes c ON c.class_id = e.class_id
     JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
     JOIN class_tracks t ON t.track_id = c.track_id
     WHERE TRUE`;
    columns = `${STUDENT_COLUMNS},
            c.class_id AS "classId", c.class_name AS "className", gl.grade_level_name AS "gradeLevelName",
            t.track_name AS "trackName", e.status AS "enrollmentStatus", u.status AS "accountStatus", ${PARENT_COUNT}`;
    orderBy = `c.class_name, ${vietnameseNameOrder('u.full_name')}, s.student_id, e.enrollment_id`;
  }
  const where = buildStudentFilter({ q, classId, accountStatus, unaccentFn }, params);

  // Run one after the other: the Supabase Free pooler allows DB_POOL_MAX=3 per developer (README §6).
  const { rows: countRows } = await pool.query(`SELECT COUNT(*) AS total FROM ${from} AND ${where}`, params);
  const { rows: items } = await pool.query(
    `SELECT ${columns}
     FROM ${from} AND ${where}
     ORDER BY ${orderBy}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return { items, page, pageSize, total: countRows[0].total };
}
