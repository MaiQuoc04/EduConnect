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
