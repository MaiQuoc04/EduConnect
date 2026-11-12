// FE-10 timetable (Dung, It2) – UC-70..UC-75. Business rules §10 and §4 (teaching assignments with dates).
//
// A class timetable is a weekly pattern (timetable_entries: weekday + period -> subject, room) inside a version
// (timetables: class, start_date, end_date). Saving a version generates one timetable_slots row per period per day
// in its range; the teacher of each row is the one whose teaching assignment covers that date (no substitute
// teaching). Saving from date X never touches days before X, and rows that already have attendance are kept.
import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, notFound } from '../../utils/AppError.js';
import { ERROR_CODES, ROLES, TIMETABLE_LIMITS } from './timetable.constants.js';

const conflict = (code, message, details) => new AppError(409, code, message, details);

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

async function timeSlots(db = pool) {
  const { rows } = await db.query(
    `SELECT slot_id AS "slotId", period_number AS "period",
            to_char(start_time, 'HH24:MI') AS "start", to_char(end_time, 'HH24:MI') AS "end"
     FROM time_slots ORDER BY period_number`,
  );
  return rows;
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

async function classInfo(classId, db = pool, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT c.class_id AS "classId", c.class_name AS "className", c.track_id AS "trackId",
            gl.grade_level_name AS "gradeName", ct.track_name AS "trackName",
            ${YEAR_COLUMNS}
     FROM classes c
     JOIN school_years sy ON sy.school_year_id = c.school_year_id
     JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
     JOIN class_tracks ct ON ct.track_id = c.track_id
     WHERE c.class_id = $1 AND c.deleted_at IS NULL ${lock ? 'FOR UPDATE OF c' : ''}`,
    [classId],
  );
  if (!rows.length) throw notFound(ERROR_CODES.CLASS_NOT_FOUND, 'Class not found.');
  const { id, name, startDate, endDate, ...cls } = rows[0];
  return { ...cls, schoolYear: { id, name, startDate, endDate } };
}

// Subjects of the class type for the year (track_subjects) with periods per week.
async function classSubjects(cls, db = pool) {
  const { rows } = await db.query(
    `SELECT s.subject_id AS "subjectId", s.subject_code AS "code", s.subject_name AS "name",
            ts.periods_per_week AS "periodsPerWeek"
     FROM track_subjects ts JOIN subjects s ON s.subject_id = ts.subject_id AND s.deleted_at IS NULL
     WHERE ts.track_id = $1 AND ts.school_year_id = $2
     ORDER BY s.subject_name`,
    [cls.trackId, cls.schoolYear.id],
  );
  return rows;
}

// Teacher of each subject of the class on `date` (teaching assignment covering it), plus the next change after it.
async function teachersOn(classId, date, db = pool) {
  const { rows } = await db.query(
    `SELECT ta.subject_id AS "subjectId", ta.teacher_id AS "teacherId", u.full_name AS "teacherName",
            to_char(ta.start_date, 'YYYY-MM-DD') AS "startDate", to_char(ta.end_date, 'YYYY-MM-DD') AS "endDate"
     FROM teaching_assignments ta
     JOIN teachers t ON t.teacher_id = ta.teacher_id
     JOIN users u ON u.user_id = t.user_id
     WHERE ta.class_id = $1 AND ta.deleted_at IS NULL AND $2::date BETWEEN ta.start_date AND ta.end_date`,
    [classId, date],
  );
  return Object.fromEntries(rows.map((r) => [String(r.subjectId), r]));
}

async function homeroomOf(classId, db = pool) {
  const { rows } = await db.query(
    `SELECT u.full_name AS "name" FROM classes c JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
     JOIN users u ON u.user_id = t.user_id WHERE c.class_id = $1`,
    [classId],
  );
  return rows[0]?.name ?? null;
}

// Fingerprint of a class's versions: the editor sends it back so a save over someone else's newer save is refused.
const stampOf = (versions) => versions.map((v) => `${v.timetableId}:${v.startDate}:${v.endDate}`).join('|') || 'none';

async function versionsOf(classId, db = pool) {
  const { rows } = await db.query(
    `SELECT t.timetable_id AS "timetableId", to_char(t.start_date, 'YYYY-MM-DD') AS "startDate",
            to_char(t.end_date, 'YYYY-MM-DD') AS "endDate", to_char(t.created_at, 'YYYY-MM-DD HH24:MI') AS "createdAt",
            u.full_name AS "createdBy",
            (SELECT COUNT(*)::int FROM timetable_entries e WHERE e.timetable_id = t.timetable_id) AS "periodsPerWeek"
     FROM timetables t LEFT JOIN users u ON u.user_id = t.created_by
     WHERE t.class_id = $1 AND t.deleted_at IS NULL
     ORDER BY t.start_date`,
    [classId],
  );
  return rows;
}

async function entriesOf(timetableId, db = pool) {
  const { rows } = await db.query(
    `SELECT weekday, slot_id AS "slotId", subject_id AS "subjectId", room
     FROM timetable_entries WHERE timetable_id = $1 ORDER BY weekday, slot_id`,
    [timetableId],
  );
  return rows;
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

// ── UC-71 / UC-73 editor data (School Manager) ──────────────────────────────

// Everything the editor needs. `date` picks the version to show (default: the one running today, else the next).
export function getEditor({ classId, date }) {
  return guard(async () => {
    const [cls, day, slots] = await Promise.all([classInfo(classId), today(), timeSlots()]);
    const [subjects, versions, homeroomTeacher] = await Promise.all([classSubjects(cls), versionsOf(classId), homeroomOf(classId)]);
    const at = date ?? day;
    const shown =
      versions.find((v) => v.startDate <= at && v.endDate >= at) ?? versions.find((v) => v.startDate > at) ?? versions.at(-1) ?? null;
    const entries = shown ? await entriesOf(shown.timetableId) : [];
    // Teachers on the first day a save could start (today, or the year's first day if it has not started).
    const teacherDate = day < cls.schoolYear.startDate ? cls.schoolYear.startDate : day;
    const teachers = await teachersOn(classId, teacherDate);
    return {
      class: { ...cls, homeroomTeacher },
      today: day,
      ended: day > cls.schoolYear.endDate,
      timeSlots: slots,
      subjects: subjects.map((s) => ({ ...s, teacher: teachers[String(s.subjectId)] ?? null })),
      teacherDate,
      versions,
      stamp: stampOf(versions),
      shown: shown ? { ...shown, entries } : null,
    };
  });
}

// ── UC-71 Create / UC-73 Update: save a version and generate the periods ───

// Ends, trims, splits or removes other versions of the class so [start, end] is free (history before `start` kept).
async function freeRange(classId, start, end, db) {
  const { rows } = await db.query(
    `SELECT timetable_id AS "id", to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate"
     FROM timetables WHERE class_id = $1 AND deleted_at IS NULL AND start_date <= $3::date AND end_date >= $2::date`,
    [classId, start, end],
  );
  for (const v of rows) {
    if (v.startDate < start && v.endDate > end) {
      // Split: the part after `end` becomes a new version with the same pattern.
      const { rows: tail } = await db.query(
        `INSERT INTO timetables (class_id, start_date, end_date, created_by)
         SELECT class_id, $2::date + 1, end_date, created_by FROM timetables WHERE timetable_id = $1
         RETURNING timetable_id AS "id"`,
        [v.id, end],
      );
      await db.query(
        `INSERT INTO timetable_entries (timetable_id, weekday, slot_id, subject_id, room)
         SELECT $2, weekday, slot_id, subject_id, room FROM timetable_entries WHERE timetable_id = $1`,
        [v.id, tail[0].id],
      );
      await db.query('UPDATE timetables SET end_date = $2::date - 1 WHERE timetable_id = $1', [v.id, start]);
    } else if (v.startDate < start) {
      await db.query('UPDATE timetables SET end_date = $2::date - 1 WHERE timetable_id = $1', [v.id, start]);
    } else if (v.endDate <= end) {
      await db.query('UPDATE timetables SET deleted_at = NOW() WHERE timetable_id = $1', [v.id]);
    } else {
      await db.query('UPDATE timetables SET start_date = $2::date + 1 WHERE timetable_id = $1', [v.id, end]);
    }
  }
}

// Periods of [start, end] for the pattern of `timetableId`, with the assigned teacher of each date (NULL = none).
// Days that already have a kept period (with attendance) in the same slot are skipped.
const PLANNED = `
  WITH planned AS (
    SELECT d::date AS "date", e.slot_id, e.subject_id, e.room, ta.teacher_id
    FROM generate_series($2::date, $3::date, INTERVAL '1 day') AS d
    JOIN timetable_entries e ON e.timetable_id = $4 AND e.weekday = EXTRACT(ISODOW FROM d)
    LEFT JOIN teaching_assignments ta
      ON ta.class_id = $1 AND ta.subject_id = e.subject_id AND ta.deleted_at IS NULL
     AND d::date BETWEEN ta.start_date AND ta.end_date
    WHERE NOT EXISTS (SELECT 1 FROM timetable_slots x WHERE x.class_id = $1 AND x."date" = d::date AND x.slot_id = e.slot_id)
  )`;

// Saves the pattern for [start, end] inside an open transaction and generates the periods. Throws 409 with the
// problems (no teacher assigned / teacher busy in another class) – the caller's transaction is then rolled back.
async function saveVersion(db, { cls, start, end, entries, userId }) {
  await freeRange(cls.classId, start, end, db);
  const { rows: created } = await db.query(
    `INSERT INTO timetables (class_id, start_date, end_date, created_by) VALUES ($1, $2::date, $3::date, $4)
     RETURNING timetable_id AS "id"`,
    [cls.classId, start, end, userId ?? null],
  );
  const timetableId = created[0].id;
  if (entries.length) {
    await db.query(
      `INSERT INTO timetable_entries (timetable_id, weekday, slot_id, subject_id, room)
       SELECT $1, w, s, sub, NULLIF(r, '')
       FROM unnest($2::smallint[], $3::bigint[], $4::bigint[], $5::text[]) AS x(w, s, sub, r)`,
      [timetableId, entries.map((e) => e.weekday), entries.map((e) => e.slotId), entries.map((e) => e.subjectId), entries.map((e) => e.room ?? '')],
    );
  }

  // business rules §10: periods of the range are generated again; periods that already have attendance stay.
  const { rows: removed } = await db.query(
    `WITH gone AS (
       DELETE FROM timetable_slots ts
       WHERE ts.class_id = $1 AND ts."date" BETWEEN $2::date AND $3::date
         AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.timetable_slot_id = ts.timetable_slot_id)
       RETURNING 1)
     SELECT COUNT(*)::int AS n FROM gone`,
    [cls.classId, start, end],
  );
  const params = [cls.classId, start, end, timetableId];

  // A subject without an assigned teacher on some dates cannot be placed (no substitute teaching, §10).
  const { rows: missing } = await db.query(
    `${PLANNED}
     SELECT s.subject_name AS "subject", to_char(MIN(p."date"), 'YYYY-MM-DD') AS "from",
            to_char(MAX(p."date"), 'YYYY-MM-DD') AS "to", COUNT(*)::int AS "periods"
     FROM planned p JOIN subjects s ON s.subject_id = p.subject_id
     WHERE p.teacher_id IS NULL
     GROUP BY s.subject_name ORDER BY MIN(p."date"), s.subject_name`,
    params,
  );
  if (missing.length) {
    throw conflict(ERROR_CODES.TIMETABLE_NO_TEACHER, 'Some subjects have no teaching assignment on some dates.', {
      className: cls.className,
      items: missing.slice(0, TIMETABLE_LIMITS.REPORT_ITEMS),
    });
  }

  // A teacher cannot teach two classes in the same period (the DB also blocks it).
  const { rows: clashes } = await db.query(
    `${PLANNED}
     SELECT to_char(p."date", 'YYYY-MM-DD') AS "date", sl.period_number AS "period", u.full_name AS "teacher",
            c2.class_name AS "otherClass", s.subject_name AS "subject"
     FROM planned p
     JOIN subjects s ON s.subject_id = p.subject_id
     JOIN timetable_slots o ON o.teacher_id = p.teacher_id AND o."date" = p."date" AND o.slot_id = p.slot_id AND o.class_id <> $1
     JOIN classes c2 ON c2.class_id = o.class_id
     JOIN time_slots sl ON sl.slot_id = p.slot_id
     JOIN teachers t ON t.teacher_id = p.teacher_id
     JOIN users u ON u.user_id = t.user_id
     ORDER BY p."date", sl.period_number
     LIMIT ${TIMETABLE_LIMITS.REPORT_ITEMS + 1}`,
    params,
  );
  if (clashes.length) {
    throw conflict(ERROR_CODES.TIMETABLE_TEACHER_CLASH, 'A teacher already teaches another class in some periods.', {
      className: cls.className,
      items: clashes.slice(0, TIMETABLE_LIMITS.REPORT_ITEMS),
      more: clashes.length > TIMETABLE_LIMITS.REPORT_ITEMS,
    });
  }

  const { rows: inserted } = await db.query(
    `${PLANNED},
     ins AS (
       INSERT INTO timetable_slots (class_id, subject_id, teacher_id, slot_id, "date", room)
       SELECT $1, subject_id, teacher_id, slot_id, "date", room FROM planned
       RETURNING 1)
     SELECT COUNT(*)::int AS n FROM ins`,
    params,
  );
  const { rows: kept } = await db.query(
    `SELECT COUNT(*)::int AS n FROM timetable_slots ts
     WHERE ts.class_id = $1 AND ts."date" BETWEEN $2::date AND $3::date
       AND EXISTS (SELECT 1 FROM attendances a WHERE a.timetable_slot_id = ts.timetable_slot_id)`,
    [cls.classId, start, end],
  );
  return { timetableId, generated: inserted[0].n, removed: removed[0].n, kept: kept[0].n };
}

// Checks the range against today and the class's school year. Returns { start, end }.
function checkRange(cls, day, startDate, endDate) {
  if (day > cls.schoolYear.endDate) throw conflict(ERROR_CODES.SCHOOL_YEAR_ENDED, 'The school year has ended.');
  const min = day > cls.schoolYear.startDate ? day : cls.schoolYear.startDate;
  const start = startDate;
  const end = endDate ?? cls.schoolYear.endDate;
  // Never back-dated: past lessons, attendance and the teachers of past days stay as they were.
  if (start < min || start > cls.schoolYear.endDate || end < start || end > cls.schoolYear.endDate) {
    throw badRequest(ERROR_CODES.TIMETABLE_RANGE, 'The range must start today or later and stay inside the school year.', {
      min,
      max: cls.schoolYear.endDate,
    });
  }
  return { start, end };
}

// Entries must use subjects of the class type and existing periods (checked after the shape in the validator).
async function checkEntries(cls, entries, db) {
  const subjects = await classSubjects(cls, db);
  const allowed = new Set(subjects.map((s) => String(s.subjectId)));
  const bad = [...new Set(entries.filter((e) => !allowed.has(String(e.subjectId))).map((e) => String(e.subjectId)))];
  if (bad.length) {
    const { rows } = await db.query('SELECT subject_name AS "name" FROM subjects WHERE subject_id = ANY($1::bigint[])', [bad]);
    throw badRequest(ERROR_CODES.TIMETABLE_SUBJECT_NOT_IN_CLASS, 'Some subjects are not taught in this class type.', {
      subjects: rows.length ? rows.map((r) => r.name) : bad,
    });
  }
  const slots = new Set((await timeSlots(db)).map((s) => String(s.slotId)));
  const index = entries.findIndex((e) => !slots.has(String(e.slotId)));
  if (index >= 0) throw badRequest(ERROR_CODES.TIMETABLE_ENTRY_INVALID, 'Unknown period.', { index, field: 'slotId' });
}

export function saveClassTimetable({ classId, startDate, endDate, entries, stamp }, user) {
  return guard(() =>
    withTransaction(async (db) => {
      const cls = await classInfo(classId, db, { lock: true }); // one save per class at a time
      // Two School Managers on the same class: the later save must not silently undo the earlier one.
      if (stamp !== undefined && stamp !== stampOf(await versionsOf(classId, db))) {
        throw conflict(ERROR_CODES.TIMETABLE_STALE, 'This timetable was changed by someone else. Reload it.');
      }
      const day = await today(db);
      const { start, end } = checkRange(cls, day, startDate, endDate);
      await checkEntries(cls, entries, db);
      const result = await saveVersion(db, { cls, start, end, entries, userId: user.userId });
      return { ...result, startDate: start, endDate: end };
    }),
  );
}

// ── UC-74 View Class Timetable / UC-75 View Teaching Schedule ───────────────

async function teacherIdOf(userId, db = pool) {
  const { rows } = await db.query('SELECT teacher_id AS "id" FROM teachers WHERE user_id = $1', [userId]);
  return rows[0]?.id ?? null;
}

// Classes the user may open (data scope, CLAUDE.md): SM all; teacher: homeroom class or a class they are assigned
// to teach; student: their classes; parent: the classes of their linked children. Returns ids as strings.
async function canViewClass(user, classId) {
  const role = user.activeRole;
  if (role === ROLES.SCHOOL_MANAGER) return true;
  let sql;
  if (role === ROLES.TEACHER) {
    sql = `SELECT 1 FROM classes c JOIN teachers t ON t.user_id = $1
           WHERE c.class_id = $2 AND (c.homeroom_teacher_id = t.teacher_id OR EXISTS (
             SELECT 1 FROM teaching_assignments ta WHERE ta.class_id = c.class_id AND ta.teacher_id = t.teacher_id AND ta.deleted_at IS NULL))`;
  } else if (role === ROLES.STUDENT) {
    sql = `SELECT 1 FROM class_enrollments e JOIN students s ON s.student_id = e.student_id
           WHERE s.user_id = $1 AND e.class_id = $2`;
  } else if (role === ROLES.PARENT) {
    sql = `SELECT 1 FROM student_parents sp JOIN parents p ON p.parent_id = sp.parent_id
           JOIN class_enrollments e ON e.student_id = sp.student_id
           WHERE p.user_id = $1 AND e.class_id = $2`;
  } else return false;
  const { rows } = await pool.query(sql, [user.userId, classId]);
  return rows.length > 0;
}

// Picker of UC-74: the classes this user can see in the current school year (parent: one entry per child).
export async function viewableClasses(user) {
  const day = await today();
  const year = currentYear(await schoolYears(), day);
  if (!year) return { schoolYear: null, items: [] };
  const role = user.activeRole;
  let rows = [];
  if (role === ROLES.SCHOOL_MANAGER) {
    ({ rows } = await pool.query(
      `SELECT c.class_id AS "classId", c.class_name AS "className", NULL AS "studentName", NULL AS "relation"
       FROM classes c JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
       WHERE c.school_year_id = $1 AND c.deleted_at IS NULL ORDER BY gl.grade_level_name, c.class_name`,
      [year.id],
    ));
  } else if (role === ROLES.TEACHER) {
    ({ rows } = await pool.query(
      `SELECT c.class_id AS "classId", c.class_name AS "className", NULL AS "studentName",
              CASE WHEN c.homeroom_teacher_id = t.teacher_id THEN 'HOMEROOM' ELSE 'TEACHING' END AS "relation"
       FROM classes c JOIN teachers t ON t.user_id = $2
       WHERE c.school_year_id = $1 AND c.deleted_at IS NULL
         AND (c.homeroom_teacher_id = t.teacher_id OR EXISTS (
           SELECT 1 FROM teaching_assignments ta WHERE ta.class_id = c.class_id AND ta.teacher_id = t.teacher_id AND ta.deleted_at IS NULL))
       ORDER BY (c.homeroom_teacher_id = t.teacher_id) DESC, c.class_name`,
      [year.id, user.userId],
    ));
  } else if (role === ROLES.STUDENT) {
    ({ rows } = await pool.query(
      `SELECT c.class_id AS "classId", c.class_name AS "className", NULL AS "studentName", 'STUDENT' AS "relation"
       FROM class_enrollments e JOIN students s ON s.student_id = e.student_id
       JOIN classes c ON c.class_id = e.class_id AND c.deleted_at IS NULL
       WHERE s.user_id = $2 AND c.school_year_id = $1 AND e.status = 'STUDYING'`,
      [year.id, user.userId],
    ));
  } else if (role === ROLES.PARENT) {
    ({ rows } = await pool.query(
      `SELECT c.class_id AS "classId", c.class_name AS "className", u.full_name AS "studentName", 'CHILD' AS "relation"
       FROM parents p JOIN student_parents sp ON sp.parent_id = p.parent_id
       JOIN students s ON s.student_id = sp.student_id JOIN users u ON u.user_id = s.user_id
       JOIN class_enrollments e ON e.student_id = s.student_id AND e.status = 'STUDYING'
       JOIN classes c ON c.class_id = e.class_id AND c.deleted_at IS NULL AND c.school_year_id = $1
       WHERE p.user_id = $2 ORDER BY u.full_name`,
      [year.id, user.userId],
    ));
  }
  return { schoolYear: year, today: day, items: rows };
}

// Monday..Sunday of the week of `date`, with the days and the periods of the school day.
async function weekFrame(date) {
  const { rows } = await pool.query(
    `SELECT to_char(w, 'YYYY-MM-DD') AS "start", to_char(w + 6, 'YYYY-MM-DD') AS "end",
            to_char(w - 7, 'YYYY-MM-DD') AS "prev", to_char(w + 7, 'YYYY-MM-DD') AS "next",
            to_char(CURRENT_DATE, 'YYYY-MM-DD') AS "today",
            ARRAY(SELECT to_char(w + i, 'YYYY-MM-DD') FROM generate_series(0, 6) AS i) AS "days"
     FROM (SELECT date_trunc('week', COALESCE($1::date, CURRENT_DATE))::date AS w) x`,
    [date ?? null],
  );
  const f = rows[0];
  return { weekStart: f.start, weekEnd: f.end, prevWeek: f.prev, nextWeek: f.next, today: f.today, days: f.days, timeSlots: await timeSlots() };
}

const LESSON_COLUMNS = `ts.timetable_slot_id AS "lessonId", to_char(ts."date", 'YYYY-MM-DD') AS "date", ts.slot_id AS "slotId",
  sl.period_number AS "period", to_char(sl.start_time, 'HH24:MI') AS "start", to_char(sl.end_time, 'HH24:MI') AS "end",
  ts.subject_id AS "subjectId", s.subject_name AS "subjectName", s.subject_code AS "subjectCode",
  ts.teacher_id AS "teacherId", u.full_name AS "teacherName", ts.room,
  ts.class_id AS "classId", c.class_name AS "className",
  EXISTS (SELECT 1 FROM attendances a WHERE a.timetable_slot_id = ts.timetable_slot_id) AS "attendanceTaken"`;
const LESSON_JOINS = `JOIN time_slots sl ON sl.slot_id = ts.slot_id
  JOIN subjects s ON s.subject_id = ts.subject_id
  JOIN teachers t ON t.teacher_id = ts.teacher_id JOIN users u ON u.user_id = t.user_id
  JOIN classes c ON c.class_id = ts.class_id`;

// GET /timetables/classes/:classId/week?date= (SCR-29 / SCR-45, detail SCR-46 is built from the same rows)
export async function classWeek({ classId, date }, user) {
  // Not allowed and not found look the same, so other classes stay hidden.
  if (!(await canViewClass(user, classId))) throw notFound(ERROR_CODES.CLASS_NOT_FOUND, 'Class not found.');
  const cls = await classInfo(classId);
  const frame = await weekFrame(date);
  const { rows: lessons } = await pool.query(
    `SELECT ${LESSON_COLUMNS} FROM timetable_slots ts ${LESSON_JOINS}
     WHERE ts.class_id = $1 AND ts."date" BETWEEN $2::date AND $3::date
     ORDER BY ts."date", sl.period_number`,
    [classId, frame.weekStart, frame.weekEnd],
  );
  const { trackId, ...publicClass } = cls;
  return { class: { ...publicClass, homeroomTeacher: await homeroomOf(classId) }, ...frame, lessons };
}

// GET /timetables/teaching-schedule/week?date= (SCR-57, detail SCR-58) – the teacher's own lessons, built from the
// timetable (which follows the teaching assignments).
export async function teachingWeek({ date }, user) {
  const teacherId = await teacherIdOf(user.userId);
  if (!teacherId) throw notFound('TEACHER_NOT_FOUND', 'Teacher not found.');
  const frame = await weekFrame(date);
  const { rows: lessons } = await pool.query(
    `SELECT ${LESSON_COLUMNS} FROM timetable_slots ts ${LESSON_JOINS}
     WHERE ts.teacher_id = $1 AND ts."date" BETWEEN $2::date AND $3::date
     ORDER BY ts."date", sl.period_number`,
    [teacherId, frame.weekStart, frame.weekEnd],
  );
  return { ...frame, lessons, periodsThisWeek: lessons.length };
}

// Used by the import (same transaction rules as the editor).
export const internals = { classInfo, today, checkRange, checkEntries, saveVersion, timeSlots, classSubjects, guard, schoolYears };
