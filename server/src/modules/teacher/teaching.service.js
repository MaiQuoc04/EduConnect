import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, notFound } from '../../utils/AppError.js';

// ASSUMPTION (same as SCR-16): a LOCKED teacher cannot receive a new teaching assignment.
const LOCKED_TEACHER_CAN_TEACH = false;

const isId = (v) => /^\d{1,18}$/.test(String(v));
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v));

/**
 * Picks the school year and the "view date" of the matrix. Assignments are date ranges, so the matrix shows the
 * assignment active on that date. Default date: today if it lies in the year, otherwise the year's first day.
 */
async function resolveYearAndDate({ schoolYearId, date }) {
  const [years] = await pool.query(
    `SELECT school_year_id AS "id", year_name AS "name",
            to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate",
            (start_date <= CURRENT_DATE) AS "started"
     FROM school_years ORDER BY start_date DESC`,
  );
  const [[today]] = await pool.query(`SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS "d"`);
  const currentId = years.find((y) => y.started)?.id; // MOM-05: latest year that has started

  let year;
  if (schoolYearId) {
    year = years.find((y) => String(y.id) === String(schoolYearId));
    if (!year) throw notFound('SCHOOL_YEAR_NOT_FOUND', 'School year not found.');
  } else {
    year = years.find((y) => String(y.id) === String(currentId)) ?? years[0] ?? null;
  }
  if (!year) return { years: [], year: null, date: null, today: today.d, currentId };

  let viewDate;
  if (date) {
    if (!isDate(date)) throw badRequest('INVALID_DATE', 'date must be YYYY-MM-DD.');
    viewDate = date < year.startDate ? year.startDate : date > year.endDate ? year.endDate : date;
  } else {
    viewDate = today.d >= year.startDate && today.d <= year.endDate ? today.d : year.startDate;
  }
  return { years, year, date: viewDate, today: today.d, currentId };
}

/**
 * SCR-17 / UC-18 – matrix of classes × subjects of one school year, with the teacher assigned on `date`.
 */
export async function getTeachingBoard({ schoolYearId, date } = {}) {
  const { years, year, date: viewDate, today, currentId } = await resolveYearAndDate({ schoolYearId, date });
  const schoolYears = years.map(({ started, ...y }) => ({ ...y, isCurrent: String(y.id) === String(currentId) }));
  if (!year) return { schoolYears, schoolYear: null, date: null, today, subjects: [], classes: [], assignments: [], teachers: [] };

  const [classes, cells, assignments, teachers, teacherSubjects] = await Promise.all([
    pool.query(
      `SELECT c.class_id AS "classId", c.class_name AS "className", gl.grade_level_name AS "gradeLevel",
              ct.track_name AS "trackName",
              (SELECT COUNT(*) FROM class_enrollments e
                WHERE e.class_id = c.class_id AND e.status = 'STUDYING')::int AS "studentCount"
       FROM classes c
       JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
       JOIN class_tracks ct ON ct.track_id = c.track_id
       WHERE c.school_year_id = ? AND c.deleted_at IS NULL
       ORDER BY gl.grade_level_name, c.class_name`,
      [year.id],
    ),
    // Which subjects each class studies, and how many periods (track_subjects of the class's track and year).
    pool.query(
      `SELECT c.class_id AS "classId", s.subject_id AS "subjectId", s.subject_name AS "subjectName",
              s.subject_code AS "subjectCode", tsj.periods_per_week AS "periodsPerWeek"
       FROM classes c
       JOIN track_subjects tsj ON tsj.track_id = c.track_id AND tsj.school_year_id = c.school_year_id
       JOIN subjects s ON s.subject_id = tsj.subject_id AND s.deleted_at IS NULL
       WHERE c.school_year_id = ? AND c.deleted_at IS NULL`,
      [year.id],
    ),
    pool.query(
      `SELECT ta.assignment_id AS "assignmentId", ta.class_id AS "classId", ta.subject_id AS "subjectId",
              ta.teacher_id AS "teacherId",
              to_char(ta.start_date, 'YYYY-MM-DD') AS "startDate", to_char(ta.end_date, 'YYYY-MM-DD') AS "endDate"
       FROM teaching_assignments ta
       JOIN classes c ON c.class_id = ta.class_id AND c.deleted_at IS NULL
       WHERE c.school_year_id = ? AND ta.deleted_at IS NULL
         AND ?::date BETWEEN ta.start_date AND ta.end_date
       ORDER BY ta.start_date`,
      [year.id, viewDate],
    ),
    pool.query(
      `SELECT t.teacher_id AS "teacherId", t.teacher_code AS "teacherCode", t.department,
              u.full_name AS "fullName", u.status
       FROM teachers t JOIN users u ON u.user_id = t.user_id
       ORDER BY u.full_name`,
    ),
    pool.query(
      `SELECT ts.teacher_id AS "teacherId", ts.subject_id AS "subjectId"
       FROM teacher_subjects ts JOIN subjects s ON s.subject_id = ts.subject_id AND s.deleted_at IS NULL`,
    ),
  ]).then((r) => r.map(([rows]) => rows));

  // Columns = every subject studied by at least one class of the year, in a stable order.
  const subjectMap = new Map();
  const classSubjects = {};
  for (const c of cells) {
    if (!subjectMap.has(String(c.subjectId))) {
      subjectMap.set(String(c.subjectId), { subjectId: c.subjectId, name: c.subjectName, code: c.subjectCode });
    }
    (classSubjects[c.classId] ??= {})[c.subjectId] = Number(c.periodsPerWeek);
  }
  const subjects = [...subjectMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  const canTeach = {};
  for (const r of teacherSubjects) (canTeach[r.teacherId] ??= []).push(r.subjectId);

  return {
    schoolYears,
    schoolYear: { ...schoolYears.find((y) => String(y.id) === String(year.id)) },
    date: viewDate,
    today,
    subjects,
    classes: classes.map((c) => ({ ...c, subjects: classSubjects[c.classId] ?? {} })),
    assignments,
    teachers: teachers.map((t) => ({ ...t, subjectIds: canTeach[t.teacherId] ?? [] })),
    rules: { lockedTeacherAllowed: LOCKED_TEACHER_CAN_TEACH },
  };
}

/**
 * SCR-17 / UC-18 – save changes of (class, subject) → teacher, effective from `date` until the end of the year.
 * body: { schoolYearId, date, changes: [{ classId, subjectId, teacherId|null, previousTeacherId|null }] }
 *
 * For each pair: the assignment running on `date` ends the day before, later planned rows are soft-deleted, and a
 * new row [date, year end] is inserted for the new teacher. Timetable slots of the pair from `date` that have no
 * attendance move to the new teacher (business-rules §10: no substitute teaching; rows with attendance are kept).
 */
export async function saveTeachingAssignments(input = {}) {
  const { schoolYearId, date, changes } = input;
  if (!isId(schoolYearId)) throw badRequest('MSG_REQUIRED', 'schoolYearId is required.', { field: 'schoolYearId' });
  if (!isDate(date)) throw badRequest('INVALID_DATE', 'date must be YYYY-MM-DD.');
  if (!Array.isArray(changes) || !changes.length) throw badRequest('MSG_REQUIRED', 'No changes to save.', { field: 'changes' });
  if (changes.length > 1000) throw badRequest('MSG_TOO_MANY', 'Too many changes.');

  const seen = new Set();
  const wanted = changes.map((ch) => {
    const classId = String(ch?.classId ?? '');
    const subjectId = String(ch?.subjectId ?? '');
    const teacherId = ch?.teacherId == null || ch.teacherId === '' ? null : String(ch.teacherId);
    const previousTeacherId = ch?.previousTeacherId == null || ch.previousTeacherId === '' ? null : String(ch.previousTeacherId);
    if (![classId, subjectId].every(isId) || (teacherId && !isId(teacherId)) || (previousTeacherId && !isId(previousTeacherId))) {
      throw badRequest('MSG_INVALID_INPUT', 'Invalid class, subject or teacher id.');
    }
    const key = `${classId}:${subjectId}`;
    if (seen.has(key)) throw badRequest('MSG_INVALID_INPUT', 'A class/subject pair appears twice.');
    seen.add(key);
    return { classId, subjectId, teacherId, previousTeacherId };
  });

  await withTransaction(async (conn) => {
    const [years] = await conn.query(
      `SELECT to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate",
              to_char(CURRENT_DATE, 'YYYY-MM-DD') AS "today"
       FROM school_years WHERE school_year_id = ?`,
      [schoolYearId],
    );
    if (!years.length) throw notFound('SCHOOL_YEAR_NOT_FOUND', 'School year not found.');
    const { startDate, endDate, today } = years[0];
    // ASSUMPTION: changes are never back-dated (past lessons, attendance and grades stay with the old teacher).
    if (date < today || date < startDate || date > endDate) {
      throw badRequest('MSG_EFFECTIVE_DATE', 'The effective date must be today or later, inside the school year.', {
        min: today > startDate ? today : startDate,
        max: endDate,
      });
    }

    // Lock the classes of the year: two managers saving at once are serialised.
    const [classes] = await conn.query(
      `SELECT class_id AS "classId", class_name AS "className", track_id AS "trackId"
       FROM classes WHERE school_year_id = ? AND deleted_at IS NULL ORDER BY class_id FOR UPDATE`,
      [schoolYearId],
    );
    const classById = new Map(classes.map((c) => [String(c.classId), c]));

    const [pairs] = await conn.query(
      `SELECT c.class_id AS "classId", s.subject_id AS "subjectId", s.subject_name AS "subjectName"
       FROM classes c
       JOIN track_subjects tsj ON tsj.track_id = c.track_id AND tsj.school_year_id = c.school_year_id
       JOIN subjects s ON s.subject_id = tsj.subject_id AND s.deleted_at IS NULL
       WHERE c.school_year_id = ? AND c.deleted_at IS NULL`,
      [schoolYearId],
    );
    const subjectName = new Map(pairs.map((p) => [`${p.classId}:${p.subjectId}`, p.subjectName]));

    const [current] = await conn.query(
      `SELECT ta.class_id AS "classId", ta.subject_id AS "subjectId", ta.teacher_id AS "teacherId"
       FROM teaching_assignments ta
       JOIN classes c ON c.class_id = ta.class_id
       WHERE c.school_year_id = ? AND ta.deleted_at IS NULL AND ?::date BETWEEN ta.start_date AND ta.end_date`,
      [schoolYearId, date],
    );
    const currentByPair = new Map(current.map((a) => [`${a.classId}:${a.subjectId}`, String(a.teacherId)]));

    const label = (w) => `${classById.get(w.classId)?.className ?? w.classId} – ${subjectName.get(`${w.classId}:${w.subjectId}`) ?? w.subjectId}`;

    const stale = [];
    for (const w of wanted) {
      if (!classById.has(w.classId)) throw badRequest('MSG_INVALID_INPUT', 'Class is not in this school year.', { classId: w.classId });
      // business-rules §4: the subject must be part of the class's track for that year.
      if (!subjectName.has(`${w.classId}:${w.subjectId}`)) {
        throw badRequest('MSG_SUBJECT_NOT_IN_CLASS', 'This class does not study that subject.', { pair: `${w.classId}:${w.subjectId}` });
      }
      if ((currentByPair.get(`${w.classId}:${w.subjectId}`) ?? null) !== w.previousTeacherId) stale.push(label(w));
    }
    if (stale.length) throw new AppError(409, 'MSG_ASSIGNMENT_STALE', 'Some cells were changed by someone else.', { cells: stale });

    const teacherIds = [...new Set(wanted.map((w) => w.teacherId).filter(Boolean))];
    if (teacherIds.length) {
      const [teachers] = await conn.query(
        `SELECT t.teacher_id AS "teacherId", u.full_name AS "fullName", u.status,
                COALESCE(array_agg(ts.subject_id) FILTER (WHERE ts.subject_id IS NOT NULL), '{}') AS "subjectIds"
         FROM teachers t
         JOIN users u ON u.user_id = t.user_id
         LEFT JOIN teacher_subjects ts ON ts.teacher_id = t.teacher_id
         WHERE t.teacher_id = ANY(?::bigint[])
         GROUP BY t.teacher_id, u.full_name, u.status`,
        [teacherIds],
      );
      if (teachers.length !== teacherIds.length) throw badRequest('MSG_INVALID_INPUT', 'Unknown teacher.');
      const tById = new Map(teachers.map((t) => [String(t.teacherId), t]));

      if (!LOCKED_TEACHER_CAN_TEACH) {
        const locked = teachers.filter((t) => t.status === 'LOCKED').map((t) => t.fullName);
        if (locked.length) throw new AppError(409, 'MSG_TEACHER_LOCKED', 'A locked teacher cannot be assigned.', { teachers: locked });
      }
      // business-rules §4: teaching assignments only for subjects the teacher can teach (teacher_subjects).
      const notQualified = wanted
        .filter((w) => w.teacherId && !tById.get(w.teacherId).subjectIds.map(String).includes(w.subjectId))
        .map((w) => ({ teacher: tById.get(w.teacherId).fullName, cell: label(w) }));
      if (notQualified.length) {
        throw new AppError(409, 'MSG_TEACHER_NOT_QUALIFIED', 'Teacher is not registered for that subject.', { items: notQualified });
      }
    }

    const clashes = [];
    const blocked = [];
    for (const w of wanted) {
      // 1. close the running assignment the day before, drop rows planned after the date
      await conn.query(
        `UPDATE teaching_assignments SET deleted_at = NOW()
         WHERE class_id = ? AND subject_id = ? AND deleted_at IS NULL AND start_date >= ?::date`,
        [w.classId, w.subjectId, date],
      );
      await conn.query(
        `UPDATE teaching_assignments SET end_date = ?::date - 1
         WHERE class_id = ? AND subject_id = ? AND deleted_at IS NULL
           AND start_date < ?::date AND end_date >= ?::date`,
        [date, w.classId, w.subjectId, date, date],
      );

      // 2. timetable slots of the pair from the date that have no attendance yet
      const freeSlots = `
        FROM timetable_slots ts
        WHERE ts.class_id = ? AND ts.subject_id = ? AND ts."date" >= ?::date
          AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.timetable_slot_id = ts.timetable_slot_id)`;

      if (!w.teacherId) {
        const [[{ n }]] = await conn.query(`SELECT COUNT(*)::int AS "n" ${freeSlots}`, [w.classId, w.subjectId, date]);
        if (Number(n) > 0) blocked.push({ cell: label(w), periods: Number(n) });
        continue;
      }

      // the new teacher must be free in every moved period (DB also has UNIQUE (teacher_id, date, slot_id))
      const [busy] = await conn.query(
        `SELECT to_char(ts."date", 'YYYY-MM-DD') AS "date", sl.period_number AS "period", c2.class_name AS "otherClass"
         FROM timetable_slots ts
         JOIN time_slots sl ON sl.slot_id = ts.slot_id
         JOIN timetable_slots other
           ON other.teacher_id = ? AND other."date" = ts."date" AND other.slot_id = ts.slot_id
          AND other.timetable_slot_id <> ts.timetable_slot_id
         JOIN classes c2 ON c2.class_id = other.class_id
         WHERE ts.class_id = ? AND ts.subject_id = ? AND ts."date" >= ?::date
           AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.timetable_slot_id = ts.timetable_slot_id)
         ORDER BY ts."date", sl.period_number
         LIMIT 5`,
        [w.teacherId, w.classId, w.subjectId, date],
      );
      if (busy.length) {
        clashes.push({ cell: label(w), items: busy });
        continue;
      }

      await conn.query(
        `INSERT INTO teaching_assignments (class_id, subject_id, teacher_id, start_date, end_date)
         VALUES (?, ?, ?, ?::date, ?::date)`,
        [w.classId, w.subjectId, w.teacherId, date, endDate],
      );
      await conn.query(`UPDATE timetable_slots SET teacher_id = ? WHERE timetable_slot_id IN (SELECT ts.timetable_slot_id ${freeSlots})`, [
        w.teacherId,
        w.classId,
        w.subjectId,
        date,
      ]);
    }

    if (blocked.length) {
      throw new AppError(409, 'MSG_ASSIGNMENT_IN_TIMETABLE', 'Cannot leave a pair without teacher while it has lessons.', { items: blocked });
    }
    if (clashes.length) {
      throw new AppError(409, 'MSG_TIMETABLE_CLASH', 'The new teacher already teaches at those periods.', { items: clashes });
    }
  });

  return getTeachingBoard({ schoolYearId: String(schoolYearId), date });
}
