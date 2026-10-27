import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, notFound } from '../../utils/AppError.js';

// ASSUMPTION (SCR-16 design, not in business-rules.md): a teacher is homeroom teacher of at most ONE class per
// school year, and a LOCKED teacher cannot be given a homeroom class. Change these two constants if the team decides
// otherwise.
const MAX_HOMEROOM_CLASSES_PER_TEACHER = 1;
const LOCKED_TEACHER_CAN_BE_HOMEROOM = false;

const isId = (v) => /^\d{1,18}$/.test(String(v));

async function listSchoolYears(db = pool) {
  const [rows] = await db.query(
    `SELECT school_year_id AS "id", year_name AS "name",
            to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate"
     FROM school_years ORDER BY start_date DESC`,
  );
  return rows;
}

// MOM-05: current year = latest year that has started.
async function currentSchoolYearId() {
  const [rows] = await pool.query(
    'SELECT school_year_id AS "id" FROM school_years WHERE start_date <= CURRENT_DATE ORDER BY start_date DESC LIMIT 1',
  );
  return rows[0]?.id ?? null;
}

/**
 * SCR-16 / UC-19 – classes of one school year with their homeroom teacher, plus the teachers that can be chosen.
 */
export async function getHomeroomBoard({ schoolYearId } = {}) {
  const schoolYears = await listSchoolYears();
  const yearId = schoolYearId ?? (await currentSchoolYearId()) ?? schoolYears[0]?.id ?? null;
  const schoolYear = schoolYears.find((y) => String(y.id) === String(yearId));
  if (schoolYearId && !schoolYear) throw notFound('SCHOOL_YEAR_NOT_FOUND', 'School year not found.');
  const currentId = await currentSchoolYearId();

  if (!schoolYear) {
    return { schoolYears: [], schoolYear: null, classes: [], teachers: [], rules: rulesInfo() };
  }

  const [classes] = await pool.query(
    `SELECT
       c.class_id            AS "classId",
       c.class_name          AS "className",
       gl.grade_level_name   AS "gradeLevel",
       ct.track_name         AS "trackName",
       c.homeroom_teacher_id AS "homeroomTeacherId",
       (SELECT COUNT(*) FROM class_enrollments e
         WHERE e.class_id = c.class_id AND e.status = 'STUDYING')::int AS "studentCount"
     FROM classes c
     JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
     JOIN class_tracks ct ON ct.track_id = c.track_id
     WHERE c.school_year_id = ? AND c.deleted_at IS NULL
     ORDER BY gl.grade_level_name, c.class_name`,
    [schoolYear.id],
  );

  const [teachers] = await pool.query(
    `SELECT
       t.teacher_id   AS "teacherId",
       t.teacher_code AS "teacherCode",
       u.full_name    AS "fullName",
       u.status,
       COALESCE((
         SELECT string_agg(s.subject_name, ', ' ORDER BY s.subject_name)
         FROM teacher_subjects ts JOIN subjects s ON s.subject_id = ts.subject_id AND s.deleted_at IS NULL
         WHERE ts.teacher_id = t.teacher_id
       ), '') AS "subjects"
     FROM teachers t
     JOIN users u ON u.user_id = t.user_id
     ORDER BY u.full_name`,
  );

  return {
    schoolYears: schoolYears.map((y) => ({ ...y, isCurrent: String(y.id) === String(currentId) })),
    schoolYear: { ...schoolYear, isCurrent: String(schoolYear.id) === String(currentId) },
    classes: classes.map((c) => ({ ...c, studentCount: Number(c.studentCount) })),
    teachers,
    rules: rulesInfo(),
  };
}

function rulesInfo() {
  return {
    maxClassesPerTeacher: MAX_HOMEROOM_CLASSES_PER_TEACHER,
    lockedTeacherAllowed: LOCKED_TEACHER_CAN_BE_HOMEROOM,
  };
}

/**
 * SCR-16 / UC-19 – save several homeroom changes of one school year at once.
 * body: { schoolYearId, changes: [{ classId, teacherId|null, previousTeacherId|null }] }
 * previousTeacherId is what the client saw; if someone else changed the class meanwhile we refuse (409).
 */
export async function saveHomeroomAssignments(input = {}) {
  const { schoolYearId, changes } = input;
  if (!isId(schoolYearId)) throw badRequest('MSG_REQUIRED', 'schoolYearId is required.', { field: 'schoolYearId' });
  if (!Array.isArray(changes) || !changes.length) {
    throw badRequest('MSG_REQUIRED', 'No changes to save.', { field: 'changes' });
  }
  if (changes.length > 500) throw badRequest('MSG_TOO_MANY', 'Too many changes.');

  const seen = new Set();
  const wanted = changes.map((ch) => {
    const classId = String(ch?.classId ?? '');
    const teacherId = ch?.teacherId == null || ch.teacherId === '' ? null : String(ch.teacherId);
    const previousTeacherId = ch?.previousTeacherId == null || ch.previousTeacherId === '' ? null : String(ch.previousTeacherId);
    if (!isId(classId) || (teacherId && !isId(teacherId)) || (previousTeacherId && !isId(previousTeacherId))) {
      throw badRequest('MSG_INVALID_INPUT', 'Invalid class or teacher id.');
    }
    if (seen.has(classId)) throw badRequest('MSG_INVALID_INPUT', 'A class appears twice.');
    seen.add(classId);
    return { classId, teacherId, previousTeacherId };
  });

  await withTransaction(async (conn) => {
    const [years] = await conn.query('SELECT school_year_id FROM school_years WHERE school_year_id = ?', [schoolYearId]);
    if (!years.length) throw notFound('SCHOOL_YEAR_NOT_FOUND', 'School year not found.');

    // Lock every class of the year so two managers saving at once cannot break the per-teacher limit.
    const [classes] = await conn.query(
      `SELECT class_id AS "classId", class_name AS "className", homeroom_teacher_id AS "homeroomTeacherId"
       FROM classes WHERE school_year_id = ? AND deleted_at IS NULL
       ORDER BY class_id FOR UPDATE`,
      [schoolYearId],
    );
    const byId = new Map(classes.map((c) => [String(c.classId), c]));

    const stale = [];
    for (const w of wanted) {
      const cls = byId.get(w.classId);
      if (!cls) throw badRequest('MSG_INVALID_INPUT', 'Class is not in this school year.', { classId: w.classId });
      const current = cls.homeroomTeacherId == null ? null : String(cls.homeroomTeacherId);
      if (current !== w.previousTeacherId) stale.push(cls.className);
    }
    if (stale.length) {
      throw new AppError(409, 'MSG_HOMEROOM_STALE', 'Some classes were changed by someone else.', { classes: stale });
    }

    const newTeacherIds = [...new Set(wanted.map((w) => w.teacherId).filter(Boolean))];
    if (newTeacherIds.length) {
      const [teachers] = await conn.query(
        `SELECT t.teacher_id AS "teacherId", u.full_name AS "fullName", u.status
         FROM teachers t JOIN users u ON u.user_id = t.user_id
         WHERE t.teacher_id = ANY(?::bigint[])`,
        [newTeacherIds],
      );
      if (teachers.length !== newTeacherIds.length) throw badRequest('MSG_INVALID_INPUT', 'Unknown teacher.');
      if (!LOCKED_TEACHER_CAN_BE_HOMEROOM) {
        // Only block teachers newly placed on a class; an unchanged locked homeroom is not part of `wanted`.
        const locked = teachers.filter((t) => t.status === 'LOCKED');
        if (locked.length) {
          throw new AppError(409, 'MSG_TEACHER_LOCKED', 'A locked teacher cannot be a homeroom teacher.', {
            teachers: locked.map((t) => t.fullName),
          });
        }
      }

      // Final state of the year after the changes → check the per-teacher limit.
      const finalByClass = new Map(classes.map((c) => [String(c.classId), c.homeroomTeacherId == null ? null : String(c.homeroomTeacherId)]));
      for (const w of wanted) finalByClass.set(w.classId, w.teacherId);
      const count = new Map();
      for (const [classId, tid] of finalByClass) {
        if (!tid) continue;
        (count.get(tid) ?? count.set(tid, []).get(tid)).push(byId.get(classId).className);
      }
      const over = teachers
        .filter((t) => (count.get(String(t.teacherId))?.length ?? 0) > MAX_HOMEROOM_CLASSES_PER_TEACHER)
        .map((t) => ({ teacher: t.fullName, classes: count.get(String(t.teacherId)) }));
      if (over.length) {
        throw new AppError(409, 'MSG_HOMEROOM_LIMIT', 'A teacher would be homeroom teacher of too many classes.', {
          max: MAX_HOMEROOM_CLASSES_PER_TEACHER,
          conflicts: over,
        });
      }
    }

    for (const w of wanted) {
      await conn.query('UPDATE classes SET homeroom_teacher_id = ? WHERE class_id = ?', [w.teacherId, w.classId]);
    }
  });

  return getHomeroomBoard({ schoolYearId: String(schoolYearId) });
}
