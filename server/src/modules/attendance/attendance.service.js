import { pool, withTransaction } from '../../config/db.js';
import { badRequest, forbidden } from '../../utils/AppError.js';
import { vietnameseNameOrder } from '../../utils/nameSort.js';
import {
  ABSENCES,
  MODES,
  MORNING_LAST_PERIOD,
  NOTE_MAX,
  REASON_MAX,
  STATUSES,
  STATUS_LABELS,
  TODAY_SQL,
} from './attendance.constants.js';
import {
  classSubjectScope,
  contextOf,
  deadlineTime,
  LESSON_COLUMNS,
  LESSON_JOINS,
  loadClass,
  loadLesson,
  parseDate,
  parseId,
  resolveMode,
} from './attendance.scope.js';

// FE-12 Attendance (owner: Quoc): UC-90 Take Attendance, UC-91 Edit Attendance and the day view of SCR-56 / SCR-52.
// Business rules §12 (agreed details 18/11/2026) and §9 (notifications).

// --- Pickers -------------------------------------------------------------------------------------------------------

// School years with their semesters, grade levels, the current year / semester and the deadline of the day.
export async function options() {
  const { rows: years } = await pool.query(
    `SELECT sy.school_year_id AS "schoolYearId", sy.year_name AS "yearName", sy.start_date <= ${TODAY_SQL} AS started,
            COALESCE(json_agg(json_build_object('semesterId', se.semester_id, 'semesterNo', se.semester_no,
                       'startDate', to_char(se.start_date, 'YYYY-MM-DD'), 'endDate', to_char(se.end_date, 'YYYY-MM-DD'),
                       'status', se.status, 'started', se.start_date <= ${TODAY_SQL},
                       'current', ${TODAY_SQL} BETWEEN se.start_date AND se.end_date)
                     ORDER BY se.semester_no) FILTER (WHERE se.semester_id IS NOT NULL), '[]') AS semesters
     FROM school_years sy LEFT JOIN semesters se ON se.school_year_id = sy.school_year_id
     GROUP BY sy.school_year_id ORDER BY sy.start_date DESC`,
  );
  const { rows: gradeLevels } = await pool.query(
    'SELECT grade_level_id AS "gradeLevelId", grade_level_name AS "gradeLevelName" FROM grade_levels ORDER BY grade_level_name',
  );
  const { rows: today } = await pool.query(`SELECT to_char(${TODAY_SQL}, 'YYYY-MM-DD') AS today`);
  const current = years.find((y) => y.started) ?? years[years.length - 1] ?? null;
  const semesters = current?.semesters ?? [];
  const currentSemester =
    semesters.find((s) => s.current) ?? [...semesters].reverse().find((s) => s.started) ?? semesters[0] ?? null;
  return {
    years: years.map(({ started, ...y }) => y),
    gradeLevels,
    currentYearId: current?.schoolYearId ?? null,
    currentSemesterId: currentSemester?.semesterId ?? null,
    today: today[0].today,
    deadline: await deadlineTime(),
  };
}

// Classes of a school year the caller may open: School Manager every class, a teacher the classes they teach (any
// assignment that year) and their homeroom class.
export async function listClasses(query, user) {
  const ctx = await contextOf(user);
  const yearId = query.schoolYearId ? parseId(query.schoolYearId, 'NOT_FOUND', 'School year not found.') : null;
  const { rows } = await pool.query(
    `SELECT c.class_id AS "classId", c.class_name AS "className", g.grade_level_name AS "gradeLevelName",
            c.homeroom_teacher_id IS NOT NULL AND c.homeroom_teacher_id = $2 AS "isHomeroom"
     FROM classes c JOIN grade_levels g ON g.grade_level_id = c.grade_level_id
     WHERE c.deleted_at IS NULL
       AND c.school_year_id = COALESCE($1::bigint, (SELECT school_year_id FROM school_years
                                                     WHERE start_date <= ${TODAY_SQL} ORDER BY start_date DESC LIMIT 1))
       AND ($3::boolean OR c.homeroom_teacher_id = $2
            OR EXISTS (SELECT 1 FROM teaching_assignments ta
                       WHERE ta.class_id = c.class_id AND ta.teacher_id = $2 AND ta.deleted_at IS NULL))
     ORDER BY g.grade_level_name, c.class_name`,
    [yearId, ctx.teacherId ?? -1, ctx.role === 'SCHOOL_MANAGER'],
  );
  return { items: rows };
}

// --- Periods of a day ----------------------------------------------------------------------------------------------

const lessonOut = (ctx, row) => {
  const { mode, blocked } = resolveMode(ctx, row);
  return {
    lessonId: row.lessonId,
    date: row.date,
    period: row.period,
    start: row.start,
    end: row.end,
    classId: row.classId,
    className: row.className,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    teacherId: row.teacherId,
    teacherName: row.teacherName,
    room: row.room,
    started: row.started,
    taken: Number(row.recordCount) > 0,
    counts: row.counts ?? null,
    mine: ctx.teacherId !== null && String(row.teacherId) === String(ctx.teacherId),
    mode,
    blocked: blocked ?? null,
  };
};

// Status counts of each period (for the lists).
const COUNTS_SQL = `(SELECT json_build_object(
    'PRESENT', COUNT(*) FILTER (WHERE a.status = 'PRESENT'), 'LATE', COUNT(*) FILTER (WHERE a.status = 'LATE'),
    'ABSENT_EXCUSED', COUNT(*) FILTER (WHERE a.status = 'ABSENT_EXCUSED'),
    'ABSENT_UNEXCUSED', COUNT(*) FILTER (WHERE a.status = 'ABSENT_UNEXCUSED'))
  FROM attendances a WHERE a.timetable_slot_id = ts.timetable_slot_id) AS counts`;

// GET /attendances/my-lessons?date= – a teacher's own periods of one day (default today), the start of SCR-56.
export async function myLessons(query, user) {
  const ctx = await contextOf(user);
  const deadline = await deadlineTime();
  const { rows: d } = await pool.query(`SELECT to_char(COALESCE($1::date, ${TODAY_SQL}), 'YYYY-MM-DD') AS day`, [
    parseDate(query.date),
  ]);
  const { rows } = await pool.query(
    `SELECT ${LESSON_COLUMNS}, ${COUNTS_SQL} FROM timetable_slots ts ${LESSON_JOINS}
     WHERE ts.teacher_id = $2 AND ts."date" = $3::date
     ORDER BY sl.period_number`,
    [deadline, ctx.teacherId ?? -1, d[0].day],
  );
  return { date: d[0].day, deadline, items: rows.map((r) => lessonOut(ctx, r)) };
}

// GET /attendances/classes/:classId/lessons?date= – the periods of a class on a day (SCR-56 / SCR-52). A subject
// teacher sees only the subjects they teach there; the homeroom teacher and School Manager see every period.
export async function classLessons(classId, query, user) {
  const ctx = await contextOf(user);
  const cls = await loadClass(pool, classId);
  const subjectIds = await classSubjectScope(pool, ctx, cls);
  const deadline = await deadlineTime();
  const { rows: d } = await pool.query(`SELECT to_char(COALESCE($1::date, ${TODAY_SQL}), 'YYYY-MM-DD') AS day`, [
    parseDate(query.date),
  ]);
  const { rows } = await pool.query(
    `SELECT ${LESSON_COLUMNS}, ${COUNTS_SQL} FROM timetable_slots ts ${LESSON_JOINS}
     WHERE ts.class_id = $2 AND ts."date" = $3::date AND ($4::bigint[] IS NULL OR ts.subject_id = ANY($4::bigint[]))
     ORDER BY sl.period_number`,
    [deadline, cls.classId, d[0].day, subjectIds],
  );
  return {
    class: cls,
    date: d[0].day,
    deadline,
    scope: subjectIds === null ? 'ALL' : 'SUBJECTS',
    items: rows.map((r) => lessonOut(ctx, r)),
  };
}

// --- The sheet of one period ---------------------------------------------------------------------------------------

/**
 * Students of the sheet (§12 point 2): enrolled in the class on or before the date and not left by then, plus anyone
 * who already has a record for this period (so nothing recorded is ever hidden). Name order as the other lists.
 */
async function sheetRows(db, lesson) {
  const { rows } = await db.query(
    `SELECT e.enrollment_id AS "enrollmentId", e.status AS "enrollmentStatus", s.student_id AS "studentId",
            s.student_code AS "studentCode", u.full_name AS "fullName",
            a.attendance_id AS "attendanceId", a.status, a.note,
            a.taken_at AS "takenAt", a.updated_at AS "updatedAt", a.auto_from_slot_id AS "autoFromLessonId",
            (SELECT sl2.period_number FROM timetable_slots ts2 JOIN time_slots sl2 ON sl2.slot_id = ts2.slot_id
             WHERE ts2.timetable_slot_id = a.auto_from_slot_id) AS "autoFromPeriod",
            (e.enrolled_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= $2::date
              AND (e.left_at IS NULL OR (e.left_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date > $2::date) AS "onRoll"
     FROM class_enrollments e
     JOIN students s ON s.student_id = e.student_id
     JOIN users u ON u.user_id = s.user_id
     LEFT JOIN attendances a ON a.enrollment_id = e.enrollment_id AND a.timetable_slot_id = $3
     WHERE e.class_id = $1
       AND (a.attendance_id IS NOT NULL
            OR ((e.enrolled_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= $2::date
                AND (e.left_at IS NULL OR (e.left_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date > $2::date)))
     ORDER BY ${vietnameseNameOrder('u.full_name')}, e.enrollment_id`,
    [lesson.classId, lesson.date, lesson.lessonId],
  );
  return rows;
}

function sheetOut(lesson, rows) {
  const { recordCount, homeroomTeacherId, schoolYearId, beforeDeadline, yearEnded, ...info } = lesson;
  // Periods this sheet was filled from automatically (§12 point 3, 26/11/2026), e.g. [1] → "Tự điền theo tiết 1".
  const autoFromPeriods = [...new Set(rows.filter((r) => r.autoFromPeriod).map((r) => Number(r.autoFromPeriod)))].sort(
    (a, b) => a - b,
  );
  return {
    lesson: { ...info, taken: rows.some((r) => r.attendanceId), autoFromPeriods },
    mode: lesson.mode,
    blocked: lesson.blocked ?? null,
    reasonRequired: lesson.mode === MODES.HOMEROOM || lesson.mode === MODES.MANAGER,
    students: rows.map((r) => ({
      enrollmentId: r.enrollmentId,
      studentId: r.studentId,
      studentCode: r.studentCode,
      fullName: r.fullName,
      onRoll: r.onRoll,
      status: r.status ?? null,
      note: r.note ?? '',
      updatedAt: r.updatedAt ?? r.takenAt ?? null,
      autoFromPeriod: r.autoFromPeriod ?? null, // null = recorded by a person
    })),
  };
}

// GET /attendances/lessons/:lessonId – the sheet (UC-90 / UC-91) with what the caller may do.
export async function getSheet(lessonId, user) {
  const ctx = await contextOf(user);
  const lesson = await loadLesson(pool, ctx, lessonId);
  const rows = await sheetRows(pool, lesson);
  const sheet = sheetOut(lesson, rows);
  if (!sheet.lesson.taken && (lesson.mode === MODES.TEACHER || lesson.mode === MODES.MANAGER)) {
    sheet.prefill = await prefillOf(pool, lesson);
  }
  return sheet;
}

/**
 * What a later period of the session gets from an earlier one (lead, 26/11/2026, business rules §12 point 3):
 * an absence stays with its note; late becomes present; present stays present; notes of present / late are dropped.
 */
function copiedFrom(source) {
  if (source && ABSENCES.includes(source.status)) return { status: source.status, note: source.note ?? null };
  return { status: 'PRESENT', note: null };
}

const sameSessionSql = (period) =>
  period <= MORNING_LAST_PERIOD ? `sl.period_number <= ${MORNING_LAST_PERIOD}` : `sl.period_number > ${MORNING_LAST_PERIOD}`;

/**
 * Draft of a period not taken yet that has no automatic row (a session saved before the automatic filling of
 * 26/11/2026): the nearest earlier period of the same class, day and session (morning 1–5 / afternoon 6–10) that is
 * taken, with the copy rule of copiedFrom(). Nothing is stored; the period stays "not taken" until it is saved.
 * Students not in `records` start as present on the client. null when no earlier period of the session is taken.
 */
async function prefillOf(db, lesson) {
  const sameSession = sameSessionSql(lesson.period);
  const { rows: src } = await db.query(
    `SELECT ts.timetable_slot_id AS "lessonId", sl.period_number AS "period", sj.subject_name AS "subjectName",
            tu.full_name AS "teacherName"
     FROM timetable_slots ts
     JOIN time_slots sl ON sl.slot_id = ts.slot_id
     JOIN subjects sj ON sj.subject_id = ts.subject_id
     JOIN teachers t ON t.teacher_id = ts.teacher_id JOIN users tu ON tu.user_id = t.user_id
     WHERE ts.class_id = $1 AND ts."date" = $2::date AND sl.period_number < $3 AND ${sameSession}
       AND EXISTS (SELECT 1 FROM attendances a WHERE a.timetable_slot_id = ts.timetable_slot_id)
     ORDER BY sl.period_number DESC
     LIMIT 1`,
    [lesson.classId, lesson.date, lesson.period],
  );
  if (!src[0]) return null;
  const { rows } = await db.query(
    `SELECT enrollment_id AS "enrollmentId", status, note FROM attendances WHERE timetable_slot_id = $1`,
    [src[0].lessonId],
  );
  return {
    ...src[0],
    records: Object.fromEntries(
      rows.map((r) => {
        const copy = copiedFrom(r);
        return [r.enrollmentId, { status: copy.status, note: copy.note ?? '' }];
      }),
    ),
  };
}

// GET /attendances/lessons/:lessonId/history – every action on the period, newest first.
export async function lessonHistory(lessonId, user) {
  const ctx = await contextOf(user);
  const lesson = await loadLesson(pool, ctx, lessonId);
  const { rows } = await pool.query(
    `SELECT h.history_id AS "historyId", h.old_status AS "oldStatus", h.new_status AS "newStatus", h.reason,
            h.changed_at AS "changedAt", cu.full_name AS "changedByName",
            s.student_code AS "studentCode", su.full_name AS "studentName"
     FROM attendance_histories h
     JOIN attendances a ON a.attendance_id = h.attendance_id
     JOIN class_enrollments e ON e.enrollment_id = a.enrollment_id
     JOIN students s ON s.student_id = e.student_id JOIN users su ON su.user_id = s.user_id
     JOIN users cu ON cu.user_id = h.changed_by
     WHERE a.timetable_slot_id = $1
     ORDER BY h.changed_at DESC, h.history_id DESC`,
    [lesson.lessonId],
  );
  return { items: rows };
}

// --- Saving (UC-90 / UC-91) ----------------------------------------------------------------------------------------

function readRecords(body) {
  const list = body?.records;
  if (!Array.isArray(list) || list.length === 0 || list.length > 200) {
    throw badRequest('MSG_ATTENDANCE_RECORDS', 'Send the students of the period.');
  }
  const seen = new Set();
  return list.map((r) => {
    const enrollmentId = Number(r?.enrollmentId);
    if (!Number.isInteger(enrollmentId) || enrollmentId < 1 || seen.has(enrollmentId)) {
      throw badRequest('MSG_ATTENDANCE_RECORDS', 'Each student must appear once.');
    }
    seen.add(enrollmentId);
    if (!STATUSES.includes(r?.status)) throw badRequest('MSG_ATTENDANCE_STATUS', 'Unknown attendance status.');
    if (r.note !== undefined && r.note !== null && typeof r.note !== 'string') {
      throw badRequest('MSG_ATTENDANCE_RECORDS', 'The note must be text.');
    }
    const note = (r.note ?? '').trim();
    if ([...note].length > NOTE_MAX) throw badRequest('MSG_ATTENDANCE_NOTE_TOO_LONG', 'The note is too long.', { max: NOTE_MAX });
    return { enrollmentId, status: r.status, note: note || null };
  });
}

function readReason(body, required) {
  const raw = body?.reason;
  if (raw !== undefined && raw !== null && typeof raw !== 'string') throw badRequest('MSG_ATTENDANCE_REASON_REQUIRED', 'Reason must be text.');
  const reason = (raw ?? '').trim();
  if (required && !reason) throw badRequest('MSG_ATTENDANCE_REASON_REQUIRED', 'Please give the reason of the change.');
  if ([...reason].length > REASON_MAX) {
    throw badRequest('MSG_REASON_TOO_LONG', 'The reason is too long.', { max: REASON_MAX });
  }
  return reason || null;
}

const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// One personal notification to the student and their linked parents (active accounts), §9 / §12 – one per period.
// autoFromPeriod: the old status was filled automatically from that period (never sent to the family), so the text
// says "from period X on" instead of "changed from".
async function notifyStudent(client, { lesson, row, oldStatus, newStatus, reason, actorId, autoFromPeriod = null }) {
  const { rows: recipients } = await client.query(
    // FE-09 (18/11/2026): the student under STUDENT, each linked parent under PARENT (notification_recipients.role_code).
    `SELECT u.user_id, 'STUDENT' AS role_code FROM students s JOIN users u ON u.user_id = s.user_id
     WHERE s.student_id = $1 AND u.status = 'ACTIVE'
     UNION
     SELECT u.user_id, 'PARENT' FROM student_parents sp JOIN parents p ON p.parent_id = sp.parent_id JOIN users u ON u.user_id = p.user_id
     WHERE sp.student_id = $1 AND u.status = 'ACTIVE'`,
    [row.studentId],
  );
  if (!recipients.length) return 0;
  const where = `tiết ${lesson.period} – ${lesson.subjectName}, ngày ${dmy(lesson.date)}`;
  if (oldStatus && autoFromPeriod) {
    const title = `${row.fullName}: ${STATUS_LABELS[newStatus]} từ tiết ${lesson.period} – ${lesson.subjectName}, ngày ${dmy(lesson.date)}`;
    const detail =
      `Học sinh ${row.fullName} (lớp ${lesson.className}) được ghi nhận “${STATUS_LABELS[newStatus]}” từ tiết ${lesson.period} ` +
      `(${lesson.start}–${lesson.end}); trước đó hệ thống tự điền “${STATUS_LABELS[oldStatus]}” theo tiết ${autoFromPeriod}.` +
      `${reason ? ` Lý do: ${reason}.` : ''}${row.note ? ` Ghi chú của giáo viên: ${row.note}` : ''}`;
    return insertNotification(client, { title, detail, row, recipients, actorId });
  }
  const title = oldStatus
    ? `${row.fullName}: điểm danh ${where} đổi thành ${STATUS_LABELS[newStatus]}`
    : `${row.fullName}: ${STATUS_LABELS[newStatus]} ${where}`;
  const detail = oldStatus
    ? `Điểm danh của học sinh ${row.fullName} (lớp ${lesson.className}) ${where} (${lesson.start}–${lesson.end}) đã được ` +
      `cập nhật từ “${STATUS_LABELS[oldStatus]}” thành “${STATUS_LABELS[newStatus]}”.${reason ? ` Lý do: ${reason}.` : ''}`
    : `Học sinh ${row.fullName} (lớp ${lesson.className}) được ghi nhận “${STATUS_LABELS[newStatus]}” ${where} ` +
      `(${lesson.start}–${lesson.end}).${row.note ? ` Ghi chú của giáo viên: ${row.note}` : ''}`;
  return insertNotification(client, { title, detail, row, recipients, actorId });
}

async function insertNotification(client, { title, detail, row, recipients, actorId }) {
  const { rows } = await client.query(
    `INSERT INTO notifications (type, title, detail, is_personal, target_type, target_id, created_by)
     VALUES ('ATTENDANCE', $1, $2, TRUE, 'ATTENDANCE', $3, $4) RETURNING notification_id AS "id"`,
    [[...title].slice(0, 255).join(''), detail, row.attendanceId, actorId],
  );
  await client.query(
    `INSERT INTO notification_recipients (notification_id, user_id, role_code, student_id)
     SELECT $1, UNNEST($2::bigint[]), UNNEST($3::varchar[]), $4`,
    [rows[0].id, recipients.map((r) => r.user_id), recipients.map((r) => r.role_code), row.studentId],
  );
  return recipients.length;
}

const MODE_ERRORS = {
  MSG_ATTENDANCE_NOT_STARTED: 'The period has not started yet.',
  MSG_ATTENDANCE_DEADLINE_PASSED: 'The time to take or edit this period has passed.',
  MSG_SEMESTER_CLOSED: 'The semester is closed.',
  MSG_SCHOOL_YEAR_ENDED: 'The school year has ended.',
  MSG_ATTENDANCE_VIEW_ONLY: 'You can only view this period.',
};

/**
 * PUT /attendances/lessons/:lessonId { records: [{ enrollmentId, status, note }], reason }
 * - TEACHER: the whole class every time (§12 point 3); reason optional.
 * - MANAGER: the whole class when nothing is recorded yet (entering a missed period, point 4), else only the students
 *   sent; reason required.
 * - HOMEROOM: only recorded students, only excused <-> unexcused (note kept); reason required.
 * Every status written goes to attendance_histories; notifications follow §12. Notes alone are not history.
 */
export async function saveSheet(lessonId, body, user) {
  const ctx = await contextOf(user);
  const records = readRecords(body);
  const result = await withTransaction(async (client) => {
    // The period row is locked: two saves of the same period run one after the other.
    const lesson = await loadLesson(client, ctx, lessonId, { forUpdate: true });
    if (lesson.mode === MODES.VIEW) throw forbidden(lesson.blocked, MODE_ERRORS[lesson.blocked] ?? MODE_ERRORS.MSG_ATTENDANCE_VIEW_ONLY);
    const reason = readReason(body, lesson.mode !== MODES.TEACHER);
    const rows = await sheetRows(client, lesson);
    const byId = new Map(rows.map((r) => [Number(r.enrollmentId), r]));
    const taken = rows.some((r) => r.attendanceId);

    for (const r of records) {
      if (!byId.has(r.enrollmentId)) throw badRequest('MSG_ATTENDANCE_NOT_IN_CLASS', 'A student is not on this period’s list.');
    }
    const fullClassNeeded = lesson.mode === MODES.TEACHER || (lesson.mode === MODES.MANAGER && !taken);
    if (fullClassNeeded) {
      const sent = new Set(records.map((r) => r.enrollmentId));
      const missing = rows.filter((r) => r.onRoll && !sent.has(Number(r.enrollmentId)));
      if (missing.length) {
        throw badRequest('MSG_ATTENDANCE_INCOMPLETE', 'Every student of the class must have a status.', { missing: missing.length });
      }
    }

    let changed = 0;
    let notified = 0;
    for (const r of records) {
      const row = byId.get(r.enrollmentId);
      const oldStatus = row.status ?? null;
      if (lesson.mode === MODES.HOMEROOM) {
        if (oldStatus === r.status) continue;
        if (!oldStatus || !ABSENCES.includes(oldStatus) || !ABSENCES.includes(r.status)) {
          throw forbidden('MSG_ATTENDANCE_HOMEROOM_ONLY', 'The homeroom teacher can only switch excused and unexcused absences.');
        }
      }
      const note = lesson.mode === MODES.HOMEROOM ? row.note ?? null : r.note;
      if (!oldStatus) {
        const { rows: ins } = await client.query(
          `INSERT INTO attendances (enrollment_id, timetable_slot_id, status, note, taken_by, taken_at)
           VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING attendance_id AS "id"`,
          [r.enrollmentId, lesson.lessonId, r.status, note, ctx.userId],
        );
        row.attendanceId = ins[0].id;
      } else if (oldStatus !== r.status || (row.note ?? null) !== note) {
        // A person changed this student here: the row is no longer automatic and is never overwritten again (§12 p. 3).
        await client.query('UPDATE attendances SET status = $2, note = $3, auto_from_slot_id = NULL WHERE attendance_id = $1', [
          row.attendanceId,
          r.status,
          note,
        ]);
      }
      if (oldStatus === r.status) continue; // note only: nothing for the history or the family
      await client.query(
        `INSERT INTO attendance_histories (attendance_id, old_status, new_status, reason, changed_by, changed_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [row.attendanceId, oldStatus, r.status, reason, ctx.userId],
      );
      changed += 1;
      if (r.status !== 'PRESENT' || (oldStatus && oldStatus !== 'PRESENT')) {
        notified += await notifyStudent(client, {
          lesson,
          row: { ...row, note },
          oldStatus,
          newStatus: r.status,
          reason,
          actorId: ctx.userId,
          autoFromPeriod: row.autoFromLessonId ? row.autoFromPeriod : null,
        });
      }
    }
    const autoFilled = await fillLaterPeriods(client, lesson, ctx.userId);
    return { lesson, changed, notified, firstTake: !taken, autoFilled };
  });
  const sheet = await getSheet(lessonId, user);
  return {
    ...sheet,
    saved: { changed: result.changed, notified: result.notified, firstTake: result.firstTake, autoFilled: result.autoFilled },
  };
}

/**
 * Automatic filling of the later periods of the session (lead, 26/11/2026, business rules §12 point 3), inside the
 * transaction of the save. From the period just saved, for each student, the later periods of the same class, day and
 * session get copiedFrom(the student's row here) – in period order, up to the first later period where a person
 * recorded that student (auto_from_slot_id NULL), which is left as it is. New rows and changed statuses go to the
 * history with the reason "Tự điền theo tiết N"; nothing is sent to the family (only a person's save notifies).
 * The later periods are locked in period order (the saved period, earlier, is already locked), so two saves of the
 * same session cannot cross. Returns the number of rows written.
 */
async function fillLaterPeriods(client, lesson, actorId) {
  const { rows: later } = await client.query(
    `SELECT ts.timetable_slot_id AS "lessonId", sl.period_number AS "period"
     FROM timetable_slots ts JOIN time_slots sl ON sl.slot_id = ts.slot_id
     WHERE ts.class_id = $1 AND ts."date" = $2::date AND sl.period_number > $3 AND ${sameSessionSql(lesson.period)}
     ORDER BY sl.period_number, ts.timetable_slot_id
     FOR UPDATE OF ts`,
    [lesson.classId, lesson.date, lesson.period],
  );
  if (!later.length) return 0;

  // The roll of the day is the same for every period of the date; the source rows as they are after the save.
  const roll = await sheetRows(client, lesson);
  const source = new Map(roll.filter((r) => r.attendanceId).map((r) => [Number(r.enrollmentId), r]));
  const students = roll.filter((r) => r.onRoll || r.attendanceId).map((r) => Number(r.enrollmentId));
  const reason = `Tự điền theo tiết ${lesson.period}`;
  const stopped = new Set(); // students recorded by a person in a later period: nothing after it is touched
  let written = 0;

  for (const target of later) {
    const { rows: existing } = await client.query(
      `SELECT attendance_id AS "attendanceId", enrollment_id AS "enrollmentId", status, note,
              auto_from_slot_id AS "autoFrom"
       FROM attendances WHERE timetable_slot_id = $1`,
      [target.lessonId],
    );
    const byStudent = new Map(existing.map((r) => [Number(r.enrollmentId), r]));
    for (const enrollmentId of students) {
      if (stopped.has(enrollmentId)) continue;
      const current = byStudent.get(enrollmentId);
      if (current && current.autoFrom === null) {
        stopped.add(enrollmentId);
        continue;
      }
      const copy = copiedFrom(source.get(enrollmentId));
      if (!current) {
        const { rows: ins } = await client.query(
          `INSERT INTO attendances (enrollment_id, timetable_slot_id, status, note, taken_by, taken_at, auto_from_slot_id)
           VALUES ($1, $2, $3, $4, $5, NOW(), $6) RETURNING attendance_id AS "id"`,
          [enrollmentId, target.lessonId, copy.status, copy.note, actorId, lesson.lessonId],
        );
        await client.query(
          `INSERT INTO attendance_histories (attendance_id, old_status, new_status, reason, changed_by, changed_at)
           VALUES ($1, NULL, $2, $3, $4, NOW())`,
          [ins[0].id, copy.status, reason, actorId],
        );
        written += 1;
        continue;
      }
      const sameStatus = current.status === copy.status;
      if (sameStatus && (current.note ?? null) === copy.note && Number(current.autoFrom) === Number(lesson.lessonId)) continue;
      await client.query(
        'UPDATE attendances SET status = $2, note = $3, auto_from_slot_id = $4 WHERE attendance_id = $1',
        [current.attendanceId, copy.status, copy.note, lesson.lessonId],
      );
      if (!sameStatus) {
        await client.query(
          `INSERT INTO attendance_histories (attendance_id, old_status, new_status, reason, changed_by, changed_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [current.attendanceId, current.status, copy.status, reason, actorId],
        );
      }
      written += 1;
    }
  }
  return written;
}

