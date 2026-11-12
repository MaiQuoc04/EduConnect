import ExcelJS from 'exceljs';
import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, forbidden, notFound } from '../../utils/AppError.js';
import { vietnameseNameOrder } from '../../utils/nameSort.js';
import { containsPattern, VI_TRANSLATE } from '../../utils/search.js';
import { emitToUsers } from '../../sockets/index.js';
import { activeMemberIds } from '../conversations/conversations.service.js';
import { groupScopeSql } from '../groups/groupAccess.js';
import {
  ACTIVITY_LIMITS, ACTIVITY_STATUS, ERROR_CODES, NOTIFICATION, REGISTRATION_STATUS, ROLES, TIME_ZONE,
} from './extracurricular.constants.js';

// FE-07 Extracurricular Event Management (Dung, It3), UC-50..UC-57. business-rules §7:
//   - an activity = a post in the class feed (FE-05 `posts`, its text is the description) + an `extracurricular_events`
//     row (title, place, time, registration deadline, optional capacity);
//   - the class's CURRENT homeroom teacher (active role TEACHER) creates, updates, cancels it and sees / exports the
//     registration list (permissions note 5) – also an activity created by the previous homeroom teacher;
//   - parents register / cancel a child of theirs who studies in the class, before the deadline; either parent; one
//     row per student (re-registering reuses it, §14: CANCELLED instead of delete); students only look;
//   - whoever sees the post sees the activity (FE-05 rules: class feed members, live post or the moderator);
//   - an ended school year is read only; an activity that has started can no longer change (class history).
// Personal notifications (business-rules §9) are written here until FE-09 exists; the deadline reminder is
// sendActivityDeadlineReminders() (extracurricular.reminders.js) for FE-09's scheduled job.

const conflict = (code, message, details) => new AppError(409, code, message, details);
const activityNotFound = () => notFound(ERROR_CODES.NOT_FOUND, 'The activity was not found.');

// 42P01 / 42703: tables or the title column missing (patch_v0.3_activity_title.sql not run) → 503, not a crash.
async function guard(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err?.code === '42P01' || err?.code === '42703') {
      throw new AppError(503, ERROR_CODES.NOT_READY, 'Run database/patch_v0.3_activity_title.sql first.');
    }
    throw err;
  }
}

const LOCAL = (col) => `to_char(${col} AT TIME ZONE '${TIME_ZONE}', 'YYYY-MM-DD"T"HH24:MI')`;
const TS = (param) => `(${param}::timestamp AT TIME ZONE '${TIME_ZONE}')`;
const STUDYING = `'STUDYING'`;

// Students still studying in the class who are registered (capacity and "đã đăng ký" count only them).
// After a FOR UPDATE wait the statement's snapshot is old: countRegistered() reads it again in a new statement.
const REGISTERED_COUNT = `(SELECT COUNT(*)::int FROM event_registrations r
   JOIN class_enrollments rce ON rce.student_id = r.student_id AND rce.class_id = c.class_id AND rce.status = ${STUDYING}
   WHERE r.event_id = ev.event_id AND r.status = 'REGISTERED')`;
const CLASS_SIZE = `(SELECT COUNT(*)::int FROM class_enrollments sce WHERE sce.class_id = c.class_id AND sce.status = ${STUDYING})`;

// Version of what the homeroom teacher edits (UC-51 stale-save check).
const STAMP = `md5(row(ev.title, p.content, ev.location, ev.start_at, ev.end_at, ev.registration_deadline, ev.capacity,
  ev.status)::text)`;

// Columns of an activity; $1 = user id, $2 = active role (isHomeroom).
const COLUMNS = `ev.event_id AS "eventId", ev.post_id AS "postId", p.group_id AS "groupId", c.class_id AS "classId",
  c.class_name AS "className", ev.title, p.content AS "description", ev.location,
  ${LOCAL('ev.start_at')} AS "startAt", ${LOCAL('ev.end_at')} AS "endAt",
  ${LOCAL('ev.registration_deadline')} AS "registrationDeadline", ev.capacity, ev.status,
  ${LOCAL('ev.cancelled_at')} AS "cancelledAt", ${LOCAL('p.created_at')} AS "createdAt", ${LOCAL('p.updated_at')} AS "updatedAt",
  p.author_id AS "authorId", au.full_name AS "authorName", p.is_hidden AS "isHidden", p.is_pinned AS "isPinned",
  ${REGISTERED_COUNT} AS "registeredCount", ${CLASS_SIZE} AS "classSize",
  (NOW() <= ev.registration_deadline) AS "beforeDeadline", (NOW() >= ev.start_at) AS "started",
  (NOW() >= COALESCE(ev.end_at, ev.start_at)) AS "ended", COALESCE(CURRENT_DATE > sy.end_date, FALSE) AS "yearEnded",
  ($2 = 'TEACHER' AND COALESCE(ht.user_id = $1, FALSE)) AS "isHomeroom", ${STAMP} AS "stamp"`;
const FROM = `FROM extracurricular_events ev
  JOIN posts p ON p.post_id = ev.post_id AND p.deleted_at IS NULL
  JOIN groups g ON g.group_id = p.group_id
  JOIN classes c ON c.class_id = g.class_id AND c.deleted_at IS NULL
  JOIN school_years sy ON sy.school_year_id = c.school_year_id
  JOIN users au ON au.user_id = p.author_id
  LEFT JOIN teachers ht ON ht.teacher_id = c.homeroom_teacher_id`;
// Visible = the class feed is open to the user (FE-04 groupScopeSql, active role) and the post is live or the user is
// the class's homeroom teacher (FE-05: moderator sees hidden posts).
const VISIBLE = `${groupScopeSql('$1', '$2')} AND g.group_type = 'GENERAL'
  AND ((p.approval_status = 'APPROVED' AND NOT p.is_hidden) OR ($2 = 'TEACHER' AND COALESCE(ht.user_id = $1, FALSE)))`;

async function countRegistered(db, a) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM event_registrations r
     JOIN class_enrollments ce ON ce.student_id = r.student_id AND ce.class_id = $2 AND ce.status = ${STUDYING}
     WHERE r.event_id = $1 AND r.status = 'REGISTERED'`,
    [a.eventId, a.classId],
  );
  return rows[0].n;
}

// What the user may do now; the client shows buttons from these flags, every action checks again.
function permissions(a, role) {
  const open = a.status === ACTIVITY_STATUS.OPEN && !a.yearEnded;
  return {
    edit: a.isHomeroom && open && !a.started,
    cancel: a.isHomeroom && open && !a.started,
    viewRegistrations: a.isHomeroom,
    register: role === ROLES.PARENT && open && a.beforeDeadline,
  };
}

function shape(a, role) {
  const { stamp, ...rest } = a;
  return { ...rest, ...(a.isHomeroom ? { stamp } : {}), can: permissions(a, role) };
}

async function findActivity(db, user, eventId, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} ${FROM} WHERE ev.event_id = $3 AND ${VISIBLE} ${lock ? 'FOR UPDATE OF ev' : ''}`,
    [user.userId, user.activeRole, eventId],
  );
  if (!rows.length) throw activityNotFound();
  return rows[0];
}

// --- Children / registration of the viewer (UC-53) ------------------------------------------------------------------

// Parent: their children studying in the class, with the registration of each. Student: their own row.
async function myRegistrations(db, user, a) {
  if (user.activeRole === ROLES.PARENT) {
    const { rows } = await db.query(
      `SELECT s.student_id AS "studentId", su.full_name AS "fullName", s.student_code AS "studentCode",
              r.status, ${LOCAL('r.registered_at')} AS "registeredAt", ${LOCAL('r.cancelled_at')} AS "cancelledAt",
              rb.full_name AS "registeredByName", (r.registered_by = $1) AS "byMe"
       FROM parents pa
       JOIN student_parents sp ON sp.parent_id = pa.parent_id
       JOIN students s ON s.student_id = sp.student_id
       JOIN users su ON su.user_id = s.user_id
       JOIN class_enrollments ce ON ce.student_id = s.student_id AND ce.class_id = $2 AND ce.status = ${STUDYING}
       LEFT JOIN event_registrations r ON r.event_id = $3 AND r.student_id = s.student_id
       LEFT JOIN users rb ON rb.user_id = r.registered_by
       WHERE pa.user_id = $1
       ORDER BY ${vietnameseNameOrder('su.full_name')}, s.student_id`,
      [user.userId, a.classId, a.eventId],
    );
    return rows.map((r) => ({ ...r, status: r.status ?? null }));
  }
  if (user.activeRole === ROLES.STUDENT) {
    const { rows } = await db.query(
      `SELECT s.student_id AS "studentId", su.full_name AS "fullName", r.status,
              ${LOCAL('r.registered_at')} AS "registeredAt", rb.full_name AS "registeredByName"
       FROM students s JOIN users su ON su.user_id = s.user_id
       LEFT JOIN event_registrations r ON r.event_id = $2 AND r.student_id = s.student_id
       LEFT JOIN users rb ON rb.user_id = r.registered_by
       WHERE s.user_id = $1`,
      [user.userId, a.eventId],
    );
    return rows.map((r) => ({ ...r, status: r.status ?? null }));
  }
  return [];
}

// --- Lists ----------------------------------------------------------------------------------------------------------

// Classes whose activities the user may list: homeroom classes (teacher, permissions note 5), own class (student),
// children's classes (parent); newest school year first.
async function listClasses(db, user) {
  const role = user.activeRole;
  const sql = {
    TEACHER: `SELECT c.class_id AS "classId", c.class_name AS "className", NULL::text AS "childName",
                (CURRENT_DATE > sy.end_date) AS "yearEnded", sy.start_date, c.class_id AS cid
              FROM classes c JOIN school_years sy ON sy.school_year_id = c.school_year_id
              JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
              WHERE t.user_id = $1 AND c.deleted_at IS NULL`,
    STUDENT: `SELECT c.class_id AS "classId", c.class_name AS "className", NULL::text AS "childName",
                (CURRENT_DATE > sy.end_date) AS "yearEnded", sy.start_date, c.class_id AS cid
              FROM students s JOIN class_enrollments ce ON ce.student_id = s.student_id
              JOIN classes c ON c.class_id = ce.class_id AND c.deleted_at IS NULL
              JOIN school_years sy ON sy.school_year_id = c.school_year_id
              WHERE s.user_id = $1`,
    PARENT: `SELECT c.class_id AS "classId", c.class_name AS "className", su.full_name AS "childName",
               (CURRENT_DATE > sy.end_date) AS "yearEnded", sy.start_date, c.class_id AS cid
             FROM parents pa JOIN student_parents sp ON sp.parent_id = pa.parent_id
             JOIN students s ON s.student_id = sp.student_id JOIN users su ON su.user_id = s.user_id
             JOIN class_enrollments ce ON ce.student_id = s.student_id
             JOIN classes c ON c.class_id = ce.class_id AND c.deleted_at IS NULL
             JOIN school_years sy ON sy.school_year_id = c.school_year_id
             WHERE pa.user_id = $1`,
  }[role];
  if (!sql) return [];
  // groupId = the class feed (GENERAL group), for the "Bảng tin lớp" links.
  const { rows } = await db.query(
    `SELECT x.*, (SELECT g.group_id FROM groups g WHERE g.class_id = x.cid AND g.group_type = 'GENERAL'
                  AND g.deleted_at IS NULL ORDER BY g.group_id LIMIT 1) AS "groupId"
     FROM (${sql}) x ORDER BY start_date DESC, "className", "childName"`,
    [user.userId],
  );
  // One entry per class; a parent with two children in it sees both names.
  const byClass = new Map();
  for (const r of rows) {
    const k = String(r.classId);
    if (!byClass.has(k)) {
      byClass.set(k, { classId: r.classId, className: r.className, groupId: r.groupId, yearEnded: r.yearEnded, children: [] });
    }
    if (r.childName) byClass.get(k).children.push(r.childName);
  }
  return [...byClass.values()];
}

// UC-53 list screen: the activities of one class (default: the first class of the list), upcoming / past / all.
export async function listActivities(user, { classId, status }) {
  return guard(async () => {
    const classes = await listClasses(pool, user);
    const cls = classId ? classes.find((c) => String(c.classId) === classId) : classes[0];
    if (!cls) return { classes, classId: null, items: [], counts: { upcoming: 0, past: 0 } };
    const { rows } = await pool.query(
      `SELECT ${COLUMNS} ${FROM}
       WHERE c.class_id = $3 AND ${VISIBLE}
       ORDER BY (ev.status = 'OPEN' AND NOW() < COALESCE(ev.end_at, ev.start_at)) DESC,
                CASE WHEN ev.status = 'OPEN' AND NOW() < COALESCE(ev.end_at, ev.start_at) THEN ev.start_at END ASC,
                ev.start_at DESC, ev.event_id DESC`,
      [user.userId, user.activeRole, cls.classId],
    );
    const isPast = (a) => a.status === ACTIVITY_STATUS.CANCELLED || a.ended;
    const counts = { upcoming: rows.filter((a) => !isPast(a)).length, past: rows.filter(isPast).length };
    const items = rows.filter((a) => status === 'all' || (status === 'past' ? isPast(a) : !isPast(a)));
    // Parents / students: their own registration on each card (one query).
    let mine = new Map();
    if (items.length && [ROLES.PARENT, ROLES.STUDENT].includes(user.activeRole)) {
      const { rows: regs } = await pool.query(
        `SELECT r.event_id AS "eventId", COUNT(*) FILTER (WHERE r.status = 'REGISTERED')::int AS "registered"
         FROM event_registrations r JOIN students s ON s.student_id = r.student_id
         WHERE r.event_id = ANY($2::bigint[]) AND (
           s.user_id = $1 OR EXISTS (SELECT 1 FROM student_parents sp JOIN parents pa ON pa.parent_id = sp.parent_id
                                     WHERE sp.student_id = s.student_id AND pa.user_id = $1))
         GROUP BY r.event_id`,
        [user.userId, items.map((a) => a.eventId)],
      );
      mine = new Map(regs.map((r) => [String(r.eventId), r.registered]));
    }
    const isManager = user.activeRole === ROLES.TEACHER;
    return {
      classes,
      classId: cls.classId,
      canCreate: isManager && !cls.yearEnded,
      counts,
      items: items.map((a) => ({ ...shape(a, user.activeRole), myRegistered: mine.get(String(a.eventId)) ?? 0 })),
    };
  });
}

// --- UC-53 View Event Detail ----------------------------------------------------------------------------------------

export async function getActivity(user, eventId) {
  return guard(async () => {
    const a = await findActivity(pool, user, eventId);
    return { ...shape(a, user.activeRole), registrations: await myRegistrations(pool, user, a) };
  });
}

// Before patch_v0.3_activity_title.sql the title column is missing. The FE-05 hooks below run inside FE-05's
// transactions, where a failing query would abort the whole transaction (the post would not be saved), so they ask
// first with a query that cannot fail. A positive answer is kept for the life of the process.
let tableReady = false;
async function activitiesReady(db) {
  if (tableReady) return true;
  const { rows } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema() AND table_name = 'extracurricular_events'
                      AND column_name = 'title') AS ok`,
  );
  tableReady = rows[0].ok === true;
  return tableReady;
}

// Summaries for the FE-05 feed (Khanh's posts.service decorate): post id → activity card data. One query per page.
export async function activitiesOfPosts(postIds, db = pool) {
  if (!postIds.length || !(await activitiesReady(db))) return new Map();
  const { rows } = await db.query(
    `SELECT ev.post_id AS "postId", ev.event_id AS "eventId", ev.title, ev.location,
            ${LOCAL('ev.start_at')} AS "startAt", ${LOCAL('ev.end_at')} AS "endAt",
            ${LOCAL('ev.registration_deadline')} AS "registrationDeadline", ev.capacity, ev.status,
            ${REGISTERED_COUNT} AS "registeredCount", (NOW() <= ev.registration_deadline) AS "beforeDeadline",
            (NOW() >= ev.start_at) AS "started", (NOW() >= COALESCE(ev.end_at, ev.start_at)) AS "ended"
     FROM extracurricular_events ev JOIN posts p ON p.post_id = ev.post_id
     JOIN groups g ON g.group_id = p.group_id JOIN classes c ON c.class_id = g.class_id
     WHERE ev.post_id = ANY($1::bigint[])`,
    [postIds],
  );
  return new Map(rows.map((r) => [String(r.postId), r]));
}

// FE-05 edit / delete of a post that carries an activity: refused, the activity has its own screens (UC-51, UC-52).
export async function assertNotActivity(db, postId) {
  if (!(await activitiesReady(db))) return; // no activity can exist before the patch
  const { rows } = await db.query('SELECT 1 FROM extracurricular_events WHERE post_id = $1', [postId]);
  if (rows.length) throw conflict(ERROR_CODES.POST_IS_ACTIVITY, 'This post is an extracurricular activity; update or cancel the activity instead.');
}

// --- Notifications (until FE-09) -----------------------------------------------------------------------------------

// Parents (with the child concerned) and / or students of the class still studying, active accounts only.
// extra: SQL condition on s (students) – e.g. only registered children. $1 = class id, $2 = event id.
function audienceSql({ parents, students, extra = 'TRUE' }) {
  const parts = [];
  if (parents) {
    parts.push(`SELECT pu.user_id, s.student_id FROM class_enrollments ce JOIN students s ON s.student_id = ce.student_id
      JOIN student_parents sp ON sp.student_id = s.student_id JOIN parents pa ON pa.parent_id = sp.parent_id
      JOIN users pu ON pu.user_id = pa.user_id
      WHERE ce.class_id = $1 AND ce.status = ${STUDYING} AND pu.status = 'ACTIVE' AND ${extra}`);
  }
  if (students) {
    parts.push(`SELECT su.user_id, s.student_id FROM class_enrollments ce JOIN students s ON s.student_id = ce.student_id
      JOIN users su ON su.user_id = s.user_id
      WHERE ce.class_id = $1 AND ce.status = ${STUDYING} AND su.status = 'ACTIVE' AND ${extra}`);
  }
  return parts.join(' UNION ALL ');
}

/**
 * One personal notification and its recipients (one row per user: a parent of two children gets one, with the first
 * child as student_id). Returns the number of recipients. createdBy null = system (reminder job).
 */
export async function notify(db, { classId, eventId, title, detail, createdBy, audience, skipUserId = null }) {
  const { rows } = await db.query(
    `WITH n AS (
       INSERT INTO notifications (type, title, detail, is_personal, target_type, target_id, created_by, created_at)
       SELECT $3, $4, $5, TRUE, $6, $2, $7, NOW()
       WHERE EXISTS (SELECT 1 FROM (${audienceSql(audience)}) a WHERE a.user_id IS DISTINCT FROM $8::bigint)
       RETURNING notification_id
     ), ins AS (
       INSERT INTO notification_recipients (notification_id, user_id, student_id)
       SELECT DISTINCT ON (a.user_id) n.notification_id, a.user_id, a.student_id
       FROM n CROSS JOIN (${audienceSql(audience)}) a
       WHERE a.user_id IS DISTINCT FROM $8::bigint
       ORDER BY a.user_id, a.student_id
       RETURNING 1
     )
     SELECT COUNT(*)::int AS n FROM ins`,
    [classId, eventId, NOTIFICATION.TYPE, title.slice(0, 255), detail, NOTIFICATION.TARGET, createdBy, skipUserId],
  );
  return rows[0].n;
}

const vnTime = (local) => (local ? `${local.slice(11, 16)} ${local.slice(8, 10)}/${local.slice(5, 7)}/${local.slice(0, 4)}` : '');
function whenText(a) {
  if (!a.endAt) return vnTime(a.startAt);
  return a.endAt.slice(0, 10) === a.startAt.slice(0, 10)
    ? `${a.startAt.slice(11, 16)} – ${vnTime(a.endAt)}`
    : `${vnTime(a.startAt)} – ${vnTime(a.endAt)}`;
}
const detailText = (a) => `Thời gian: ${whenText(a)}. Địa điểm: ${a.location}. Hạn đăng ký: ${vnTime(a.registrationDeadline)}.`
  + `${a.capacity ? ` Chỉ tiêu: ${a.capacity} học sinh.` : ''}`;

// Real-time signal of FE-05 for the class feed (ids only; the client reloads through the API).
function feedSignal(groupId, postId, change) {
  (async () => {
    emitToUsers(await activeMemberIds(pool, groupId), 'post:changed', { groupId, postId, change });
  })().catch((err) => console.error(`[extracurricular] post:changed ${postId} not sent:`, err?.message));
}

// --- UC-50 Create Event / UC-51 Update Event -----------------------------------------------------------------------

// The class as the homeroom teacher manages it: year, GENERAL group, time checks against the year.
async function homeroomClass(db, user, classId, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT c.class_id AS "classId", c.class_name AS "className", t.user_id AS "homeroomUserId",
            to_char(sy.start_date, 'YYYY-MM-DD') AS "yearStart", to_char(sy.end_date, 'YYYY-MM-DD') AS "yearEnd",
            (CURRENT_DATE > sy.end_date) AS "yearEnded",
            (SELECT g.group_id FROM groups g WHERE g.class_id = c.class_id AND g.group_type = 'GENERAL'
               AND g.deleted_at IS NULL ORDER BY g.group_id LIMIT 1) AS "groupId"
     FROM classes c JOIN school_years sy ON sy.school_year_id = c.school_year_id
     LEFT JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
     WHERE c.class_id = $1 AND c.deleted_at IS NULL ${lock ? 'FOR SHARE OF c' : ''}`,
    [classId],
  );
  const cls = rows[0];
  // Not the homeroom teacher of an existing class → 403 (a teacher may name any class id; nothing more is revealed).
  if (!cls || user.activeRole !== ROLES.TEACHER || String(cls.homeroomUserId) !== String(user.userId)) {
    throw forbidden(ERROR_CODES.NOT_HOMEROOM, 'Only the homeroom teacher of the class manages its activities.');
  }
  if (cls.yearEnded) throw conflict(ERROR_CODES.YEAR_ENDED, 'The school year has ended.');
  if (!cls.groupId) throw conflict(ERROR_CODES.NO_FEED, 'The class has no class feed.');
  return cls;
}

// Times against now and the school year. Deadline in the past is refused only when it changes (an update that keeps
// a passed deadline leaves registration closed).
async function checkTimes(db, cls, input, before = null) {
  const { rows } = await db.query(
    `SELECT ${TS('$1')} <= NOW() AS "startPast", ${TS('$2')} <= NOW() AS "deadlinePast"`,
    [input.startAt, input.registrationDeadline],
  );
  if (rows[0].startPast) throw badRequest(ERROR_CODES.TIME, 'The activity must start in the future.', { reason: 'START_PAST' });
  if (rows[0].deadlinePast && (!before || before.registrationDeadline !== input.registrationDeadline)) {
    throw badRequest(ERROR_CODES.TIME, 'The registration deadline must be in the future.', { reason: 'DEADLINE_PAST' });
  }
  const lastDay = (input.endAt ?? input.startAt).slice(0, 10);
  if (input.startAt.slice(0, 10) < cls.yearStart || lastDay > cls.yearEnd) {
    throw badRequest(ERROR_CODES.TIME, 'The activity must take place within the school year.', {
      reason: 'OUTSIDE_YEAR', min: cls.yearStart, max: cls.yearEnd,
    });
  }
}

export async function createActivity(user, input) {
  return guard(async () => {
    const created = await withTransaction(async (db) => {
      const cls = await homeroomClass(db, user, input.classId, { lock: true });
      await checkTimes(db, cls, input);
      const { rows: post } = await db.query(
        `INSERT INTO posts (group_id, author_id, content, approval_status, reviewed_by, reviewed_at, created_at)
         VALUES ($1, $2, $3, 'APPROVED', $2, NOW(), NOW()) RETURNING post_id AS "postId"`,
        [cls.groupId, user.userId, input.description],
      );
      const { rows: ev } = await db.query(
        `INSERT INTO extracurricular_events (post_id, title, location, start_at, end_at, registration_deadline, capacity, status)
         VALUES ($1, $2, $3, ${TS('$4')}, ${TS('$5')}, ${TS('$6')}, $7, 'OPEN') RETURNING event_id AS "eventId"`,
        [post[0].postId, input.title, input.location, input.startAt, input.endAt, input.registrationDeadline, input.capacity],
      );
      const a = { ...input, eventId: ev[0].eventId };
      // "Registration opened": parents (with the child) and students of the class.
      const recipients = await notify(db, {
        classId: cls.classId, eventId: a.eventId, createdBy: user.userId, skipUserId: user.userId,
        audience: { parents: true, students: true },
        title: `Lớp ${cls.className}: hoạt động ngoại khoá mới – ${input.title}`,
        detail: `${detailText(a)} Phụ huynh đăng ký cho con trên EduConnect trước hạn.`,
      });
      return { eventId: a.eventId, postId: post[0].postId, groupId: cls.groupId, recipients };
    });
    feedSignal(created.groupId, created.postId, 'created');
    return { ...(await getActivity(user, created.eventId)), notified: created.recipients };
  });
}

// The activity as its current homeroom teacher may change it: visible, homeroom, year open, OPEN, not started.
async function managedActivity(db, user, eventId) {
  const a = await findActivity(db, user, eventId, { lock: true });
  if (!a.isHomeroom) throw forbidden(ERROR_CODES.NOT_HOMEROOM, 'Only the homeroom teacher of the class manages its activities.');
  if (a.yearEnded) throw conflict(ERROR_CODES.YEAR_ENDED, 'The school year has ended.');
  if (a.status === ACTIVITY_STATUS.CANCELLED) throw conflict(ERROR_CODES.CANCELLED, 'The activity was cancelled.');
  if (a.started) throw conflict(ERROR_CODES.STARTED, 'The activity has started.');
  return a;
}

export async function updateActivity(user, eventId, input) {
  return guard(async () => {
    const result = await withTransaction(async (db) => {
      const a = await managedActivity(db, user, eventId);
      if (input.stamp && input.stamp !== a.stamp) {
        throw conflict(ERROR_CODES.CHANGED, 'The activity was changed after you opened it.', { stamp: a.stamp });
      }
      const cls = await homeroomClass(db, user, a.classId);
      await checkTimes(db, cls, input, a);
      const registered = await countRegistered(db, a);
      if (input.capacity !== null && input.capacity < registered) {
        throw badRequest(ERROR_CODES.CAPACITY, 'Capacity is below the number of registered students.', {
          reason: 'BELOW_REGISTERED', registered,
        });
      }
      const same = a.title === input.title && a.description === input.description && a.location === input.location
        && a.startAt === input.startAt && (a.endAt ?? null) === input.endAt
        && a.registrationDeadline === input.registrationDeadline && (a.capacity ?? null) === input.capacity;
      if (same) return { a, changed: false };
      await db.query('UPDATE posts SET content = $2, updated_at = NOW() WHERE post_id = $1', [a.postId, input.description]);
      await db.query(
        `UPDATE extracurricular_events SET title = $2, location = $3, start_at = ${TS('$4')}, end_at = ${TS('$5')},
           registration_deadline = ${TS('$6')}, capacity = $7
         WHERE event_id = $1`,
        [a.eventId, input.title, input.location, input.startAt, input.endAt, input.registrationDeadline, input.capacity],
      );
      // Registered families hear about a new time, place or deadline (business-rules §9 personal notifications).
      let notified = 0;
      const moved = a.startAt !== input.startAt || (a.endAt ?? null) !== input.endAt || a.location !== input.location
        || a.registrationDeadline !== input.registrationDeadline;
      if (moved) {
        notified = await notify(db, {
          classId: a.classId, eventId: a.eventId, createdBy: user.userId, skipUserId: user.userId,
          audience: { parents: true, extra: `EXISTS (SELECT 1 FROM event_registrations r WHERE r.event_id = $2
                         AND r.student_id = s.student_id AND r.status = 'REGISTERED')` },
          title: `Lớp ${a.className}: thay đổi hoạt động ngoại khoá – ${input.title}`,
          detail: `Thông tin mới. ${detailText({ ...input })}`,
        });
      }
      return { a, changed: true, notified };
    });
    if (result.changed) feedSignal(result.a.groupId, result.a.postId, 'updated');
    return { ...(await getActivity(user, eventId)), changed: result.changed, notified: result.notified ?? 0 };
  });
}

// --- UC-52 Cancel Event ---------------------------------------------------------------------------------------------

export async function cancelActivity(user, eventId) {
  return guard(async () => {
    const result = await withTransaction(async (db) => {
      const a = await managedActivity(db, user, eventId);
      await db.query(`UPDATE extracurricular_events SET status = 'CANCELLED', cancelled_at = NOW() WHERE event_id = $1`, [a.eventId]);
      await db.query('UPDATE posts SET updated_at = NOW() WHERE post_id = $1', [a.postId]);
      const notified = await notify(db, {
        classId: a.classId, eventId: a.eventId, createdBy: user.userId, skipUserId: user.userId,
        audience: { parents: true, extra: `EXISTS (SELECT 1 FROM event_registrations r WHERE r.event_id = $2
                       AND r.student_id = s.student_id AND r.status = 'REGISTERED')` },
        title: `Lớp ${a.className}: huỷ hoạt động ngoại khoá – ${a.title}`,
        detail: `Hoạt động dự kiến ${whenText(a)} tại ${a.location} đã bị huỷ. Đăng ký của con không còn hiệu lực.`,
      });
      return { a, notified };
    });
    feedSignal(result.a.groupId, result.a.postId, 'updated');
    return { ...(await getActivity(user, eventId)), notified: result.notified };
  });
}

// --- UC-54 Register Child / UC-55 Cancel Child Registration (parent) ------------------------------------------------

async function parentChild(db, user, a, studentId) {
  const { rows } = await db.query(
    `SELECT su.full_name AS "fullName" FROM parents pa
     JOIN student_parents sp ON sp.parent_id = pa.parent_id AND sp.student_id = $2
     JOIN students s ON s.student_id = sp.student_id JOIN users su ON su.user_id = s.user_id
     JOIN class_enrollments ce ON ce.student_id = s.student_id AND ce.class_id = $3 AND ce.status = ${STUDYING}
     WHERE pa.user_id = $1`,
    [user.userId, studentId, a.classId],
  );
  if (!rows.length) throw forbidden(ERROR_CODES.CHILD, 'You can only register your own child who studies in this class.');
  return rows[0];
}

async function registrationActivity(db, user, eventId) {
  if (user.activeRole !== ROLES.PARENT) throw forbidden('FORBIDDEN', 'Only parents register a child.');
  const a = await findActivity(db, user, eventId, { lock: true }); // the lock serialises the capacity check
  if (a.yearEnded) throw conflict(ERROR_CODES.YEAR_ENDED, 'The school year has ended.');
  if (a.status === ACTIVITY_STATUS.CANCELLED) throw conflict(ERROR_CODES.CANCELLED, 'The activity was cancelled.');
  if (!a.beforeDeadline) throw conflict(ERROR_CODES.CLOSED, 'The registration deadline has passed.');
  return a;
}

export async function registerChild(user, eventId, { studentId }) {
  return guard(async () => {
    await withTransaction(async (db) => {
      const a = await registrationActivity(db, user, eventId);
      await parentChild(db, user, a, studentId);
      const { rows: cur } = await db.query(
        'SELECT status FROM event_registrations WHERE event_id = $1 AND student_id = $2',
        [a.eventId, studentId],
      );
      if (cur[0]?.status === REGISTRATION_STATUS.REGISTERED) {
        throw conflict(ERROR_CODES.ALREADY_REGISTERED, 'The child is already registered.');
      }
      if (a.capacity !== null && (await countRegistered(db, a)) >= a.capacity) {
        throw conflict(ERROR_CODES.FULL, 'The activity is full.', { capacity: a.capacity });
      }
      await db.query(
        `INSERT INTO event_registrations (event_id, student_id, registered_by, status, registered_at)
         VALUES ($1, $2, $3, 'REGISTERED', NOW())
         ON CONFLICT (event_id, student_id) DO UPDATE
         SET status = 'REGISTERED', registered_by = EXCLUDED.registered_by, registered_at = NOW(), cancelled_at = NULL`,
        [a.eventId, studentId, user.userId],
      );
    });
    return getActivity(user, eventId);
  });
}

export async function cancelRegistration(user, eventId, studentId) {
  return guard(async () => {
    await withTransaction(async (db) => {
      const a = await registrationActivity(db, user, eventId);
      await parentChild(db, user, a, studentId);
      const { rows: done } = await db.query(
        `UPDATE event_registrations SET status = 'CANCELLED', cancelled_at = NOW()
         WHERE event_id = $1 AND student_id = $2 AND status = 'REGISTERED' RETURNING registration_id`,
        [a.eventId, studentId],
      );
      if (!done.length) throw conflict(ERROR_CODES.NOT_REGISTERED, 'The child is not registered.');
    });
    return getActivity(user, eventId);
  });
}

// --- UC-56 View Registration List / UC-57 Export Registration List (homeroom teacher) ------------------------------

const RELATION = { FATHER: 'Bố', MOTHER: 'Mẹ', GUARDIAN: 'Người giám hộ' };

// Every student studying in the class, plus students no longer in it who registered; status NONE = never registered.
async function registrationRows(db, a, { search, status }) {
  const params = [a.eventId, a.classId, VI_TRANSLATE.from, VI_TRANSLATE.to];
  const fold = (col) => `lower(translate(${col}, $3, $4))`;
  const pattern = containsPattern(search, ACTIVITY_LIMITS.SEARCH_MAX);
  let where = 'TRUE';
  if (pattern) {
    params.push(pattern);
    where = `(${fold('su.full_name')} LIKE $${params.length} OR lower(s.student_code) LIKE $${params.length}
              OR ${fold("COALESCE(rb.full_name, '')")} LIKE $${params.length})`;
  }
  const { rows } = await db.query(
    `WITH people AS (
       SELECT ce.student_id FROM class_enrollments ce WHERE ce.class_id = $2 AND ce.status = ${STUDYING}
       UNION SELECT r.student_id FROM event_registrations r WHERE r.event_id = $1
     )
     SELECT s.student_id AS "studentId", s.student_code AS "studentCode", su.full_name AS "fullName",
            to_char(s.dob, 'YYYY-MM-DD') AS dob, COALESCE(r.status, 'NONE') AS status,
            ${LOCAL('r.registered_at')} AS "registeredAt", ${LOCAL('r.cancelled_at')} AS "cancelledAt",
            rb.full_name AS "registeredByName", rb.phone AS "registeredByPhone", sp.relationship_type AS "relationship",
            EXISTS (SELECT 1 FROM class_enrollments x WHERE x.student_id = s.student_id AND x.class_id = $2
                    AND x.status = ${STUDYING}) AS "inClass"
     FROM people JOIN students s ON s.student_id = people.student_id JOIN users su ON su.user_id = s.user_id
     LEFT JOIN event_registrations r ON r.event_id = $1 AND r.student_id = s.student_id
     LEFT JOIN users rb ON rb.user_id = r.registered_by
     LEFT JOIN parents rp ON rp.user_id = r.registered_by
     LEFT JOIN student_parents sp ON sp.parent_id = rp.parent_id AND sp.student_id = s.student_id
     WHERE ${where}
     ORDER BY ${vietnameseNameOrder('su.full_name')}, s.student_id`,
    params,
  );
  const counts = { all: rows.length, REGISTERED: 0, CANCELLED: 0, NONE: 0 };
  rows.forEach((r) => { counts[r.status] += 1; });
  const shown = status === 'all' ? rows : rows.filter((r) => r.status === status);
  return {
    counts,
    rows: shown.map((r) => ({ ...r, relationship: r.relationship ? RELATION[r.relationship] ?? r.relationship : null })),
  };
}

async function homeroomActivity(db, user, eventId) {
  const a = await findActivity(db, user, eventId);
  if (!a.isHomeroom) throw forbidden(ERROR_CODES.NOT_HOMEROOM, 'Only the homeroom teacher of the class sees the registrations.');
  return a;
}

export async function listRegistrations(user, eventId, query) {
  return guard(async () => {
    const a = await homeroomActivity(pool, user, eventId);
    const list = await registrationRows(pool, a, query);
    return { activity: shape(a, user.activeRole), status: query.status, search: query.search, ...list };
  });
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const STATUS_TEXT = { REGISTERED: 'Đã đăng ký', CANCELLED: 'Đã huỷ đăng ký', NONE: 'Chưa đăng ký' };
const dmyHm = (local) => (local ? `${local.slice(8, 10)}/${local.slice(5, 7)}/${local.slice(0, 4)} ${local.slice(11, 16)}` : '');

export async function exportRegistrations(user, eventId, query) {
  return guard(async () => {
    const a = await homeroomActivity(pool, user, eventId);
    const { rows } = await registrationRows(pool, a, query);
    if (rows.length > ACTIVITY_LIMITS.EXPORT_MAX_ROWS) {
      throw badRequest(ERROR_CODES.TOO_MANY, 'Too many rows to export.', { max: ACTIVITY_LIMITS.EXPORT_MAX_ROWS });
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Dang ky');
    ws.addRow([`Danh sách đăng ký – ${a.title}`]).font = { bold: true, size: 13 };
    ws.addRow([`Lớp ${a.className} · ${whenText(a)} · ${a.location}`]);
    ws.addRow([`Hạn đăng ký: ${vnTime(a.registrationDeadline)} · Đã đăng ký: ${a.registeredCount}${a.capacity ? `/${a.capacity}` : ''}`
      + `${a.status === ACTIVITY_STATUS.CANCELLED ? ' · HOẠT ĐỘNG ĐÃ HUỶ' : ''}`]);
    ws.addRow([]);
    const columns = [
      ['STT', 6], ['Mã học sinh', 14], ['Họ và tên', 28], ['Ngày sinh', 12], ['Trạng thái', 16],
      ['Thời gian đăng ký', 18], ['Phụ huynh đăng ký', 26], ['Quan hệ', 14], ['Số điện thoại', 16], ['Ghi chú', 22],
    ];
    const head = ws.addRow(columns.map((c) => c[0]));
    head.font = { bold: true };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F1FA' } };
    columns.forEach(([, w], i) => { ws.getColumn(i + 1).width = w; });
    ws.getColumn(9).numFmt = '@';
    rows.forEach((r, i) => ws.addRow([
      i + 1, r.studentCode, r.fullName, r.dob ? `${r.dob.slice(8, 10)}/${r.dob.slice(5, 7)}/${r.dob.slice(0, 4)}` : '',
      STATUS_TEXT[r.status], r.status === 'REGISTERED' ? dmyHm(r.registeredAt) : r.status === 'CANCELLED' ? dmyHm(r.cancelledAt) : '',
      r.registeredByName ?? '', r.relationship ?? '', r.registeredByPhone ?? '', r.inClass ? '' : 'Không còn học lớp này',
    ]));
    ws.views = [{ state: 'frozen', ySplit: 5 }];
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const safe = a.className.replace(/[^A-Za-z0-9]+/g, '');
    return { fileName: `dang-ky-ngoai-khoa-${safe}-${a.eventId}.xlsx`, contentType: XLSX_MIME, buffer };
  });
}

// --- Create form options (SCR-66) -----------------------------------------------------------------------------------

export async function formOptions(user) {
  return guard(async () => {
    const { rows } = await pool.query(
      `SELECT c.class_id AS "classId", c.class_name AS "className",
              to_char(sy.start_date, 'YYYY-MM-DD') AS "yearStart", to_char(sy.end_date, 'YYYY-MM-DD') AS "yearEnd",
              ${CLASS_SIZE} AS "classSize",
              (SELECT COUNT(DISTINCT pa.user_id)::int FROM class_enrollments ce JOIN student_parents sp ON sp.student_id = ce.student_id
                 JOIN parents pa ON pa.parent_id = sp.parent_id JOIN users pu ON pu.user_id = pa.user_id
                 WHERE ce.class_id = c.class_id AND ce.status = ${STUDYING} AND pu.status = 'ACTIVE') AS "parentCount",
(SELECT g.group_id FROM groups g WHERE g.class_id = c.class_id AND g.group_type = 'GENERAL'
                 AND g.deleted_at IS NULL ORDER BY g.group_id LIMIT 1) AS "groupId"
       FROM classes c JOIN school_years sy ON sy.school_year_id = c.school_year_id
       JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
       WHERE t.user_id = $1 AND c.deleted_at IS NULL AND sy.end_date >= CURRENT_DATE
       ORDER BY sy.start_date, c.class_name`,
      [user.userId],
    );
    const { rows: now } = await pool.query(`SELECT ${LOCAL('NOW()')} AS now`);
    const classes = rows.map((r) => ({ ...r, hasFeed: r.groupId != null }));
    return { classes, now: now[0].now, limits: ACTIVITY_LIMITS };
  });
}

