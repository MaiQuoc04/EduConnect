// FE-10 class calendar (Dung, It3) – UC-76 View Class Calendar, UC-77 View Calendar Event Detail, UC-78 Create,
// UC-79 Update, UC-80 Delete Calendar Event. Business rules §10, permissions rows "Class calendar event", note 8 / 10.
//
// Who sees an event (by the active role):
//   TEACHER – the creator, the homeroom teacher of the class, the class's subject teachers when "all subject teachers"
//             is ticked (a teaching assignment in the class on the event's date), people picked one by one;
//   STUDENT – students studying in the class when "all students" is ticked, people picked one by one;
//   PARENT  – parents of a child studying in the class when "all parents" is ticked, people picked one by one.
// School Manager and System Admin do not see class events (permissions.md). Not visible = not found (same answer).
import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, forbidden, notFound } from '../../utils/AppError.js';
import { ERROR_CODES, NOTIFICATION, ROLES, TIME_ZONE } from './calendar.constants.js';

const conflict = (code, message, details) => new AppError(409, code, message, details);
const TZ = `'${TIME_ZONE}'`;
const LOCAL_DAY = (col) => `(${col} AT TIME ZONE ${TZ})::date`;
const LOCAL_TEXT = (col) => `to_char(${col} AT TIME ZONE ${TZ}, 'YYYY-MM-DD"T"HH24:MI')`;
const FROM_LOCAL = (param) => `(${param}::timestamp AT TIME ZONE ${TZ})`;

// Tables missing on a database that has not run the schema yet → 503 instead of a crash.
async function guard(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err?.code === '42P01') throw new AppError(503, ERROR_CODES.NOT_READY, 'Calendar tables are missing.');
    throw err;
  }
}

async function teacherIdOf(userId, db = pool) {
  const { rows } = await db.query('SELECT teacher_id AS "id" FROM teachers WHERE user_id = $1', [userId]);
  return rows[0]?.id ? String(rows[0].id) : null;
}

async function classInfo(classId, db = pool) {
  const { rows } = await db.query(
    `SELECT c.class_id AS "classId", c.class_name AS "className", c.homeroom_teacher_id AS "homeroomTeacherId",
            to_char(sy.start_date, 'YYYY-MM-DD') AS "yearStart", to_char(sy.end_date, 'YYYY-MM-DD') AS "yearEnd",
            to_char(${LOCAL_DAY('NOW()')}, 'YYYY-MM-DD') AS "today"
     FROM classes c JOIN school_years sy ON sy.school_year_id = c.school_year_id
     WHERE c.class_id = $1 AND c.deleted_at IS NULL`,
    [classId],
  );
  if (!rows.length) throw notFound('MSG_CLASS_NOT_FOUND', 'Class not found.');
  return { ...rows[0], homeroomTeacherId: rows[0].homeroomTeacherId ? String(rows[0].homeroomTeacherId) : null };
}

// ── Visibility (WHERE fragment on class_events e JOIN classes c; $1 = user id) ──────────────────────────────

const VIEWER_ROW = `EXISTS (SELECT 1 FROM class_event_viewers v WHERE v.event_id = e.event_id AND v.user_id = $1)`;
const SUBJECT_TEACHER = `EXISTS (SELECT 1 FROM teaching_assignments ta WHERE ta.class_id = e.class_id AND ta.teacher_id = t.teacher_id
    AND ta.deleted_at IS NULL AND ${LOCAL_DAY('e.start_at')} BETWEEN ta.start_date AND ta.end_date)`;

function visibleSql(role) {
  if (role === ROLES.TEACHER) {
    return `(e.created_by = $1 OR ${VIEWER_ROW} OR EXISTS (SELECT 1 FROM teachers t WHERE t.user_id = $1
              AND (c.homeroom_teacher_id = t.teacher_id OR (e.for_subject_teachers AND ${SUBJECT_TEACHER}))))`;
  }
  if (role === ROLES.STUDENT) {
    return `(${VIEWER_ROW} OR (e.for_students AND EXISTS (SELECT 1 FROM class_enrollments ce JOIN students s ON s.student_id = ce.student_id
              WHERE s.user_id = $1 AND ce.class_id = e.class_id AND ce.status = 'STUDYING')))`;
  }
  if (role === ROLES.PARENT) {
    return `(${VIEWER_ROW} OR (e.for_parents AND EXISTS (SELECT 1 FROM parents p JOIN student_parents sp ON sp.parent_id = p.parent_id
              JOIN class_enrollments ce ON ce.student_id = sp.student_id AND ce.status = 'STUDYING'
              WHERE p.user_id = $1 AND ce.class_id = e.class_id)))`;
  }
  return 'FALSE';
}

const EVENT_COLUMNS = `e.event_id AS "eventId", e.class_id AS "classId", c.class_name AS "className",
  e.subject_id AS "subjectId", s.subject_name AS "subjectName", e.category_id AS "categoryId", ec.code AS "categoryCode",
  ec.name AS "categoryName", e.title, ${LOCAL_TEXT('e.start_at')} AS "startAt", ${LOCAL_TEXT('e.end_at')} AS "endAt",
  e.for_students AS "forStudents", e.for_parents AS "forParents", e.for_subject_teachers AS "forSubjectTeachers",
  e.created_by AS "createdBy", cu.full_name AS "createdByName", (e.created_by = $1) AS "isMine",
  (e.start_at <= NOW()) AS "started"`;
const EVENT_JOINS = `FROM class_events e
  JOIN classes c ON c.class_id = e.class_id
  JOIN event_categories ec ON ec.category_id = e.category_id
  LEFT JOIN subjects s ON s.subject_id = e.subject_id
  JOIN users cu ON cu.user_id = e.created_by`;
// Parent view: names of the user's children studying in the event's class.
const CHILDREN = `(SELECT string_agg(u2.full_name, ', ' ORDER BY u2.full_name) FROM parents p2
  JOIN student_parents sp2 ON sp2.parent_id = p2.parent_id
  JOIN class_enrollments ce2 ON ce2.student_id = sp2.student_id AND ce2.status = 'STUDYING' AND ce2.class_id = e.class_id
  JOIN students st2 ON st2.student_id = sp2.student_id JOIN users u2 ON u2.user_id = st2.user_id
  WHERE p2.user_id = $1)`;

// ── UC-76: events of a date range ───────────────────────────────────────────────────────────────────────────

export function listEvents({ from, to, classId, childId }, user) {
  return guard(async () => {
    const params = [user.userId, from, to];
    let extra = '';
    if (classId) {
      params.push(classId);
      extra += ` AND e.class_id = $${params.length}`;
    }
    if (childId && user.activeRole === ROLES.PARENT) {
      params.push(childId);
      extra += ` AND EXISTS (SELECT 1 FROM parents p3 JOIN student_parents sp3 ON sp3.parent_id = p3.parent_id
                   JOIN class_enrollments ce3 ON ce3.student_id = sp3.student_id AND ce3.status = 'STUDYING'
                   WHERE p3.user_id = $1 AND sp3.student_id = $${params.length} AND ce3.class_id = e.class_id)`;
    }
    const { rows } = await pool.query(
      `SELECT ${EVENT_COLUMNS}${user.activeRole === ROLES.PARENT ? `, ${CHILDREN} AS "children"` : ''}
       ${EVENT_JOINS}
       WHERE e.deleted_at IS NULL AND c.deleted_at IS NULL
         AND ${LOCAL_DAY('e.start_at')} <= $3::date AND ${LOCAL_DAY('COALESCE(e.end_at, e.start_at)')} >= $2::date
         AND ${visibleSql(user.activeRole)}${extra}
       ORDER BY e.start_at, e.event_id`,
      params,
    );
    const { rows: now } = await pool.query(`SELECT ${LOCAL_TEXT('NOW()')} AS "now"`);
    return { from, to, now: now[0].now, events: rows };
  });
}

// ── UC-77: one event ────────────────────────────────────────────────────────────────────────────────────────

async function findVisible(eventId, user, db = pool, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${EVENT_COLUMNS}, e.description, c.homeroom_teacher_id AS "homeroomTeacherId",
            ${LOCAL_TEXT('e.created_at')} AS "createdAt", ${LOCAL_TEXT('e.updated_at')} AS "updatedAt",
            ${LOCAL_TEXT('e.reminded_at')} AS "remindedAt", (e.created_at <= e.start_at - INTERVAL '1 day') AS "willRemind",
            to_char(sy.start_date, 'YYYY-MM-DD') AS "yearStart"
     ${EVENT_JOINS} JOIN school_years sy ON sy.school_year_id = c.school_year_id
     WHERE e.event_id = $2 AND e.deleted_at IS NULL AND c.deleted_at IS NULL AND ${visibleSql(user.activeRole)}
     ${lock ? 'FOR UPDATE OF e' : ''}`,
    [user.userId, eventId],
  );
  if (!rows.length) throw notFound(ERROR_CODES.NOT_FOUND, 'Event not found.');
  return rows[0];
}

export function getEvent(eventId, user) {
  return guard(async () => {
    const ev = await findVisible(eventId, user);
    const { homeroomTeacherId, ...event } = ev;
    // Who exactly is in the audience: shown to the creator and the homeroom teacher only.
    const teacherId = user.activeRole === ROLES.TEACHER ? await teacherIdOf(user.userId) : null;
    const manager = ev.isMine || (teacherId && String(homeroomTeacherId) === teacherId);
    let viewers;
    if (manager) {
      ({ rows: viewers } = await pool.query(
        `SELECT u.user_id AS "userId", u.full_name AS "name",
                CASE WHEN EXISTS (SELECT 1 FROM students s WHERE s.user_id = u.user_id) THEN 'STUDENT'
                     WHEN EXISTS (SELECT 1 FROM teachers t WHERE t.user_id = u.user_id) THEN 'TEACHER' ELSE 'PARENT' END AS "kind"
         FROM class_event_viewers v JOIN users u ON u.user_id = v.user_id
         WHERE v.event_id = $1 ORDER BY u.full_name`,
        [eventId],
      ));
    }
    return {
      ...event,
      canEdit: ev.isMine && user.activeRole === ROLES.TEACHER && !ev.started,
      ...(manager ? { viewers } : {}),
    };
  });
}

// ── Form data: classes / subjects a teacher may use, categories, people of a class ─────────────────────────

// GET /class-events/options – classes of the current school year where the teacher is homeroom teacher or has a
// current / future teaching assignment, with the subjects and the dates of each assignment.
export function formOptions(user) {
  return guard(async () => {
    const teacherId = await teacherIdOf(user.userId);
    const { rows: categories } = await pool.query(
      'SELECT category_id AS "categoryId", code, name FROM event_categories ORDER BY category_id',
    );
    const { rows: now } = await pool.query(`SELECT ${LOCAL_TEXT('NOW()')} AS "now"`);
    if (!teacherId) return { now: now[0].now, categories, classes: [] };
    const { rows } = await pool.query(
      `SELECT c.class_id AS "classId", c.class_name AS "className", (c.homeroom_teacher_id = $1) AS "isHomeroom",
              to_char(sy.end_date, 'YYYY-MM-DD') AS "yearEnd",
              COALESCE(json_agg(json_build_object('subjectId', ta.subject_id, 'name', s.subject_name,
                'from', to_char(ta.start_date, 'YYYY-MM-DD'), 'to', to_char(ta.end_date, 'YYYY-MM-DD'))
                ORDER BY s.subject_name, ta.start_date) FILTER (WHERE ta.assignment_id IS NOT NULL), '[]') AS "subjects"
       FROM classes c
       JOIN school_years sy ON sy.school_year_id = c.school_year_id
       LEFT JOIN teaching_assignments ta ON ta.class_id = c.class_id AND ta.teacher_id = $1 AND ta.deleted_at IS NULL
            AND ta.end_date >= ${LOCAL_DAY('NOW()')}
       LEFT JOIN subjects s ON s.subject_id = ta.subject_id
       WHERE c.deleted_at IS NULL AND sy.end_date >= ${LOCAL_DAY('NOW()')}
         AND (c.homeroom_teacher_id = $1 OR ta.assignment_id IS NOT NULL)
       GROUP BY c.class_id, c.class_name, c.homeroom_teacher_id, sy.end_date
       ORDER BY (c.homeroom_teacher_id = $1) DESC, c.class_name`,
      [teacherId],
    );
    return { now: now[0].now, categories, classes: rows };
  });
}

// Students studying in the class, their parents, and the class's teachers (homeroom + any assignment this year).
async function classPeople(classId, db = pool) {
  const { rows: students } = await db.query(
    `SELECT u.user_id AS "userId", u.full_name AS "name", s.student_code AS "code", s.student_id AS "studentId"
     FROM class_enrollments ce JOIN students s ON s.student_id = ce.student_id JOIN users u ON u.user_id = s.user_id
     WHERE ce.class_id = $1 AND ce.status = 'STUDYING' ORDER BY u.full_name`,
    [classId],
  );
  const { rows: parents } = await db.query(
    `SELECT u.user_id AS "userId", u.full_name AS "name",
            string_agg(su.full_name, ', ' ORDER BY su.full_name) AS "children"
     FROM class_enrollments ce JOIN student_parents sp ON sp.student_id = ce.student_id
     JOIN parents p ON p.parent_id = sp.parent_id JOIN users u ON u.user_id = p.user_id
     JOIN students st ON st.student_id = ce.student_id JOIN users su ON su.user_id = st.user_id
     WHERE ce.class_id = $1 AND ce.status = 'STUDYING'
     GROUP BY u.user_id, u.full_name ORDER BY u.full_name`,
    [classId],
  );
  const { rows: teachers } = await db.query(
    `SELECT u.user_id AS "userId", u.full_name AS "name", (c.homeroom_teacher_id = t.teacher_id) AS "isHomeroom",
            COALESCE(string_agg(DISTINCT s.subject_name, ', '), '') AS "subjects"
     FROM classes c
     JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id OR EXISTS (
       SELECT 1 FROM teaching_assignments ta0 WHERE ta0.class_id = c.class_id AND ta0.teacher_id = t.teacher_id AND ta0.deleted_at IS NULL)
     JOIN users u ON u.user_id = t.user_id
     LEFT JOIN teaching_assignments ta ON ta.class_id = c.class_id AND ta.teacher_id = t.teacher_id AND ta.deleted_at IS NULL
     LEFT JOIN subjects s ON s.subject_id = ta.subject_id
     WHERE c.class_id = $1
     GROUP BY u.user_id, u.full_name, c.homeroom_teacher_id, t.teacher_id ORDER BY u.full_name`,
    [classId],
  );
  return { students, parents, teachers };
}

// The teacher must be homeroom teacher of the class or teach in it.
async function assertTeacherOfClass(cls, teacherId, db = pool) {
  if (cls.homeroomTeacherId === teacherId) return;
  const { rows } = await db.query(
    'SELECT 1 FROM teaching_assignments WHERE class_id = $1 AND teacher_id = $2 AND deleted_at IS NULL LIMIT 1',
    [cls.classId, teacherId],
  );
  if (!rows.length) throw forbidden(ERROR_CODES.CLASS_NOT_ALLOWED, 'You are not a teacher of this class.');
}

// GET /class-events/classes/:classId/people – for "pick people one by one".
export function people(classId, user) {
  return guard(async () => {
    const teacherId = await teacherIdOf(user.userId);
    if (!teacherId) throw forbidden(ERROR_CODES.CLASS_NOT_ALLOWED, 'You are not a teacher of this class.');
    const cls = await classInfo(classId);
    await assertTeacherOfClass(cls, teacherId);
    const p = await classPeople(classId);
    return {
      classId: cls.classId,
      className: cls.className,
      students: p.students.map(({ studentId, ...s }) => s),
      parents: p.parents,
      teachers: p.teachers.filter((t) => String(t.userId) !== String(user.userId)),
    };
  });
}

// ── UC-78 / UC-79 checks shared by create and update ───────────────────────────────────────────────────────

async function checkEvent(db, { cls, teacherId, input, userId }) {
  if (cls.today > cls.yearEnd) throw conflict(ERROR_CODES.SCHOOL_YEAR_ENDED, 'The school year has ended.');

  // Times: in the future and inside the class's school year (compared in SQL, Vietnam time).
  const { rows: t } = await db.query(
    `SELECT ${FROM_LOCAL('$1')} > NOW() AS "future", ${LOCAL_TEXT('NOW()')} AS "now"`,
    [input.startAt],
  );
  if (!t[0].future) throw badRequest(ERROR_CODES.TIME, 'The event must start later than now.', { reason: 'PAST', min: t[0].now });
  const lastDay = (input.endAt ?? input.startAt).slice(0, 10);
  if (input.startAt.slice(0, 10) < cls.yearStart || lastDay > cls.yearEnd) {
    throw badRequest(ERROR_CODES.TIME, 'The event must be inside the school year.', { reason: 'OUTSIDE_YEAR', min: cls.yearStart, max: cls.yearEnd });
  }

  const { rows: cat } = await db.query('SELECT 1 FROM event_categories WHERE category_id = $1', [input.categoryId]);
  if (!cat.length) throw badRequest(ERROR_CODES.CATEGORY, 'Unknown category.');

  // Business rules §10: a subject teacher creates events for their own subject; the homeroom teacher can also create
  // general events (no subject).
  // ASSUMPTION: "own subject" = a teaching assignment of this teacher for (class, subject) covering the event's day.
  if (!input.subjectId) {
    if (cls.homeroomTeacherId !== teacherId) throw forbidden(ERROR_CODES.GENERAL_HOMEROOM_ONLY, 'Only the homeroom teacher creates general events.');
  } else {
    const { rows } = await db.query(
      `SELECT 1 FROM teaching_assignments WHERE class_id = $1 AND subject_id = $2 AND teacher_id = $3 AND deleted_at IS NULL
         AND $4::date BETWEEN start_date AND end_date LIMIT 1`,
      [cls.classId, input.subjectId, teacherId, input.startAt.slice(0, 10)],
    );
    if (!rows.length) throw forbidden(ERROR_CODES.SUBJECT_NOT_TAUGHT, 'You do not teach this subject in this class on that day.');
  }

  // People picked one by one must belong to the class (students studying, their parents, the class's teachers).
  if (input.viewerIds.length) {
    const p = await classPeople(cls.classId, db);
    const allowed = new Set([...p.students, ...p.parents, ...p.teachers].map((x) => String(x.userId)));
    const bad = input.viewerIds.filter((id) => !allowed.has(id));
    if (bad.length) throw badRequest(ERROR_CODES.VIEWERS, 'Some people are not in this class.', { reason: 'NOT_IN_CLASS', userIds: bad });
  }
  // The creator always sees the event: no row needed for them.
  return input.viewerIds.filter((id) => id !== String(userId));
}

async function saveViewers(db, eventId, viewerIds) {
  // class_event_viewers is a hard-delete table (business rules §14).
  await db.query('DELETE FROM class_event_viewers WHERE event_id = $1', [eventId]);
  if (viewerIds.length) {
    await db.query('INSERT INTO class_event_viewers (event_id, user_id) SELECT $1, unnest($2::bigint[])', [eventId, viewerIds]);
  }
}

// Everyone who sees the event except its creator (user id + the child concerned for parents).
export const AUDIENCE_SQL = `
  WITH ev AS (SELECT * FROM class_events WHERE event_id = $1)
  SELECT DISTINCT ON (x.user_id) x.user_id, x.student_id
  FROM (
    SELECT s.user_id, s.student_id FROM ev JOIN class_enrollments ce ON ce.class_id = ev.class_id AND ce.status = 'STUDYING'
      JOIN students s ON s.student_id = ce.student_id WHERE ev.for_students
    UNION ALL
    SELECT p.user_id, sp.student_id FROM ev JOIN class_enrollments ce ON ce.class_id = ev.class_id AND ce.status = 'STUDYING'
      JOIN student_parents sp ON sp.student_id = ce.student_id JOIN parents p ON p.parent_id = sp.parent_id WHERE ev.for_parents
    UNION ALL
    SELECT t.user_id, NULL FROM ev JOIN teaching_assignments ta ON ta.class_id = ev.class_id AND ta.deleted_at IS NULL
      AND ${LOCAL_DAY('ev.start_at')} BETWEEN ta.start_date AND ta.end_date
      JOIN teachers t ON t.teacher_id = ta.teacher_id WHERE ev.for_subject_teachers
    UNION ALL
    SELECT t.user_id, NULL FROM ev JOIN classes c ON c.class_id = ev.class_id JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
    UNION ALL
    SELECT v.user_id, NULL FROM ev JOIN class_event_viewers v ON v.event_id = ev.event_id
  ) x JOIN users u ON u.user_id = x.user_id AND u.status = 'ACTIVE'
  WHERE x.user_id <> (SELECT created_by FROM ev)
  ORDER BY x.user_id, x.student_id NULLS LAST`;

// One notification + one recipient row per person of the audience (business rules §9).
export async function notifyAudience(db, { eventId, title, detail, personal, createdBy }) {
  const { rows } = await db.query(
    `INSERT INTO notifications (type, title, detail, is_personal, target_type, target_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING notification_id AS "id"`,
    [NOTIFICATION.TYPE, title.slice(0, 255), detail, personal, NOTIFICATION.TARGET, eventId, createdBy],
  );
  const { rowCount } = await db.query(
    `INSERT INTO notification_recipients (notification_id, user_id, student_id)
     SELECT $2, a.user_id, a.student_id FROM (${AUDIENCE_SQL}) a`,
    [eventId, rows[0].id],
  );
  return rowCount;
}

const vnTime = (local) => `${local.slice(11, 16)} ${local.slice(8, 10)}/${local.slice(5, 7)}/${local.slice(0, 4)}`;

// ── UC-78 Create ────────────────────────────────────────────────────────────────────────────────────────────

export function createEvent(input, user) {
  return guard(async () => {
    const eventId = await withTransaction(async (db) => {
      const teacherId = await teacherIdOf(user.userId, db);
      if (!teacherId) throw forbidden(ERROR_CODES.CLASS_NOT_ALLOWED, 'You are not a teacher of this class.');
      const cls = await classInfo(input.classId, db);
      await assertTeacherOfClass(cls, teacherId, db);
      const viewerIds = await checkEvent(db, { cls, teacherId, input, userId: user.userId });
      const { rows } = await db.query(
        `INSERT INTO class_events (class_id, subject_id, category_id, title, description, start_at, end_at,
                                   for_students, for_parents, for_subject_teachers, created_by)
         VALUES ($1, $2, $3, $4, $5, ${FROM_LOCAL('$6')}, ${FROM_LOCAL('$7')}, $8, $9, $10, $11)
         RETURNING event_id AS "id"`,
        [cls.classId, input.subjectId, input.categoryId, input.title, input.description, input.startAt, input.endAt,
          input.forStudents, input.forParents, input.forSubjectTeachers, user.userId],
      );
      const id = String(rows[0].id);
      await saveViewers(db, id, viewerIds);
      // Business rules §9: the bell covers new events.
      // ASSUMPTION: a general (not personal) notification when the event is created; none on update or delete.
      await notifyAudience(db, {
        eventId: id,
        title: `Lớp ${cls.className}: ${input.title}`,
        detail: `Sự kiện mới lúc ${vnTime(input.startAt)}.`,
        personal: false,
        createdBy: user.userId,
      });
      return id;
    });
    return getEvent(eventId, user);
  });
}

// ── UC-79 Update / UC-80 Delete (creator only, before the event starts) ─────────────────────────────────────

async function ownEvent(db, eventId, user) {
  const ev = await findVisible(eventId, user, db, { lock: true });
  if (!ev.isMine) throw forbidden(ERROR_CODES.NOT_OWNER, 'Only the creator can change this event.');
  // ASSUMPTION: an event that has started is kept as it is (it is history for the class).
  if (ev.started) throw conflict(ERROR_CODES.STARTED, 'The event has already started.');
  return ev;
}

export function updateEvent(eventId, input, user) {
  return guard(async () => {
    await withTransaction(async (db) => {
      const teacherId = await teacherIdOf(user.userId, db);
      const ev = await ownEvent(db, eventId, user);
      if (!teacherId) throw forbidden(ERROR_CODES.CLASS_NOT_ALLOWED, 'You are not a teacher of this class.');
      const cls = await classInfo(ev.classId, db);
      const viewerIds = await checkEvent(db, { cls, teacherId, input, userId: user.userId });
      // Business rules §10: the 1-day reminder is sent again when the time changes.
      await db.query(
        `UPDATE class_events SET subject_id = $2, category_id = $3, title = $4, description = $5,
                start_at = ${FROM_LOCAL('$6')}, end_at = ${FROM_LOCAL('$7')},
                for_students = $8, for_parents = $9, for_subject_teachers = $10,
                reminded_at = CASE WHEN start_at <> ${FROM_LOCAL('$6')} THEN NULL ELSE reminded_at END,
                updated_at = NOW()
         WHERE event_id = $1`,
        [eventId, input.subjectId, input.categoryId, input.title, input.description, input.startAt, input.endAt,
          input.forStudents, input.forParents, input.forSubjectTeachers],
      );
      await saveViewers(db, eventId, viewerIds);
    });
    return getEvent(eventId, user);
  });
}
