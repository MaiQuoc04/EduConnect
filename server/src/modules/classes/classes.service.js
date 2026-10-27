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
         ct.track_id AS "trackId", ct.track_name AS "trackName",
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

// UC-28 helper: students who have no class yet in this school year, to pick from. Search by name or code;
// at most 50 results.
export async function eligibleStudents({ schoolYearId, q }) {
  const schoolYear = await resolveYear(schoolYearId);
  if (!schoolYear) return { schoolYear: null, students: [] };
  const search = typeof q === 'string' ? q.trim() : '';
  const { rows } = await pool.query(
    `SELECT s.student_id AS "studentId", s.student_code AS "studentCode", u.full_name AS "fullName",
            u.status, s.dob,
            (SELECT COUNT(*) FROM student_parents sp WHERE sp.student_id = s.student_id) AS "parentCount"
     FROM students s
     JOIN users u ON u.user_id = s.user_id
     WHERE NOT EXISTS (SELECT 1 FROM class_enrollments e
                       JOIN classes c ON c.class_id = e.class_id AND c.deleted_at IS NULL
                       WHERE e.student_id = s.student_id AND e.status = 'STUDYING' AND c.school_year_id = $1)
       AND ($2 = '' OR u.full_name ILIKE '%' || $2 || '%' OR s.student_code ILIKE '%' || $2 || '%')
     ORDER BY u.full_name, s.student_code
     LIMIT 50`,
    [schoolYear.schoolYearId, search],
  );
  return { schoolYear, students: rows };
}

// UC-28 Create Class Group: a class created by hand (instead of UC-27) with its three groups. Students are
// optional; they can be added later by import (UC-27) or as members (UC-32).
export async function createClass(input, userId) {
  const className = normalizeClassName(input.className);
  if (!className || !input.gradeLevelId || !input.trackId) {
    throw badRequest('MSG_REQUIRED', 'Please enter the class name, grade and class type.');
  }
  const gradeLevelId = parseId(input.gradeLevelId, 'Grade not found.');
  const trackId = parseId(input.trackId, 'Class type not found.');
  const rawIds = input.studentIds ?? [];
  if (!Array.isArray(rawIds)) throw badRequest('MSG_REQUIRED', 'Please send the list of students.');
  const studentIds = rawIds.map((v) => parseId(v, 'Student not found.'));
  if (new Set(studentIds).size !== studentIds.length) {
    throw badRequest('MSG_CLASS_STUDENT_DUPLICATE', 'A student is listed twice.');
  }

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

    if (studentIds.length) {
      const { rows: found } = await client.query(
        'SELECT COUNT(*) AS "count" FROM students WHERE student_id = ANY($1::bigint[])',
        [studentIds],
      );
      if (found[0].count !== studentIds.length) throw notFound('NOT_FOUND', 'Student not found.');
      const busy = await studyingInYear(client, year.schoolYearId, studentIds);
      if (busy.size) {
        throw conflict('MSG_STUDENT_ALREADY_ENROLLED', 'Some students already study in another class this year.', {
          classes: [...new Set([...busy.values()].map((b) => b.className))],
        });
      }
    }

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

// Grades for the create form (10, 11, 12).
export async function listGradeLevels() {
  const { rows } = await pool.query(
    'SELECT grade_level_id AS "gradeLevelId", grade_level_name AS "gradeLevelName" FROM grade_levels ORDER BY grade_level_name',
  );
  return rows;
}
