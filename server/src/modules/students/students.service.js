import { pool, withTransaction } from '../../config/db.js';
import { badRequest, notFound } from '../../utils/AppError.js';
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

// --- UC-08 -----------------------------------------------------------------------------------------------------

// UC-08 View Student Detail (School Manager): profile, class history and linked parents. Read only: editing is
// UC-09, transfer / promotion UC-10 / UC-11, parent links UC-12..UC-14, and reset password / lock / unlock belong to
// FE-13 (business-rules §2) – this only returns the account state the screen needs to show those buttons.
// Queries run one after the other (DB_POOL_MAX=3, README §6). Viewing is not logged (business-rules §13).
// The "student" object of UC-08, also returned by UC-09 so the client uses one shape. Throws 404 when missing.
// address lives on users (moved from parents by the team lead). Shown read only: UC-09 does not edit it yet – who
// updates a student's address (SM in UC-09 or SA) is not decided.
async function findStudent(studentId, db = pool) {
  // lockedUntil is the automatic temporary sign-in lock (business-rules §3), not the manual LOCKED status.
  // ASSUMPTION: a lock that has already expired is returned as null, so the UI never shows a past lock.
  const { rows: studentRows } = await db.query(
    `SELECT s.student_id AS "studentId", u.user_id AS "userId", s.student_code AS "studentCode",
            u.full_name AS "fullName", u.username AS "username", u.avatar_url AS "avatarUrl", s.dob, s.gender,
            u.email, u.phone, u.address, u.status AS "accountStatus", u.must_change_password AS "mustChangePassword",
            CASE WHEN u.locked_until > NOW() THEN u.locked_until END AS "lockedUntil", u.created_at AS "createdAt"
     FROM students s
     JOIN users u ON u.user_id = s.user_id
     WHERE s.student_id = $1`,
    [studentId],
  );
  const student = studentRows[0];
  if (!student) throw notFound('MSG_STUDENT_NOT_FOUND', 'The student does not exist.');
  return student;
}

export async function getStudentDetail(studentId) {
  const student = await findStudent(studentId);

  // Current enrollment: same school year and same choice (STUDYING first, else the latest) as the UC-07 list.
  // null when the student has no class this year yet (business-rules §3) or no school year exists.
  let currentEnrollment = null;
  const yearId = await resolveSchoolYearId();
  if (yearId) {
    const params = [yearId];
    const enrollments = enrollmentsOfYear(params);
    params.push(studentId);
    // ASSUMPTION: homeroom teacher name is FE-03 data (Dung); read with a minimal join, null when the class has
    // none (business-rules §4).
    const { rows } = await pool.query(
      `SELECT ce.enrollment_id AS "enrollmentId", c.class_id AS "classId", c.class_name AS "className",
              gl.grade_level_name AS "gradeLevelName", t.track_name AS "trackName", ce.nickname,
              ce.status, ce.enrolled_at AS "enrolledAt", ce.left_at AS "leftAt",
              sy.school_year_id AS "schoolYearId", sy.year_name AS "schoolYearName",
              hu.full_name AS "homeroomTeacherName"
       FROM ${enrollments}
       JOIN class_enrollments ce ON ce.enrollment_id = e.enrollment_id
       JOIN classes c ON c.class_id = e.class_id
       JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
       JOIN class_tracks t ON t.track_id = c.track_id
       JOIN school_years sy ON sy.school_year_id = c.school_year_id
       LEFT JOIN teachers ht ON ht.teacher_id = c.homeroom_teacher_id
       LEFT JOIN users hu ON hu.user_id = ht.user_id
       WHERE e.student_id = $${params.length}`,
      params,
    );
    currentEnrollment = rows[0] ?? null;
  }

  // Class history: every enrollment of every year, newest first. A transfer leaves a TRANSFERRED row next to the
  // new one and a promotion adds a row in the next year (business-rules §4), so a year can have several rows.
  // The nickname is left out: it only means something inside its class (§4) and is shown in currentEnrollment.
  // As in UC-07, class_tracks.deleted_at is not filtered; soft-deleted classes are left out (business-rules §14).
  const { rows: enrollmentHistory } = await pool.query(
    `SELECT ce.enrollment_id AS "enrollmentId", sy.year_name AS "schoolYearName", c.class_name AS "className",
            gl.grade_level_name AS "gradeLevelName", t.track_name AS "trackName", ce.status,
            ce.enrolled_at AS "enrolledAt", ce.left_at AS "leftAt"
     FROM class_enrollments ce
     JOIN classes c ON c.class_id = ce.class_id
     JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
     JOIN class_tracks t ON t.track_id = c.track_id
     JOIN school_years sy ON sy.school_year_id = c.school_year_id
     WHERE ce.student_id = $1 AND c.deleted_at IS NULL
     ORDER BY sy.start_date DESC, ce.enrolled_at DESC, ce.enrollment_id DESC`,
    [studentId],
  );

  const parents = await findStudentParents(studentId);

  return { student, currentEnrollment, enrollmentHistory, parents };
}

// --- UC-12 -----------------------------------------------------------------------------------------------------

export const MAX_PARENTS_PER_STUDENT = 2; // business-rules §3

// Parents linked to a student, oldest link first; empty when none is linked yet. Shared by UC-08, UC-12 and UC-13.
// Locked parent accounts stay in the list (accounts are never deleted, only LOCKED, business-rules §3).
// ASSUMPTION: otherChildrenCount (the parent's other linked children, this student excluded) is not required by
// the documents; it lets School Manager see on SCR-12 that a parent has several children (business-rules §3).
// address lives on users (moved from parents by the team lead on Supabase); the response field keeps its name.
export async function findStudentParents(studentId, db = pool) {
  const { rows } = await db.query(
    `SELECT p.parent_id AS "parentId", pu.user_id AS "userId", pu.full_name AS "fullName",
            pu.avatar_url AS "avatarUrl", pu.phone, pu.email, sp.relationship_type AS "relationshipType",
            p.occupation, pu.address, pu.status AS "accountStatus", sp.linked_at AS "linkedAt",
            (SELECT COUNT(*) FROM student_parents osp
             WHERE osp.parent_id = sp.parent_id AND osp.student_id <> sp.student_id) AS "otherChildrenCount"
     FROM student_parents sp
     JOIN parents p ON p.parent_id = sp.parent_id
     JOIN users pu ON pu.user_id = p.user_id
     WHERE sp.student_id = $1
     ORDER BY sp.linked_at, p.parent_id`,
    [studentId],
  );
  return rows;
}

// UC-12 View Student's Parents (School Manager), SCR-12. Read only: link / unlink is UC-13. A lighter read than
// UC-08: only the header of the student and their parents. Not logged (business-rules §13).
// className is the class of the current enrollment, chosen as in UC-07 / UC-08; null when the student has no
// class this year or no school year exists (then $1 is NULL and the LEFT JOIN finds nothing).
export async function getStudentParents(studentId, db = pool) {
  const params = [await resolveSchoolYearId({}, db)];
  const enrollments = enrollmentsOfYear(params);
  params.push(studentId);
  const { rows } = await db.query(
    `SELECT s.student_id AS "studentId", s.student_code AS "studentCode", u.full_name AS "fullName",
            u.avatar_url AS "avatarUrl", c.class_name AS "className"
     FROM students s
     JOIN users u ON u.user_id = s.user_id
     LEFT JOIN ${enrollments} ON e.student_id = s.student_id
     LEFT JOIN classes c ON c.class_id = e.class_id
     WHERE s.student_id = $${params.length}`,
    params,
  );
  const student = rows[0];
  if (!student) throw notFound('MSG_STUDENT_NOT_FOUND', 'The student does not exist.');

  const parents = await findStudentParents(studentId, db);
  return { student, parents, canLinkMore: parents.length < MAX_PARENTS_PER_STUDENT };
}

// --- UC-13 -----------------------------------------------------------------------------------------------------

export const RELATIONSHIP_TYPES = ['FATHER', 'MOTHER', 'GUARDIAN']; // student_parents.relationship_type has no CHECK

// TEMPORARY until FE-14 has UC-105 View Parent List (see lookupParent in the controller): remove with it.
// One parent account by its exact phone (users.phone is UNIQUE; `phone` is already normalised). Only an account
// that really has the PARENT role (as linkParent checks) is returned: a teacher's or student's phone gives null,
// so the lookup never reveals that another kind of account exists. LOCKED accounts are returned (they can still be
// linked, see linkParent). linkedStudentCount = all students linked to this parent, so School Manager notices a
// parent with several children (business-rules §3); there is no limit on children per parent.
// address lives on users (moved from parents by the team lead on Supabase). Read only, not logged.
export async function findParentByPhone(phone) {
  const { rows } = await pool.query(
    `SELECT p.parent_id AS "parentId", u.user_id AS "userId", u.full_name AS "fullName",
            u.avatar_url AS "avatarUrl", u.phone, u.email, p.occupation, u.address, u.status AS "accountStatus",
            (SELECT COUNT(*) FROM student_parents sp WHERE sp.parent_id = p.parent_id) AS "linkedStudentCount"
     FROM users u
     JOIN parents p ON p.user_id = u.user_id
     WHERE u.phone = $1
       AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
                   WHERE ur.user_id = u.user_id AND r.role_code = 'PARENT')`,
    [phone],
  );
  return rows[0] ?? null;
}

// Classes whose groups a parent link concerns: every class the student is STUDYING in whose school year has not
// ended yet. Usually one class; two after a promotion (UC-11 keeps last year's enrollment STUDYING) until the old
// year ends. ASSUMPTION: a year that has ended is left out because its groups are read only (business-rules §4),
// and a later year the student was already promoted into is included, so a parent linked in the summer still
// reaches the new class. Soft-deleted classes are ignored as everywhere in FE-02.
async function activeClassesOfStudent(client, studentId) {
  const { rows } = await client.query(
    `SELECT c.class_id, c.class_name
     FROM class_enrollments ce
     JOIN classes c ON c.class_id = ce.class_id
     JOIN school_years sy ON sy.school_year_id = c.school_year_id
     WHERE ce.student_id = $1 AND ce.status = 'STUDYING' AND c.deleted_at IS NULL AND sy.end_date >= CURRENT_DATE
     ORDER BY sy.start_date, c.class_id`,
    [studentId],
  );
  return rows;
}

// Same "no class" warning for link and unlink: the link itself is saved, only the groups are not touched.
// ASSUMPTION: new warning code WARN_STUDENT_HAS_NO_CLASS (waiting for the team lead to add it to messages.js).
const NO_CLASS_WARNING = {
  code: 'WARN_STUDENT_HAS_NO_CLASS',
  message: 'The student is not studying in any class; no class group was changed.',
  details: {},
};

// Locks the student row (404 when missing). Every UC-13 call and UC-10 / UC-11 lock it first, so links of the same
// student, and a link racing a transfer, run one after the other.
async function lockStudent(client, studentId) {
  const { rows } = await client.query('SELECT student_id FROM students WHERE student_id = $1 FOR UPDATE', [studentId]);
  if (!rows[0]) throw notFound('MSG_STUDENT_NOT_FOUND', 'The student does not exist.');
}

// UC-13 Link Parent–Student (School Manager), SCR-13. Adds one student_parents row and puts the parent into the
// GENERAL and PARENT groups of the student's class(es) (business-rules §4), in one transaction. No account is
// created or changed (UC-13 postcondition). Returns the UC-12 shape plus warnings.
// Not logged: parent links are not in the activity_logs list (business-rules §13).
// ASSUMPTION: a LOCKED parent account can be linked; the documents do not forbid it (locked accounts keep their
// data, business-rules §3). Two parents with the same relationshipType are allowed (not forbidden either).
export async function linkParent(studentId, parentId, relationshipType) {
  return withTransaction(async (client) => {
    await lockStudent(client, studentId);

    const { rows: parentRows } = await client.query(
      `SELECT p.user_id,
              EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
                      WHERE ur.user_id = p.user_id AND r.role_code = 'PARENT') AS "hasParentRole"
       FROM parents p WHERE p.parent_id = $1`,
      [parentId],
    );
    const parent = parentRows[0];
    if (!parent) throw badRequest('MSG_PARENT_NOT_FOUND', 'The parent does not exist.');
    if (!parent.hasParentRole) throw badRequest('MSG_USER_NOT_PARENT', 'This account is not a parent account.');

    // The student row lock above already serialises links of one student; FOR UPDATE on the links themselves also
    // stops an unlink of the same rows from interleaving. Checked here so the INSERT never raises 23505.
    const { rows: links } = await client.query(
      'SELECT parent_id FROM student_parents WHERE student_id = $1 FOR UPDATE',
      [studentId],
    );
    if (links.some((link) => link.parent_id === parentId)) {
      throw badRequest('MSG_LINK_ALREADY_EXISTS', 'This parent is already linked to the student.');
    }
    if (links.length >= MAX_PARENTS_PER_STUDENT) {
      throw badRequest('MSG_MAX_PARENTS_REACHED', `A student can have at most ${MAX_PARENTS_PER_STUDENT} parents.`,
        { max: MAX_PARENTS_PER_STUDENT });
    }

    await client.query(
      `INSERT INTO student_parents (student_id, parent_id, relationship_type, linked_at)
       VALUES ($1, $2, $3, NOW())`,
      [studentId, parentId, relationshipType],
    );

    // joinClassGroups skips a group the parent is already an active member of (another child in the same class).
    const classes = await activeClassesOfStudent(client, studentId);
    const warnings = classes.length ? [] : [NO_CLASS_WARNING];
    for (const { class_id: classId, class_name: className } of classes) {
      const { warnings: classWarnings } = await joinClassGroups(client, classId, new Map([[parent.user_id, 'PARENT']]));
      for (const warning of classWarnings) warnings.push({ ...warning, details: { ...warning.details, classId, className } });
    }

    return { ...(await getStudentParents(studentId, client)), warnings };
  });
}

// UC-13 Unlink Parent–Student (School Manager). HARD delete of the student_parents row (business-rules §14 lists
// it as an exception to soft delete), and the parent leaves the GENERAL and PARENT groups of the student's class(es)
// (left_at, row kept, §6) unless another of their children still studies in that class. One transaction.
// The parent account is not touched (UC-13 postcondition). Not logged (business-rules §13).
export async function unlinkParent(studentId, parentId) {
  return withTransaction(async (client) => {
    await lockStudent(client, studentId);

    const { rows: deleted } = await client.query(
      `DELETE FROM student_parents sp USING parents p
       WHERE p.parent_id = sp.parent_id AND sp.student_id = $1 AND sp.parent_id = $2
       RETURNING p.user_id`,
      [studentId, parentId],
    );
    if (!deleted[0]) throw badRequest('MSG_LINK_NOT_FOUND', 'This link does not exist.');

    // Groups are checked after the DELETE, so the sibling test only sees the parent's remaining children.
    const classes = await activeClassesOfStudent(client, studentId);
    const warnings = classes.length ? [] : [NO_CLASS_WARNING];
    for (const { class_id: classId, class_name: className } of classes) {
      await leaveParentClassGroups(client, { classId, parentUserIds: [deleted[0].user_id], exceptStudentId: studentId });
      for (const warning of await classGroupWarnings(client, classId, ['PARENT'])) {
        warnings.push({ ...warning, details: { ...warning.details, classId, className } });
      }
    }

    return { ...(await getStudentParents(studentId, client)), warnings };
  });
}

// --- UC-09 -----------------------------------------------------------------------------------------------------

// Whitelist of the columns UC-09 may write, by table. The UPDATE is built only from these entries (never from the
// body's keys); the controller has already rejected every other field. Login identifiers, password, account
// status / lock fields and student_code are deliberately absent (business-rules §3, UC-99).
const EDITABLE_COLUMNS = {
  users: { key: 'user_id', columns: { fullName: { column: 'full_name', type: 'varchar' } } },
  students: {
    key: 'student_id',
    columns: { dob: { column: 'dob', type: 'date' }, gender: { column: 'gender', type: 'varchar' } },
  },
};

// UPDATE for one table with only the fields present in changes, or null when none of them is. The row is written
// only if a value really differs (IS DISTINCT FROM), so an unchanged save does not fire users' set_updated_at.
function buildUpdate(table, keyValue, changes) {
  const { key, columns } = EDITABLE_COLUMNS[table];
  const params = [keyValue];
  const sets = [];
  const differs = [];
  for (const [field, { column, type }] of Object.entries(columns)) {
    if (!Object.hasOwn(changes, field)) continue;
    params.push(changes[field]);
    sets.push(`${column} = $${params.length}::${type}`);
    differs.push(`${column} IS DISTINCT FROM $${params.length}::${type}`);
  }
  if (!sets.length) return null;
  return {
    sql: `UPDATE ${table} SET ${sets.join(', ')} WHERE ${key} = $1 AND (${differs.join(' OR ')})`,
    params,
  };
}

// ASSUMPTION: the documents set no age limits. A high-school student (grades 10-12) is normally 15-18; the range
// is kept wide for early / late starters and repeated years: at least 10 and at most 30 years old today. This
// also rules out a date in the future. Compared in SQL so "today" is the Vietnam date (CLAUDE.md).
const MIN_STUDENT_AGE_YEARS = 10;
const MAX_STUDENT_AGE_YEARS = 30;

// UC-09 Update Student (School Manager): full name (users), date of birth and gender (students). Returns the same
// "student" object as UC-08. Not logged: profile edits are not in the activity_logs list (business-rules §13).
// Decided 2026-10-27: LOCKED accounts and students who left school can still be edited; student_code is never
// changed here (it is the matching key of the class import, UC-27).
export async function updateStudent(studentId, changes) {
  if (changes.dob) {
    const { rows } = await pool.query(
      `SELECT $1::date BETWEEN CURRENT_DATE - make_interval(years => $3::int)
                           AND CURRENT_DATE - make_interval(years => $2::int) AS ok`,
      [changes.dob, MIN_STUDENT_AGE_YEARS, MAX_STUDENT_AGE_YEARS],
    );
    if (!rows[0].ok) {
      throw badRequest('MSG_INVALID_PARAM', 'The date of birth is not plausible for a student.', { field: 'dob' });
    }
  }

  // users and students are written together or not at all.
  return withTransaction(async (client) => {
    // FOR UPDATE: two School Managers saving the same student at once are applied one after the other.
    const { rows } = await client.query('SELECT user_id FROM students WHERE student_id = $1 FOR UPDATE', [studentId]);
    if (!rows[0]) throw notFound('MSG_STUDENT_NOT_FOUND', 'The student does not exist.');

    for (const update of [buildUpdate('users', rows[0].user_id, changes), buildUpdate('students', studentId, changes)]) {
      if (update) await client.query(update.sql, update.params);
    }
    return findStudent(studentId, client);
  });
}

// --- UC-10 -----------------------------------------------------------------------------------------------------

// Class groups a member is added to in the new class, by member type (business-rules §4: GENERAL feed + chat,
// STUDENT chat, PARENT chat). The groups themselves belong to FE-04 (UC-27 creates them on class import); UC-10 and
// UC-11 only read groups and write group_members, and never create a group.
const JOIN_GROUP_TYPES = { STUDENT: ['GENERAL', 'STUDENT'], PARENT: ['GENERAL', 'PARENT'] };

// UC-10 Transfer Student (School Manager): move a student to another class of the SAME school year and the SAME
// grade level (business-rules §4; grade level: team decision 2026-10-27). The old enrollment is never moved to the new class nor deleted: grades and attendances
// point at its enrollment_id, so it becomes TRANSFERRED (left_at = NOW()) and a new STUDYING enrollment is added.
// Everything runs in one transaction: enrollments and group memberships change together or not at all.
// Not logged: transfers are not in the activity_logs list (business-rules §13).
//
// Known limit kept on purpose (team decision): class_enrollments has UNIQUE (student_id, class_id), so a student
// can never go back to a class they already left (11D1 -> 11A1 -> 11D1). It is checked before the INSERT and
// answered with MSG_CLASS_ALREADY_ENROLLED.
export async function transferStudent(studentId, toClassId) {
  return withTransaction(async (client) => {
    // Lock the student first: two School Managers transferring the same student run one after the other, and the
    // second one then finds the new enrollment instead of creating another one.
    const { rows: studentRows } = await client.query(
      'SELECT user_id FROM students WHERE student_id = $1 FOR UPDATE',
      [studentId],
    );
    if (!studentRows[0]) throw notFound('MSG_STUDENT_NOT_FOUND', 'The student does not exist.');
    const studentUserId = studentRows[0].user_id;

    // ASSUMPTION: the year being worked on is the current school year, found as in UC-07 / UC-08
    // (resolveSchoolYearId); the body has no schoolYearId, a transfer happens inside the running year.
    const yearId = await resolveSchoolYearId({}, client);
    const { rows: fromRows } = yearId
      ? await client.query(
        `SELECT ce.enrollment_id, ce.class_id, c.class_name, c.school_year_id, c.grade_level_id, gl.grade_level_name
         FROM class_enrollments ce
         JOIN classes c ON c.class_id = ce.class_id
         JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
         WHERE ce.student_id = $1 AND ce.status = 'STUDYING' AND c.school_year_id = $2 AND c.deleted_at IS NULL
         ORDER BY ce.enrolled_at DESC, ce.enrollment_id DESC
         FOR UPDATE OF ce`,
        [studentId, yearId],
      )
      : { rows: [] };
    const from = fromRows[0];
    if (!from) {
      throw badRequest('MSG_NO_ACTIVE_ENROLLMENT', 'The student is not studying in any class this school year.');
    }

    // FOR SHARE: the target class cannot be soft-deleted while the transfer runs.
    const { rows: toRows } = await client.query(
      `SELECT c.class_id, c.class_name, c.school_year_id, c.grade_level_id, gl.grade_level_name
       FROM classes c
       JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
       WHERE c.class_id = $1 AND c.deleted_at IS NULL
       FOR SHARE OF c`,
      [toClassId],
    );
    const to = toRows[0];
    if (!to) throw badRequest('MSG_CLASS_NOT_FOUND', 'The class does not exist.');
    if (to.class_id === from.class_id) {
      throw badRequest('MSG_TRANSFER_SAME_CLASS', 'The student is already studying in this class.');
    }
    if (to.school_year_id !== from.school_year_id) {
      throw badRequest('MSG_TRANSFER_DIFFERENT_YEAR',
        'The class belongs to another school year. Use student promotion (UC-11) to move to a new school year.');
    }
    // Team decision 2026-10-27 (not in business-rules.md yet): a transfer stays within the same grade level;
    // moving up a grade is UC-11. Checked after the school year so a class of another year gets the promotion hint.
    if (to.grade_level_id !== from.grade_level_id) {
      throw badRequest('MSG_TRANSFER_DIFFERENT_GRADE_LEVEL',
        'The class is in another grade level. A transfer stays within the same grade level.',
        { currentGradeLevel: from.grade_level_name, targetGradeLevel: to.grade_level_name });
    }
    const { rows: pastRows } = await client.query(
      'SELECT 1 FROM class_enrollments WHERE student_id = $1 AND class_id = $2',
      [studentId, to.class_id],
    );
    if (pastRows[0]) {
      throw badRequest('MSG_CLASS_ALREADY_ENROLLED',
        'The student has already studied in this class and cannot be transferred back to it.');
    }

    // 1. Close the old enrollment (kept, with its grades and attendances). 2. Open the new one.
    const { rows: [fromEnrollment] } = await client.query(
      `UPDATE class_enrollments SET status = 'TRANSFERRED', left_at = NOW()
       WHERE enrollment_id = $1
       RETURNING enrollment_id AS "enrollmentId", class_id AS "classId", status, left_at AS "leftAt"`,
      [from.enrollment_id],
    );
    const [{ studentId: _studentId, ...toEnrollment }] = await insertEnrollments(client, [{ studentId, classId: to.class_id }]);

    // BR-05: exactly one STUDYING enrollment in the year. Cannot fail after the checks above unless the data was
    // already broken (two STUDYING rows); then everything is rolled back instead of being saved half right.
    const { rows: [{ studying }] } = await client.query(
      `SELECT COUNT(*) AS studying FROM class_enrollments ce JOIN classes c ON c.class_id = ce.class_id
       WHERE ce.student_id = $1 AND ce.status = 'STUDYING' AND c.school_year_id = $2 AND c.deleted_at IS NULL`,
      [studentId, from.school_year_id],
    );
    if (studying !== 1) throw new Error(`UC-10: student ${studentId} would have ${studying} STUDYING enrollments`);

    const { leftGroups, joinedGroups, warnings } = await moveClassGroups(client, {
      studentId, studentUserId, fromClassId: from.class_id, toClassId: to.class_id,
    });

    return {
      student: await findStudent(studentId, client),
      fromEnrollment: { ...fromEnrollment, className: from.class_name },
      toEnrollment: { ...toEnrollment, className: to.class_name },
      groupChanges: { leftGroups, joinedGroups },
      warnings,
    };
  });
}

const GROUP_MEMBER_COLUMNS = `g.group_id AS "groupId", g.group_type AS "groupType", g.group_name AS "groupName",
            gm.user_id AS "userId"`;

// Group memberships of a transfer, inside the transfer's transaction (business-rules §6: transferring sets
// group_members.left_at and keeps the row; schema: re-joining = new row, one active row per user).
// Groups that do not exist are not created (FE-04); a warning is returned instead.
async function moveClassGroups(client, { studentId, studentUserId, fromClassId, toClassId }) {
  // ASSUMPTION: business-rules §6 only names the student. Their linked parents (student_parents) follow them:
  // they leave the old class's GENERAL and PARENT groups and join the new class's GENERAL and PARENT groups.
  const { rows: parentRows } = await client.query(
    `SELECT p.user_id FROM student_parents sp JOIN parents p ON p.parent_id = sp.parent_id
     WHERE sp.student_id = $1 ORDER BY p.user_id`,
    [studentId],
  );
  const parentUserIds = parentRows.map((row) => row.user_id);

  // Old class, student: leaves every group of the class.
  // ASSUMPTION: this includes TEAM_CHAT groups of the class (teams have "members from one class", §4).
  const { rows: studentLeft } = await client.query(
    `UPDATE group_members gm SET left_at = NOW()
     FROM groups g
     WHERE g.group_id = gm.group_id AND g.class_id = $1 AND g.deleted_at IS NULL
       AND gm.user_id = $2 AND gm.left_at IS NULL
     RETURNING ${GROUP_MEMBER_COLUMNS}`,
    [fromClassId, studentUserId],
  );
  // Old class, parents: leave GENERAL and PARENT, unless another of their children still studies in that class.
  const parentsLeft = await leaveParentClassGroups(client, {
    classId: fromClassId, parentUserIds, exceptStudentId: studentId,
  });

  const memberTypeByUser = new Map([[studentUserId, 'STUDENT']]);
  for (const parentUserId of parentUserIds) memberTypeByUser.set(parentUserId, 'PARENT');
  const { joinedGroups, warnings } = await joinClassGroups(client, toClassId, memberTypeByUser);

  const withMemberType = (row) => ({ ...row, memberType: memberTypeByUser.get(row.userId) });
  return {
    leftGroups: [...studentLeft, ...parentsLeft].map(withMemberType),
    joinedGroups,
    warnings,
  };
}

// Parents leave the GENERAL and PARENT groups of one class (left_at, row kept, business-rules §6), unless another of
// their children (not exceptStudentId) still studies in that class. Shared by UC-10 (the child moves out) and UC-13
// (the link is removed). Returns the rows closed.
// ASSUMPTION: the sibling exception is not in the documents; without it the parent would be cut off from the
// other child's class.
// A parent who also teaches the class (Teacher + Parent, business-rules §1) stays in its GENERAL group: they are
// its homeroom teacher (classes.homeroom_teacher_id) or have a teaching assignment for it. They still leave the
// PARENT group, which is for parents only. Teachers, classes and teaching_assignments are only read here.
// ASSUMPTION: an assignment counts while it is not soft-deleted and has not ended (end_date >= CURRENT_DATE); one
// that starts later still counts (the teacher is about to teach the class), one that has ended does not.
async function leaveParentClassGroups(client, { classId, parentUserIds, exceptStudentId }) {
  if (!parentUserIds.length) return [];
  const { rows } = await client.query(
    `UPDATE group_members gm SET left_at = NOW()
     FROM groups g
     WHERE g.group_id = gm.group_id AND g.class_id = $1 AND g.deleted_at IS NULL
       AND g.group_type IN ('GENERAL', 'PARENT')
       AND gm.user_id = ANY($2::bigint[]) AND gm.left_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM parents p
                       JOIN student_parents sp ON sp.parent_id = p.parent_id
                       JOIN class_enrollments ce ON ce.student_id = sp.student_id
                       WHERE p.user_id = gm.user_id AND sp.student_id <> $3
                         AND ce.class_id = $1 AND ce.status = 'STUDYING')
       AND NOT (g.group_type = 'GENERAL'
                AND EXISTS (SELECT 1 FROM teachers t
                            WHERE t.user_id = gm.user_id
                              AND (EXISTS (SELECT 1 FROM classes c
                                           WHERE c.class_id = $1 AND c.homeroom_teacher_id = t.teacher_id)
                                   OR EXISTS (SELECT 1 FROM teaching_assignments ta
                                              WHERE ta.class_id = $1 AND ta.teacher_id = t.teacher_id
                                                AND ta.deleted_at IS NULL AND ta.end_date >= CURRENT_DATE))))
     RETURNING ${GROUP_MEMBER_COLUMNS}`,
    [classId, parentUserIds, exceptStudentId],
  );
  return rows;
}

// Adds members to the class groups of one class (shared by UC-10, UC-11 and UC-13), inside the caller's transaction.
// memberTypeByUser: Map userId -> 'STUDENT' | 'PARENT' (one entry per user, so a parent of two children moving to
// the same class is added once). Only the groups that really exist are used (UC-27 may not have run, or the class
// was created by hand); a (user, group) pair that already has an active row is skipped. Never creates a group
// (FE-04) and never touches other classes' groups. Returns the rows added (with memberType) and the warnings.
async function joinClassGroups(client, classId, memberTypeByUser) {
  // (user, group type) pairs to join.
  const userIds = [];
  const groupTypes = [];
  for (const [userId, memberType] of memberTypeByUser) {
    for (const type of JOIN_GROUP_TYPES[memberType]) {
      userIds.push(userId);
      groupTypes.push(type);
    }
  }
  const { rows: joined } = await client.query(
    `WITH added AS (
       INSERT INTO group_members (group_id, user_id, joined_at)
       SELECT g.group_id, w.user_id, NOW()
       FROM unnest($2::bigint[], $3::text[]) AS w(user_id, group_type)
       JOIN groups g ON g.group_type = w.group_type AND g.class_id = $1 AND g.deleted_at IS NULL
       WHERE NOT EXISTS (SELECT 1 FROM group_members x
                         WHERE x.group_id = g.group_id AND x.user_id = w.user_id AND x.left_at IS NULL)
       RETURNING group_id, user_id
     )
     SELECT g.group_id AS "groupId", g.group_type AS "groupType", g.group_name AS "groupName", a.user_id AS "userId"
     FROM added a JOIN groups g ON g.group_id = a.group_id
     ORDER BY a.user_id, g.group_id`,
    [classId, userIds, groupTypes],
  );

  return {
    joinedGroups: joined.map((row) => ({ ...row, memberType: memberTypeByUser.get(row.userId) })),
    warnings: await classGroupWarnings(client, classId, new Set(memberTypeByUser.values())),
  };
}

// Warnings for the class groups that members of these types need but that do not exist (FE-04 creates them).
// Warnings are { code, message, details } like errors; the client maps the code to Vietnamese.
async function classGroupWarnings(client, classId, memberTypes) {
  const { rows: typeRows } = await client.query(
    `SELECT DISTINCT group_type FROM groups
     WHERE class_id = $1 AND deleted_at IS NULL AND group_type IN ('GENERAL', 'STUDENT', 'PARENT')`,
    [classId],
  );
  const existingTypes = typeRows.map((row) => row.group_type);
  const neededTypes = ['GENERAL', 'STUDENT', 'PARENT']
    .filter((type) => [...memberTypes].some((memberType) => JOIN_GROUP_TYPES[memberType].includes(type)));
  const missingGroupTypes = neededTypes.filter((type) => !existingTypes.includes(type));
  if (!existingTypes.length) {
    return [{
      code: 'WARN_CLASS_HAS_NO_GROUPS',
      message: 'The class has no class groups yet; nobody was added to or removed from a group.',
      details: { missingGroupTypes },
    }];
  }
  if (missingGroupTypes.length) {
    return [{
      code: 'WARN_CLASS_GROUPS_MISSING',
      message: 'Some class groups of the class do not exist yet; nobody was added to or removed from them.',
      details: { missingGroupTypes },
    }];
  }
  return [];
}

// New STUDYING enrollments, one INSERT for every row (shared by UC-10 and UC-11). rows: [{ studentId, classId }].
// A future column (e.g. the proposed enrollment_type) is one more field in rows, one more unnest array and one more
// column here. Returns the new rows in no particular order.
async function insertEnrollments(client, rows) {
  const { rows: inserted } = await client.query(
    `INSERT INTO class_enrollments (student_id, class_id, status, enrolled_at)
     SELECT w.student_id, w.class_id, 'STUDYING', NOW()
     FROM unnest($1::bigint[], $2::bigint[]) AS w(student_id, class_id)
     RETURNING enrollment_id AS "enrollmentId", student_id AS "studentId", class_id AS "classId", status,
               enrolled_at AS "enrolledAt"`,
    [rows.map((row) => row.studentId), rows.map((row) => row.classId)],
  );
  return inserted;
}

// --- UC-11 -----------------------------------------------------------------------------------------------------

// TEMPORARY READ-ONLY ENDPOINT (GET /students/promote/options). FE-04 (Khanh) has no GET /school-years and no
// GET /classes yet, so the SCR-11 screen (UC-11 promotion, and the UC-10 class picker) reads the school years and
// the classes of one year from here, to fill its selects instead of making School Manager type ids.
// It only reads; creating / editing years and classes stays in FE-04 (UC-20, UC-27, UC-28).
// TODO FE-04: delete this function, its route and controller once FE-04's endpoints exist, and switch the client
// (getPromoteOptions in client/src/api/students.js) to them.
//
// - schoolYears: every school year, oldest first by start_date (not by id: a later year can be created first).
//   isCurrent = CURRENT_DATE BETWEEN start_date AND end_date (school_years has no is_current column, MOM-05).
// - classes: only with toSchoolYearId – the year's classes that are not soft-deleted, with their current size
//   (STUDYING enrollments), by grade level then class name. MSG_SCHOOL_YEAR_NOT_FOUND when the year does not exist.
//   ASSUMPTION: "10A2" before "10A10" (shorter name first), a natural order without a sort column in the schema.
// Not logged (reading, business-rules §13).
export async function getPromoteOptions({ toSchoolYearId }) {
  const { rows: schoolYears } = await pool.query(
    `SELECT school_year_id AS "schoolYearId", year_name AS "yearName", start_date AS "startDate",
            end_date AS "endDate", CURRENT_DATE BETWEEN start_date AND end_date AS "isCurrent"
     FROM school_years
     ORDER BY start_date, school_year_id`,
  );
  if (!toSchoolYearId) return { schoolYears, classes: [] };

  const yearId = await resolveSchoolYearId({ schoolYearId: toSchoolYearId });
  // class_tracks.deleted_at is not filtered: a class keeps showing the type it was created with (as in UC-07).
  const { rows: classes } = await pool.query(
    `SELECT c.class_id AS "classId", c.class_name AS "className", gl.grade_level_name AS "gradeLevelName",
            t.track_name AS "trackName",
            (SELECT COUNT(*) FROM class_enrollments ce
             WHERE ce.class_id = c.class_id AND ce.status = 'STUDYING') AS "studentCount"
     FROM classes c
     JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
     JOIN class_tracks t ON t.track_id = c.track_id
     WHERE c.school_year_id = $1 AND c.deleted_at IS NULL
     ORDER BY gl.grade_level_name, length(c.class_name), c.class_name, c.class_id`,
    [yearId],
  );
  return { schoolYears, classes };
}

// ASSUMPTION: the documents set no batch size; at most 200 students per call so one request does not hold its row
// locks for long. A whole grade is promoted in a few calls (the screen sends one class at a time).
export const MAX_PROMOTE_STUDENTS = 200;

// UC-11 Promote Students (School Manager): enrol students of one school year into classes of a LATER school year.
// Unlike UC-10 (business-rules §4), the old enrollment is left exactly as it is (STUDYING, left_at NULL): it is the
// history of the old year. Only a new STUDYING enrollment is added; users and students are not changed. BR-05 (one
// STUDYING enrollment per school year) still holds because the two rows are in different years.
// The grade level is NOT checked: promotion changes it (10 -> 11) and a student repeating a year stays in it
// (10 -> 10 of the next year); School Manager picks the class.
//
// groups: [{ toClassId, studentIds }] (already validated by the controller: no student twice, at most
// MAX_PROMOTE_STUDENTS). A whole-request problem (school year / class) is a 400; a student who does not qualify
// is SKIPPED in the results and does not stop the others (UC-11 alternative flow). One transaction for the whole
// request: every promoted student is written, or none (a skipped student is a normal result, not a rollback).
//
// Class groups: students join GENERAL + STUDENT of the new class, their parents GENERAL + PARENT. The old class's
// memberships are NOT closed (no left_at): last year's groups become read only (business-rules §4), their members
// can still read them. ASSUMPTION: "read only" is derived from the school year having ended – the schema has no
// column for it and none is added here (to confirm with the team lead).
// Not logged: promotion is not in the activity_logs list (business-rules §13).
export async function promoteStudents({ fromSchoolYearId, toSchoolYearId, groups }) {
  return withTransaction(async (client) => {
    await resolveSchoolYearId({ schoolYearId: fromSchoolYearId }, client);
    await resolveSchoolYearId({ schoolYearId: toSchoolYearId }, client);
    const { rows: [{ inOrder }] } = await client.query(
      `SELECT t.start_date > f.start_date AS "inOrder"
       FROM school_years f, school_years t WHERE f.school_year_id = $1 AND t.school_year_id = $2`,
      [fromSchoolYearId, toSchoolYearId],
    );
    if (!inOrder) {
      throw badRequest('MSG_INVALID_YEAR_ORDER', 'The destination school year must start after the source school year.');
    }

    // Target classes: must exist, not be soft-deleted and belong to the destination year. FOR SHARE: none of them
    // can be soft-deleted while the promotion runs.
    const classIds = [...new Set(groups.map((group) => group.toClassId))];
    const { rows: classRows } = await client.query(
      `SELECT class_id, class_name FROM classes
       WHERE class_id = ANY($1::bigint[]) AND school_year_id = $2 AND deleted_at IS NULL
       FOR SHARE`,
      [classIds, toSchoolYearId],
    );
    const classNameById = new Map(classRows.map((row) => [row.class_id, row.class_name]));
    const missingClassIds = classIds.filter((id) => !classNameById.has(id));
    if (missingClassIds.length) {
      throw badRequest('MSG_CLASS_NOT_FOUND', 'The class does not exist in the destination school year.',
        { classIds: missingClassIds });
    }

    // Requested students in request order, each with its target class.
    const requested = groups.flatMap((group) => group.studentIds.map((studentId) => ({ studentId, toClassId: group.toClassId })));
    const studentIds = requested.map((item) => item.studentId);

    // Lock the students first, in student_id order (two School Managers promoting overlapping lists cannot
    // deadlock), as UC-10 does: a transfer of the same student waits, and the queries below then see its result.
    const { rows: studentRows } = await client.query(
      `SELECT s.student_id, s.user_id, s.student_code, u.full_name
       FROM students s JOIN users u ON u.user_id = s.user_id
       WHERE s.student_id = ANY($1::bigint[])
       ORDER BY s.student_id
       FOR UPDATE OF s`,
      [studentIds],
    );
    const studentById = new Map(studentRows.map((row) => [row.student_id, row]));

    // Source enrollment = the STUDYING one of the source year, locked in student_id order. A student with several
    // (broken data, BR-05) uses the latest, as UC-10 does.
    // ASSUMPTION (team decision 2026-10-27, not in business-rules.md yet): only STUDYING counts. A student whose
    // enrollment of the source year is DROPPED, or TRANSFERRED with no STUDYING row after it, is skipped; a
    // student who transferred inside the source year is promoted from the class they study in now.
    const { rows: sourceRows } = await client.query(
      `SELECT ce.student_id, ce.class_id, c.class_name
       FROM class_enrollments ce
       JOIN classes c ON c.class_id = ce.class_id
       WHERE ce.student_id = ANY($1::bigint[]) AND ce.status = 'STUDYING'
         AND c.school_year_id = $2 AND c.deleted_at IS NULL
       ORDER BY ce.student_id, ce.enrolled_at DESC, ce.enrollment_id DESC
       FOR UPDATE OF ce`,
      [studentIds, fromSchoolYearId],
    );
    const sourceByStudent = new Map();
    for (const row of sourceRows) if (!sourceByStudent.has(row.student_id)) sourceByStudent.set(row.student_id, row);

    // Enrollments the students already have in the destination year (any status: a student who already studied,
    // transferred or dropped there is not promoted again), and in the target classes themselves (UNIQUE
    // (student_id, class_id): checked here so the INSERT never raises 23505).
    // ASSUMPTION: enrollments in soft-deleted classes are ignored, as everywhere else in FE-02.
    const { rows: targetYearRows } = await client.query(
      `SELECT DISTINCT ce.student_id FROM class_enrollments ce JOIN classes c ON c.class_id = ce.class_id
       WHERE ce.student_id = ANY($1::bigint[]) AND c.school_year_id = $2 AND c.deleted_at IS NULL`,
      [studentIds, toSchoolYearId],
    );
    const enrolledInTargetYear = new Set(targetYearRows.map((row) => row.student_id));
    const { rows: sameClassRows } = await client.query(
      `SELECT ce.student_id, ce.class_id FROM class_enrollments ce
       JOIN unnest($1::bigint[], $2::bigint[]) AS w(student_id, class_id)
         ON w.student_id = ce.student_id AND w.class_id = ce.class_id`,
      [studentIds, requested.map((item) => item.toClassId)],
    );
    const sameClass = new Set(sameClassRows.map((row) => `${row.student_id}:${row.class_id}`));

    // Decide per student. SKIPPED is checked in this order, so each student gets the first reason that applies.
    const decisions = requested.map(({ studentId, toClassId }) => {
      const student = studentById.get(studentId);
      const base = { studentId, studentCode: student?.student_code ?? null, fullName: student?.full_name ?? null };
      const skip = (reason, message) => ({ ...base, status: 'SKIPPED', reason, message });
      if (!student) return skip('SKIP_STUDENT_NOT_FOUND', 'The student does not exist.');
      const source = sourceByStudent.get(studentId);
      if (!source) {
        return skip('SKIP_NO_ACTIVE_ENROLLMENT', 'The student is not studying in any class of the source school year.');
      }
      if (enrolledInTargetYear.has(studentId)) {
        return skip('SKIP_ALREADY_ENROLLED', 'The student already has an enrollment in the destination school year.');
      }
      // Cannot happen after the check above while the target class is in the destination year; kept as the guard
      // of UNIQUE (student_id, class_id).
      if (sameClass.has(`${studentId}:${toClassId}`)) {
        return skip('SKIP_CLASS_ENROLLMENT_EXISTS', 'The student has already been enrolled in this class.');
      }
      return { ...base, status: 'PROMOTED', toClassId, userId: student.user_id, fromClassName: source.class_name };
    });
    const toPromote = decisions.filter((decision) => decision.status === 'PROMOTED');

    const warnings = [];
    const enrollmentIdByStudent = new Map();
    if (toPromote.length) {
      const inserted = await insertEnrollments(client,
        toPromote.map(({ studentId, toClassId }) => ({ studentId, classId: toClassId })));
      for (const row of inserted) enrollmentIdByStudent.set(row.studentId, row.enrollmentId);

      // BR-05 in the destination year. Cannot fail after the checks above; if the data was already broken,
      // everything is rolled back instead of being saved half right.
      const { rows: brokenRows } = await client.query(
        `SELECT ce.student_id FROM class_enrollments ce JOIN classes c ON c.class_id = ce.class_id
         WHERE ce.student_id = ANY($1::bigint[]) AND ce.status = 'STUDYING'
           AND c.school_year_id = $2 AND c.deleted_at IS NULL
         GROUP BY ce.student_id HAVING COUNT(*) > 1`,
        [toPromote.map((decision) => decision.studentId), toSchoolYearId],
      );
      if (brokenRows.length) {
        throw new Error(`UC-11: students ${brokenRows.map((row) => row.student_id)} would have several STUDYING enrollments`);
      }

      // Class groups of each target class: the promoted students and their linked parents (same ASSUMPTION as
      // UC-10: parents follow their child). Old classes' memberships are left as they are (see above).
      const { rows: parentRows } = await client.query(
        `SELECT sp.student_id, p.user_id FROM student_parents sp JOIN parents p ON p.parent_id = sp.parent_id
         WHERE sp.student_id = ANY($1::bigint[]) ORDER BY p.user_id`,
        [toPromote.map((decision) => decision.studentId)],
      );
      for (const classId of classIds) {
        const promotedHere = toPromote.filter((decision) => decision.toClassId === classId);
        if (!promotedHere.length) continue;
        const memberTypeByUser = new Map(promotedHere.map((decision) => [decision.userId, 'STUDENT']));
        const promotedIds = new Set(promotedHere.map((decision) => decision.studentId));
        for (const row of parentRows) {
          if (promotedIds.has(row.student_id) && !memberTypeByUser.has(row.user_id)) {
            memberTypeByUser.set(row.user_id, 'PARENT');
          }
        }
        const { warnings: classWarnings } = await joinClassGroups(client, classId, memberTypeByUser);
        const className = classNameById.get(classId);
        for (const warning of classWarnings) {
          warnings.push({ ...warning, details: { ...warning.details, classId, className } });
        }
      }
    }

    const results = decisions.map(({ toClassId, userId, ...decision }) => (decision.status === 'PROMOTED'
      ? { ...decision, toClassName: classNameById.get(toClassId), enrollmentId: enrollmentIdByStudent.get(decision.studentId) }
      : decision));
    return {
      summary: { total: results.length, promoted: toPromote.length, skipped: results.length - toPromote.length },
      results,
      warnings,
    };
  });
}
