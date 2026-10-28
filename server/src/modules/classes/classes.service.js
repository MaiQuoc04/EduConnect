import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, notFound } from '../../utils/AppError.js';
import { addClassGroupMembers, ensureClassGroups } from './classGroups.js';

// FE-04 Class & Group Management – classes and their groups (owner: Khanh). Screen SCR-22 Group List
// ("Lớp & nhóm lớp"). UC-27 import lives in classImport.service.js and shares the helpers below.

export const conflict = (code, message, details) => new AppError(409, code, message, details);

export function parseId(value, message = 'Not found.') {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound('NOT_FOUND', message);
  return id;
}

// The requested year, or the current one by date (MOM-05). Null when no school year exists yet.
export async function resolveYear(schoolYearId) {
  const columns = `sy.school_year_id AS "schoolYearId", sy.year_name AS "yearName", CURRENT_DATE > sy.end_date AS "ended"`;
  if (schoolYearId !== undefined && schoolYearId !== '') {
    const id = parseId(schoolYearId, 'School year not found.');
    const { rows } = await pool.query(`SELECT ${columns} FROM school_years sy WHERE sy.school_year_id = $1`, [id]);
    if (!rows.length) throw notFound('NOT_FOUND', 'School year not found.');
    return rows[0];
  }
  const { rows } = await pool.query(
    `SELECT ${columns} FROM school_years sy
     ORDER BY sy.start_date <= CURRENT_DATE DESC,
              CASE WHEN sy.start_date <= CURRENT_DATE THEN sy.start_date END DESC,
              sy.start_date
     LIMIT 1`,
  );
  return rows[0] ?? null;
}

// Locks the school year for the rest of the transaction; classes cannot be added to an ended year.
export async function lockOpenYear(client, schoolYearId) {
  if (schoolYearId === undefined || schoolYearId === null || schoolYearId === '') {
    throw badRequest('MSG_REQUIRED', 'Please choose a school year.');
  }
  const id = parseId(schoolYearId, 'School year not found.');
  const { rows } = await client.query(
    `SELECT school_year_id AS "schoolYearId", year_name AS "yearName", CURRENT_DATE > end_date AS "ended"
     FROM school_years WHERE school_year_id = $1 FOR UPDATE`,
    [id],
  );
  if (!rows.length) throw notFound('NOT_FOUND', 'School year not found.');
  if (rows[0].ended) throw conflict('MSG_SCHOOL_YEAR_ENDED', 'An ended school year cannot be changed.');
  return rows[0];
}

// ASSUMPTION (agreed 27/10): a class name is the grade followed by 1–8 letters or digits, without spaces or
// accents ("10A1", "12CT"); typed names are upper-cased and spaces removed.
export const normalizeClassName = (text) => String(text ?? '').replace(/\s+/g, '').toUpperCase();
export function classNameProblem(name, gradeName) {
  if (!/^(10|11|12)[A-Z0-9]{1,8}$/.test(name)) return 'FORMAT';
  if (gradeName && !name.startsWith(gradeName)) return 'GRADE';
  return null;
}

// Students already studying in a class of this school year (one class per student per year): Map studentId ->
// { classId, className }.
export async function studyingInYear(db, schoolYearId, studentIds) {
  const { rows } = await db.query(
    `SELECT e.student_id AS "studentId", c.class_id AS "classId", c.class_name AS "className"
     FROM class_enrollments e
     JOIN classes c ON c.class_id = e.class_id AND c.deleted_at IS NULL
     WHERE c.school_year_id = $1 AND e.status = 'STUDYING' AND e.student_id = ANY($2::bigint[])`,
    [schoolYearId, studentIds],
  );
  return new Map(rows.map((r) => [r.studentId, r]));
}

// Enrolls students, creates the missing class groups and adds their members. Returns the number of new memberships.
export async function enrollAndSyncGroups(client, { classId, className, studentIds, createdBy }) {
  if (studentIds.length) {
    await client.query(
      `INSERT INTO class_enrollments (student_id, class_id)
       SELECT x, $2 FROM unnest($1::bigint[]) AS x`,
      [studentIds, classId],
    );
  }
  await ensureClassGroups(client, { classId, className, createdBy });
  const added = await addClassGroupMembers(client, classId);
  return added.length;
}

// One class of SCR-22 with its homeroom teacher, number of studying students and its groups.
const CLASS_SQL = `
  SELECT c.class_id AS "classId", c.class_name AS "className", gl.grade_level_name AS "gradeLevel",
         c.grade_level_id AS "gradeLevelId", ct.track_id AS "trackId", ct.track_name AS "trackName",
         u.full_name AS "homeroomName", u.status AS "homeroomStatus",
         (SELECT COUNT(*) FROM class_enrollments e
          WHERE e.class_id = c.class_id AND e.status = 'STUDYING') AS "studentCount",
         COALESCE((SELECT json_agg(json_build_object(
                     'groupId', g.group_id, 'groupType', g.group_type, 'groupName', g.group_name,
                     'memberCount', (SELECT COUNT(*) FROM group_members m
                                     WHERE m.group_id = g.group_id AND m.left_at IS NULL))
                   ORDER BY CASE g.group_type WHEN 'GENERAL' THEN 1 WHEN 'STUDENT' THEN 2 ELSE 3 END)
                   FROM groups g
                   WHERE g.class_id = c.class_id AND g.deleted_at IS NULL
                     AND g.group_type IN ('GENERAL', 'STUDENT', 'PARENT')), '[]'::json) AS "groups"
  FROM classes c
  JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
  JOIN class_tracks ct ON ct.track_id = c.track_id
  LEFT JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
  LEFT JOIN users u ON u.user_id = t.user_id`;

// SCR-22, School Manager view of UC-29 View Group List: the classes of a school year with their three groups.
// The School Manager sees member counts only, never feeds or chats (business-rules §2).
export async function listClasses({ schoolYearId }) {
  const schoolYear = await resolveYear(schoolYearId);
  const { rows } = await pool.query(
    `${CLASS_SQL}
     WHERE c.school_year_id = $1 AND c.deleted_at IS NULL
     ORDER BY gl.grade_level_name, c.class_name`,
    [schoolYear?.schoolYearId ?? null],
  );
  return { schoolYear, classes: rows };
}

async function getClass(classId) {
  const { rows } = await pool.query(`${CLASS_SQL} WHERE c.class_id = $1`, [classId]);
  return rows[0];
}

// Agreed 29/10 (Khanh, FE-04): a class has at most 45 studying students. Checked by UC-28 (create, add students)
// and UC-27 (import).
export const MAX_CLASS_SIZE = 45;
const classFull = (current) =>
  conflict('MSG_CLASS_FULL', `A class has at most ${MAX_CLASS_SIZE} students.`, { max: MAX_CLASS_SIZE, current });

const PICK_PAGE = 30;
const MAX_PASTED_CODES = 200;

// One student as the UC-28 pickers show it, seen from school year `$1`: their class this year (if any) and their
// last class of an earlier year, which tells the grade they come from (promotion or repeat, business-rules §4).
const PICK_SQL = `
  SELECT s.student_id AS "studentId", s.student_code AS "studentCode", u.full_name AS "fullName", u.status,
         s.dob, s.gender,
         (SELECT COUNT(*) FROM student_parents sp WHERE sp.student_id = s.student_id) AS "parentCount",
         prev.class_name AS "previousClassName", prev.grade AS "previousGrade",
         cur.class_name AS "currentClassName"
  FROM students s
  JOIN users u ON u.user_id = s.user_id
  LEFT JOIN LATERAL (
    SELECT c.class_name, gl.grade_level_name AS grade
    FROM class_enrollments e
    JOIN classes c ON c.class_id = e.class_id AND c.deleted_at IS NULL
    JOIN school_years sy ON sy.school_year_id = c.school_year_id
    JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
    WHERE e.student_id = s.student_id
      AND sy.start_date < (SELECT start_date FROM school_years WHERE school_year_id = $1)
    ORDER BY sy.start_date DESC, e.enrolled_at DESC
    LIMIT 1) prev ON TRUE
  LEFT JOIN LATERAL (
    SELECT c.class_name
    FROM class_enrollments e
    JOIN classes c ON c.class_id = e.class_id AND c.deleted_at IS NULL
    WHERE e.student_id = s.student_id AND e.status = 'STUDYING' AND c.school_year_id = $1
    LIMIT 1) cur ON TRUE`;

async function gradeName(db, gradeLevelId) {
  const id = parseId(gradeLevelId, 'Grade not found.');
  const { rows } = await db.query('SELECT grade_level_name AS "name" FROM grade_levels WHERE grade_level_id = $1', [id]);
  if (!rows.length) throw notFound('NOT_FOUND', 'Grade not found.');
  return rows[0].name;
}

// UC-28 helper ("Tìm từng học sinh"): students without a class in this school year, by name or code, a page at a
// time. With a grade, only students who fit it: last class one grade below (promotion) or the same grade
// (repeating a year), or no class yet (new to the school); `allGrades` lifts that filter.
export async function eligibleStudents({ schoolYearId, q, gradeLevelId, allGrades, offset }) {
  const schoolYear = await resolveYear(schoolYearId);
  if (!schoolYear) return { schoolYear: null, students: [], hasMore: false };
  const search = typeof q === 'string' ? q.trim() : '';
  const grade = gradeLevelId && allGrades !== 'true' ? Number(await gradeName(pool, gradeLevelId)) : null;
  const skip = Math.max(0, Number.parseInt(offset, 10) || 0);
  const { rows } = await pool.query(
    `SELECT * FROM (${PICK_SQL}) x
     WHERE x."currentClassName" IS NULL
       AND ($2 = '' OR x."fullName" ILIKE '%' || $2 || '%' OR x."studentCode" ILIKE '%' || $2 || '%')
       AND ($3::int IS NULL OR x."previousGrade" IS NULL OR x."previousGrade"::int BETWEEN $3::int - 1 AND $3::int)
     ORDER BY x."fullName", x."studentCode"
     LIMIT ${PICK_PAGE + 1} OFFSET $4`,
    [schoolYear.schoolYearId, search, grade, skip],
  );
  return { schoolYear, students: rows.slice(0, PICK_PAGE), hasMore: rows.length > PICK_PAGE };
}

// UC-28 helper ("Dán danh sách mã"): matches pasted student codes, in the pasted order, without changing anything.
// result: OK | ENROLLED (studies in a class this year: `student.currentClassName`) | NOT_FOUND | DUPLICATE.
export async function resolveStudents({ schoolYearId, codes }) {
  const year = await resolveYear(schoolYearId);
  if (!year) throw notFound('NOT_FOUND', 'School year not found.');
  if (!Array.isArray(codes)) throw badRequest('MSG_REQUIRED', 'Please send the list of student codes.');
  const list = codes.map((c) => String(c ?? '').replace(/\s+/g, '').toUpperCase()).filter(Boolean);
  if (!list.length) throw badRequest('MSG_REQUIRED', 'Please paste at least one student code.');
  if (list.length > MAX_PASTED_CODES) {
    throw badRequest('MSG_PASTE_TOO_MANY', `At most ${MAX_PASTED_CODES} codes at a time.`, { max: MAX_PASTED_CODES });
  }
  const { rows } = await pool.query(`SELECT * FROM (${PICK_SQL}) x WHERE upper(x."studentCode") = ANY($2::text[])`, [
    year.schoolYearId,
    [...new Set(list)],
  ]);
  const byCode = new Map(rows.map((s) => [s.studentCode.toUpperCase(), s]));
  const seen = new Set();
  const items = list.map((code) => {
    if (seen.has(code)) return { code, result: 'DUPLICATE' };
    seen.add(code);
    const student = byCode.get(code);
    if (!student) return { code, result: 'NOT_FOUND' };
    return { code, result: student.currentClassName ? 'ENROLLED' : 'OK', student };
  });
  return { items };
}

// UC-28 helper ("Từ lớp năm trước"): the studying students of a class (usually last year's), seen from the school
// year being filled, so the ones already placed this year show their new class.
export async function classStudents(classIdParam, { forSchoolYearId }) {
  const classId = parseId(classIdParam, 'Class not found.');
  const year = await resolveYear(forSchoolYearId);
  if (!year) throw notFound('NOT_FOUND', 'School year not found.');
  const { rows: cls } = await pool.query(
    `SELECT c.class_id AS "classId", c.class_name AS "className", gl.grade_level_name AS "gradeLevel",
            sy.year_name AS "yearName"
     FROM classes c
     JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
     JOIN school_years sy ON sy.school_year_id = c.school_year_id
     WHERE c.class_id = $1 AND c.deleted_at IS NULL`,
    [classId],
  );
  if (!cls.length) throw notFound('NOT_FOUND', 'Class not found.');
  const { rows } = await pool.query(
    `SELECT * FROM (${PICK_SQL}) x
     WHERE x."studentId" IN (SELECT e.student_id FROM class_enrollments e WHERE e.class_id = $2 AND e.status = 'STUDYING')
     ORDER BY x."fullName", x."studentCode"`,
    [year.schoolYearId, classId],
  );
  return { class: cls[0], students: rows };
}

function parseStudentIds(raw) {
  const rawIds = raw ?? [];
  if (!Array.isArray(rawIds)) throw badRequest('MSG_REQUIRED', 'Please send the list of students.');
  const studentIds = rawIds.map((v) => parseId(v, 'Student not found.'));
  if (new Set(studentIds).size !== studentIds.length) {
    throw badRequest('MSG_CLASS_STUDENT_DUPLICATE', 'A student is listed twice.');
  }
  return studentIds;
}

// Every student exists and none studies in a class of this school year yet.
async function checkFreeStudents(client, schoolYearId, studentIds) {
  if (!studentIds.length) return;
  const { rows: found } = await client.query(
    'SELECT COUNT(*) AS "count" FROM students WHERE student_id = ANY($1::bigint[])',
    [studentIds],
  );
  if (found[0].count !== studentIds.length) throw notFound('NOT_FOUND', 'Student not found.');
  const busy = await studyingInYear(client, schoolYearId, studentIds);
  if (busy.size) {
    throw conflict('MSG_STUDENT_ALREADY_ENROLLED', 'Some students already study in another class this year.', {
      classes: [...new Set([...busy.values()].map((b) => b.className))],
    });
  }
}

// UC-28 Create Class Group: a class created by hand (instead of UC-27) with its three groups. Students are
// optional; they can be added later with addStudents below or by import (UC-27).
export async function createClass(input, userId) {
  const className = normalizeClassName(input.className);
  if (!className || !input.gradeLevelId || !input.trackId) {
    throw badRequest('MSG_REQUIRED', 'Please enter the class name, grade and class type.');
  }
  const gradeLevelId = parseId(input.gradeLevelId, 'Grade not found.');
  const trackId = parseId(input.trackId, 'Class type not found.');
  const studentIds = parseStudentIds(input.studentIds);
  if (studentIds.length > MAX_CLASS_SIZE) throw classFull(0);

  const classId = await withTransaction(async (client) => {
    const year = await lockOpenYear(client, input.schoolYearId);

    const { rows: grade } = await client.query(
      'SELECT grade_level_name AS "name" FROM grade_levels WHERE grade_level_id = $1',
      [gradeLevelId],
    );
    if (!grade.length) throw notFound('NOT_FOUND', 'Grade not found.');
    const problem = classNameProblem(className, grade[0].name);
    if (problem === 'FORMAT') {
      throw badRequest('MSG_CLASS_NAME_FORMAT', 'A class name is the grade followed by letters or digits, e.g. 10A1.');
    }
    if (problem === 'GRADE') throw badRequest('MSG_CLASS_NAME_GRADE', 'The class name must start with its grade.');

    const { rows: track } = await client.query(
      'SELECT 1 FROM class_tracks WHERE track_id = $1 AND deleted_at IS NULL',
      [trackId],
    );
    if (!track.length) throw notFound('NOT_FOUND', 'Class type not found.');

    const { rows: taken } = await client.query(
      'SELECT 1 FROM classes WHERE class_name = $1 AND school_year_id = $2',
      [className, year.schoolYearId],
    );
    if (taken.length) throw conflict('MSG_CLASS_NAME_TAKEN', 'This class already exists in the school year.');

    await checkFreeStudents(client, year.schoolYearId, studentIds);

    const { rows } = await client.query(
      `INSERT INTO classes (class_name, grade_level_id, school_year_id, track_id)
       VALUES ($1, $2, $3, $4) RETURNING class_id AS "classId"`,
      [className, gradeLevelId, year.schoolYearId, trackId],
    );
    const id = rows[0].classId;
    await enrollAndSyncGroups(client, { classId: id, className, studentIds, createdBy: userId });
    return id;
  }).catch((err) => {
    if (err.code === '23505') throw conflict('MSG_CLASS_NAME_TAKEN', 'This class already exists in the school year.');
    throw err;
  });
  return getClass(classId);
}

// UC-28, adding students to a class that already exists (e.g. a student who joins the school mid-year). Same
// checks as creating it; the new students and their linked parents join the class groups.
// ASSUMPTION (agreed 29/10 with Khanh, to confirm with Quoc): part of UC-28 rather than a new UC.
export async function addStudents(classIdParam, input, userId) {
  const classId = parseId(classIdParam, 'Class not found.');
  const studentIds = parseStudentIds(input.studentIds);
  if (!studentIds.length) throw badRequest('MSG_REQUIRED', 'Please choose at least one student.');

  const added = await withTransaction(async (client) => {
    const { rows: cls } = await client.query(
      `SELECT class_name AS "className", school_year_id AS "schoolYearId"
       FROM classes WHERE class_id = $1 AND deleted_at IS NULL`,
      [classId],
    );
    if (!cls.length) throw notFound('NOT_FOUND', 'Class not found.');
    const year = await lockOpenYear(client, cls[0].schoolYearId);

    const { rows: size } = await client.query(
      `SELECT COUNT(*) AS "count" FROM class_enrollments WHERE class_id = $1 AND status = 'STUDYING'`,
      [classId],
    );
    if (size[0].count + studentIds.length > MAX_CLASS_SIZE) throw classFull(size[0].count);

    const { rows: left } = await client.query(
      `SELECT 1 FROM class_enrollments WHERE class_id = $1 AND student_id = ANY($2::bigint[]) AND status <> 'STUDYING'`,
      [classId, studentIds],
    );
    if (left.length) throw conflict('MSG_STUDENT_LEFT_CLASS', 'A student already left this class and cannot rejoin it.');
    await checkFreeStudents(client, year.schoolYearId, studentIds);

    return enrollAndSyncGroups(client, { classId, className: cls[0].className, studentIds, createdBy: userId });
  });
  return { ...(await getClass(classId)), added: studentIds.length, memberships: added };
}

// Grades for the create form (10, 11, 12).
export async function listGradeLevels() {
  const { rows } = await pool.query(
    'SELECT grade_level_id AS "gradeLevelId", grade_level_name AS "gradeLevelName" FROM grade_levels ORDER BY grade_level_name',
  );
  return rows;
}
