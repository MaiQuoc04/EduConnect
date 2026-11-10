import { AppError, badRequest, forbidden, notFound } from '../../utils/AppError.js';
import { vietnameseNameOrder } from '../../utils/nameSort.js';

// FE-11 Grade Management (owner: Linh) – shared lookups and data scope (business-rules §11, permissions.md notes
// 7, 11, 12). Permissions follow the ACTIVE role; System Admin never reaches FE-11 (routes refuse it).

export const conflict = (code, message, details) => new AppError(409, code, message, details);

export function parseId(value, code = 'NOT_FOUND', message = 'Not found.') {
  const text = String(value ?? '');
  if (!/^\d{1,15}$/.test(text)) throw notFound(code, message);
  return Number(text);
}

// Semester + its school year. ended = the school year is over.
export async function loadSemester(db, semesterId) {
  const id = parseId(semesterId, 'MSG_SEMESTER_NOT_FOUND', 'Semester not found.');
  const { rows } = await db.query(
    `SELECT se.semester_id AS "semesterId", se.semester_no AS "semesterNo", se.status,
            se.start_date AS "startDate", se.end_date AS "endDate",
            sy.school_year_id AS "schoolYearId", sy.year_name AS "yearName", CURRENT_DATE > sy.end_date AS "yearEnded"
     FROM semesters se JOIN school_years sy ON sy.school_year_id = se.school_year_id
     WHERE se.semester_id = $1`,
    [id],
  );
  if (!rows[0]) throw notFound('MSG_SEMESTER_NOT_FOUND', 'Semester not found.');
  return rows[0];
}

export async function loadClass(db, classId) {
  const id = parseId(classId, 'MSG_CLASS_NOT_FOUND', 'Class not found.');
  const { rows } = await db.query(
    `SELECT c.class_id AS "classId", c.class_name AS "className", c.grade_level_id AS "gradeLevelId",
            g.grade_level_name AS "gradeLevelName", c.school_year_id AS "schoolYearId", c.track_id AS "trackId",
            c.homeroom_teacher_id AS "homeroomTeacherId", sy.year_name AS "yearName"
     FROM classes c
     JOIN grade_levels g ON g.grade_level_id = c.grade_level_id
     JOIN school_years sy ON sy.school_year_id = c.school_year_id
     WHERE c.class_id = $1 AND c.deleted_at IS NULL`,
    [id],
  );
  if (!rows[0]) throw notFound('MSG_CLASS_NOT_FOUND', 'Class not found.');
  return rows[0];
}

export async function loadSubject(db, subjectId) {
  const id = parseId(subjectId, 'MSG_SUBJECT_NOT_FOUND', 'Subject not found.');
  const { rows } = await db.query(
    `SELECT subject_id AS "subjectId", subject_code AS "subjectCode", subject_name AS "subjectName"
     FROM subjects WHERE subject_id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (!rows[0]) throw notFound('MSG_SUBJECT_NOT_FOUND', 'Subject not found.');
  return rows[0];
}

export async function loadGradeLevel(db, gradeLevelId) {
  const id = parseId(gradeLevelId, 'NOT_FOUND', 'Grade level not found.');
  const { rows } = await db.query(
    'SELECT grade_level_id AS "gradeLevelId", grade_level_name AS "gradeLevelName" FROM grade_levels WHERE grade_level_id = $1',
    [id],
  );
  if (!rows[0]) throw notFound('NOT_FOUND', 'Grade level not found.');
  return rows[0];
}

// The class must belong to the semester's school year.
export function assertSameYear(cls, semester) {
  if (String(cls.schoolYearId) !== String(semester.schoolYearId)) {
    throw badRequest('MSG_SEMESTER_CLASS_MISMATCH', 'This semester is not in the class’s school year.');
  }
}

export async function teacherIdOf(db, userId) {
  const { rows } = await db.query('SELECT teacher_id FROM teachers WHERE user_id = $1', [userId]);
  return rows[0]?.teacher_id ?? null;
}

// UC-83 / 84 / 85: the teacher has an assignment for this class + subject that is current or still to come.
// ASSUMPTION (FE-11 owner, 10/11/2026, to confirm): same "current or future assignment" test as the FE-04 class
// group sync (end_date >= today); a teacher whose assignment has ended can only view.
export async function isAssigned(db, teacherId, classId, subjectId) {
  if (!teacherId) return false;
  const { rows } = await db.query(
    `SELECT 1 FROM teaching_assignments
     WHERE teacher_id = $1 AND class_id = $2 AND subject_id = $3 AND deleted_at IS NULL AND end_date >= CURRENT_DATE
     LIMIT 1`,
    [teacherId, classId, subjectId],
  );
  return rows.length > 0;
}

// Classes a teacher may VIEW in a school year (note 12): any class they have an assignment in that year (past ones
// too), plus the class they are homeroom teacher of.
export async function teacherClassIds(db, teacherId, schoolYearId) {
  if (!teacherId) return [];
  const { rows } = await db.query(
    `SELECT c.class_id FROM classes c
     WHERE c.deleted_at IS NULL AND ($2::bigint IS NULL OR c.school_year_id = $2)
       AND (c.homeroom_teacher_id = $1
            OR EXISTS (SELECT 1 FROM teaching_assignments ta
                       WHERE ta.class_id = c.class_id AND ta.teacher_id = $1 AND ta.deleted_at IS NULL))`,
    [teacherId, schoolYearId ?? null],
  );
  return rows.map((r) => Number(r.class_id));
}

// Teacher (classes they teach / homeroom) or School Manager (whole school, read only) may view a class's grades.
export async function assertCanViewClass(db, user, cls) {
  if (user.activeRole === 'SCHOOL_MANAGER') return;
  if (user.activeRole === 'TEACHER') {
    const teacherId = await teacherIdOf(db, user.userId);
    const ids = await teacherClassIds(db, teacherId, cls.schoolYearId);
    if (ids.includes(Number(cls.classId))) return;
  }
  throw forbidden();
}

// Students a student / parent may see: themselves / their linked children (note 7).
export async function ownStudents(db, user) {
  if (user.activeRole === 'STUDENT') {
    const { rows } = await db.query(
      `SELECT s.student_id AS "studentId", s.student_code AS "studentCode", u.full_name AS "fullName"
       FROM students s JOIN users u ON u.user_id = s.user_id WHERE s.user_id = $1`,
      [user.userId],
    );
    return rows;
  }
  if (user.activeRole === 'PARENT') {
    const { rows } = await db.query(
      `SELECT s.student_id AS "studentId", s.student_code AS "studentCode", u.full_name AS "fullName"
       FROM parents p
       JOIN student_parents sp ON sp.parent_id = p.parent_id
       JOIN students s ON s.student_id = sp.student_id
       JOIN users u ON u.user_id = s.user_id
       WHERE p.user_id = $1
       ORDER BY u.full_name`,
      [user.userId],
    );
    return rows;
  }
  return [];
}

// UC-88 / 89 for one student: the student themself, a linked parent, a teacher of one of the student's classes
// that year, or School Manager. Anything else = "not found", so the student's existence is not revealed.
export async function assertCanViewStudent(db, user, studentId, schoolYearId) {
  const id = Number(studentId);
  if (user.activeRole === 'SCHOOL_MANAGER') return;
  if (user.activeRole === 'STUDENT' || user.activeRole === 'PARENT') {
    const own = await ownStudents(db, user);
    if (own.some((s) => Number(s.studentId) === id)) return;
  }
  if (user.activeRole === 'TEACHER') {
    const teacherId = await teacherIdOf(db, user.userId);
    const ids = await teacherClassIds(db, teacherId, schoolYearId);
    if (ids.length) {
      const { rows } = await db.query(
        'SELECT 1 FROM class_enrollments WHERE student_id = $1 AND class_id = ANY($2::bigint[]) LIMIT 1',
        [id, ids],
      );
      if (rows.length) return;
    }
  }
  throw notFound('MSG_STUDENT_NOT_FOUND', 'Student not found.');
}

// The structure of one subject × grade level × semester (UC-81), in display order.
export async function loadComponents(db, subjectId, gradeLevelId, semesterId) {
  const { rows } = await db.query(
    `SELECT component_id AS "componentId", component_name AS "name", weight, score_count AS "scoreCount"
     FROM grade_components WHERE subject_id = $1 AND grade_level_id = $2 AND semester_id = $3
     ORDER BY component_id`,
    [subjectId, gradeLevelId, semesterId],
  );
  return rows.map((r) => ({ ...r, weight: Number(r.weight) }));
}

// The structure locks once it has grades (any grades row, even a cleared score).
// ASSUMPTION (FE-11 owner, 10/11/2026, to confirm): the lock is per subject × grade level × semester, not the whole
// semester.
export async function structureLocked(db, subjectId, gradeLevelId, semesterId) {
  const { rows } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM grades g JOIN grade_components gc ON gc.component_id = g.component_id
                    WHERE gc.subject_id = $1 AND gc.grade_level_id = $2 AND gc.semester_id = $3) AS locked`,
    [subjectId, gradeLevelId, semesterId],
  );
  return rows[0].locked;
}

// Status of a grade book (class × subject × semester): 'LOCKED' (finalized), 'UNLOCKED' (unlocked by SM) or 'OPEN'.
export async function bookStatus(db, classId, subjectId, semesterId) {
  const { rows } = await db.query(
    'SELECT status FROM grade_locks WHERE class_id = $1 AND subject_id = $2 AND semester_id = $3',
    [classId, subjectId, semesterId],
  );
  return rows[0]?.status ?? 'OPEN';
}

// Serialises writes to one grade book (save, import, finalize, unlock) inside a transaction.
export async function lockBookForWrite(client, classId, subjectId, semesterId) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('grade-book:' || $1 || ':' || $2 || ':' || $3))", [
    String(classId),
    String(subjectId),
    String(semesterId),
  ]);
}

// Enrollments of a class (every status: transferred / dropped students keep their old grades, read only).
// ASSUMPTION (FE-11 owner, 10/11/2026): only STUDYING students are edited, required for finalizing and ranked.
export async function classEnrollments(db, classId) {
  const { rows } = await db.query(
    `SELECT e.enrollment_id AS "enrollmentId", e.status, s.student_id AS "studentId", s.student_code AS "studentCode",
            u.full_name AS "fullName"
     FROM class_enrollments e
     JOIN students s ON s.student_id = e.student_id
     JOIN users u ON u.user_id = s.user_id
     WHERE e.class_id = $1
     ORDER BY (e.status <> 'STUDYING'), ${vietnameseNameOrder('u.full_name')}, e.enrollment_id`,
    [classId],
  );
  return rows;
}
