import { pool } from '../../config/db.js';
import { badRequest, forbidden, notFound } from '../../utils/AppError.js';
import { vietnameseNameOrder } from '../../utils/nameSort.js';
import { emitToUsers } from '../../sockets/index.js';

// FE-09 Notifications (owner: Quoc): UC-67 View Notifications, UC-68 View Notification Read Status.
// Business rules §9 (FE-09 decisions 18/11/2026):
// - every row of notification_recipients is for ONE role (role_code); a user sees only the rows of the ACTIVE role
//   (patch_v0.3_notification_roles.sql);
// - the bell lists every notification (newest first); the personal page lists is_personal ones with their detail and
//   a child filter for parents; reading in either place marks the row read;
// - a notification whose item was deleted (school post, group post, class event, maintenance window) is no longer
//   listed (ASSUMPTION, lead 18/11/2026: "reload → it is gone; before the reload a click only opens the item").
// System Admin only gets account / maintenance notices, so the same API serves every role.

const PAGE_MAX = 50;

// Rows of the caller: user + active role; the item still exists.
const ALIVE_SQL = `(
  CASE n.target_type
    WHEN 'SCHOOL_POST' THEN EXISTS (SELECT 1 FROM school_posts x WHERE x.school_post_id = n.target_id AND x.deleted_at IS NULL)
    WHEN 'POST' THEN EXISTS (SELECT 1 FROM posts x WHERE x.post_id = n.target_id AND x.deleted_at IS NULL
                             AND x.approval_status = 'APPROVED' AND NOT x.is_hidden)
    WHEN 'CLASS_EVENT' THEN EXISTS (SELECT 1 FROM class_events x WHERE x.event_id = n.target_id AND x.deleted_at IS NULL)
    WHEN 'EXTRACURRICULAR_EVENT' THEN EXISTS (SELECT 1 FROM extracurricular_events x JOIN posts p ON p.post_id = x.post_id
                                              WHERE x.event_id = n.target_id AND p.deleted_at IS NULL)
    WHEN 'MAINTENANCE' THEN EXISTS (SELECT 1 FROM maintenance_announcements x
                                    WHERE x.maintenance_id = n.target_id AND x.deleted_at IS NULL)
    ELSE TRUE
  END)`;

/**
 * Where a click goes (client route), computed with the row:
 *   SCHOOL_POST → the school feed with the post in its pop-up; POST → the group feed with the post in its pop-up;
 *   CLASS_EVENT → the event page; EXTRACURRICULAR_EVENT → the activity page; ATTENDANCE → the attendance page on that
 *   child, semester and month; PASSWORD_RESET_REQUEST → the request queue; USER (teacher locked) → teaching
 *   assignments; MAINTENANCE → no page (the text says it all).
 */
const LINK_SQL = `CASE n.target_type
    WHEN 'SCHOOL_POST' THEN '/school-feed?post=' || n.target_id
    WHEN 'POST' THEN (SELECT '/groups/' || p.group_id || '/feed?post=' || p.post_id FROM posts p WHERE p.post_id = n.target_id)
    WHEN 'CLASS_EVENT' THEN '/calendar/events/' || n.target_id
    WHEN 'EXTRACURRICULAR_EVENT' THEN '/extracurricular/' || n.target_id
    WHEN 'ATTENDANCE' THEN (
      SELECT '/attendance?studentId=' || e.student_id || COALESCE('&semesterId=' || se.semester_id, '')
             || '&month=' || to_char(ts."date", 'YYYY-MM')
      FROM attendances a JOIN class_enrollments e ON e.enrollment_id = a.enrollment_id
      JOIN timetable_slots ts ON ts.timetable_slot_id = a.timetable_slot_id
      JOIN classes c ON c.class_id = ts.class_id
      LEFT JOIN semesters se ON se.school_year_id = c.school_year_id AND ts."date" BETWEEN se.start_date AND se.end_date
      WHERE a.attendance_id = n.target_id)
    WHEN 'PASSWORD_RESET_REQUEST' THEN '/admin/password-reset-requests'
    WHEN 'USER' THEN '/teaching-assignments'
    ELSE NULL
  END`;

const flag = (v) => v === true || v === 'true' || v === '1';

function readPaging(query, fallbackSize = 20) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(PAGE_MAX, Math.max(1, Number.parseInt(query.pageSize, 10) || fallbackSize));
  return { page, pageSize };
}

// Children a parent can filter by (those named on their notifications), for the chips of SCR-04.
async function childrenOf(user) {
  if (user.activeRole !== 'PARENT') return [];
  const { rows } = await pool.query(
    `SELECT s.student_id AS "studentId", s.student_code AS "studentCode", u.full_name AS "fullName",
            (SELECT c.class_name FROM class_enrollments e JOIN classes c ON c.class_id = e.class_id AND c.deleted_at IS NULL
             WHERE e.student_id = s.student_id ORDER BY (e.status = 'STUDYING') DESC, e.enrolled_at DESC LIMIT 1) AS "className"
     FROM parents p JOIN student_parents sp ON sp.parent_id = p.parent_id
     JOIN students s ON s.student_id = sp.student_id JOIN users u ON u.user_id = s.user_id
     WHERE p.user_id = $1
     ORDER BY ${vietnameseNameOrder('u.full_name')}, s.student_id`,
    [user.userId],
  );
  return rows;
}

/**
 * GET /notifications?personal=1&unread=1&studentId=&page=&pageSize= – UC-67, newest first.
 * Returns { items, total, unreadCount, page, pageSize, children } (children: parent only).
 */
export async function listNotifications(user, query) {
  const { page, pageSize } = readPaging(query);
  const params = [user.userId, user.activeRole];
  const where = ['r.user_id = $1', 'r.role_code = $2', ALIVE_SQL];
  if (flag(query.personal)) where.push('n.is_personal');
  if (flag(query.unread)) where.push('r.read_at IS NULL');
  if (query.studentId) {
    const id = Number(query.studentId);
    if (!Number.isInteger(id) || id < 1) throw badRequest('MSG_INVALID_PARAM', 'Invalid child.');
    params.push(id);
    where.push(`r.student_id = $${params.length}`);
  }
  const from = `FROM notification_recipients r JOIN notifications n ON n.notification_id = r.notification_id
     WHERE ${where.join(' AND ')}`;
  // Run one after the other: DB_POOL_MAX=3 per developer on the shared pooler.
  const { rows: count } = await pool.query(`SELECT COUNT(*) AS n ${from}`, params);
  const { rows } = await pool.query(
    `SELECT n.notification_id AS "notificationId", n.type, n.title, n.detail, n.is_personal AS "isPersonal",
            n.target_type AS "targetType", n.target_id AS "targetId", n.created_at AS "createdAt",
            r.read_at AS "readAt", r.student_id AS "studentId",
            (SELECT su.full_name FROM students s JOIN users su ON su.user_id = s.user_id
             WHERE s.student_id = r.student_id) AS "studentName",
            ${LINK_SQL} AS "link"
     ${from}
     ORDER BY n.created_at DESC, n.notification_id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return {
    items: rows,
    total: count[0].n,
    unreadCount: await unreadCount(user),
    page,
    pageSize,
    children: await childrenOf(user),
  };
}

// Unread rows of the active role (the bell's badge). personal: only the personal ones.
export async function unreadCount(user, { personal = false } = {}) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS n FROM notification_recipients r JOIN notifications n ON n.notification_id = r.notification_id
     WHERE r.user_id = $1 AND r.role_code = $2 AND r.read_at IS NULL AND ${ALIVE_SQL}
       AND (NOT $3::boolean OR n.is_personal)`,
    [user.userId, user.activeRole, personal],
  );
  return rows[0].n;
}

// Other tabs of the same person follow (badge, lists): "notification:read" on their own room.
function announceRead(user, payload) {
  emitToUsers([user.userId], 'notification:read', { role: user.activeRole, ...payload });
}

// PATCH /notifications/:id/read – the caller's row under the active role. Reading twice is fine.
export async function markRead(user, idParam) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id < 1) throw notFound('MSG_NOTIFICATION_NOT_FOUND', 'Notification not found.');
  const { rows } = await pool.query(
    `UPDATE notification_recipients SET read_at = COALESCE(read_at, NOW())
     WHERE notification_id = $1 AND user_id = $2 AND role_code = $3
     RETURNING read_at AS "readAt"`,
    [id, user.userId, user.activeRole],
  );
  if (!rows[0]) throw notFound('MSG_NOTIFICATION_NOT_FOUND', 'Notification not found.');
  announceRead(user, { notificationId: id });
  return { notificationId: id, readAt: rows[0].readAt, unreadCount: await unreadCount(user) };
}

// POST /notifications/read-all { personal?, studentId? } – what the open list shows.
export async function markAllRead(user, body = {}) {
  const params = [user.userId, user.activeRole, flag(body.personal)];
  let child = '';
  if (body.studentId) {
    const id = Number(body.studentId);
    if (!Number.isInteger(id) || id < 1) throw badRequest('MSG_INVALID_PARAM', 'Invalid child.');
    params.push(id);
    child = `AND r.student_id = $${params.length}`;
  }
  const { rowCount } = await pool.query(
    `UPDATE notification_recipients r SET read_at = NOW()
     FROM notifications n
     WHERE n.notification_id = r.notification_id AND r.user_id = $1 AND r.role_code = $2 AND r.read_at IS NULL
       AND (NOT $3::boolean OR n.is_personal) ${child}`,
    params,
  );
  announceRead(user, { all: true });
  return { marked: rowCount, unreadCount: await unreadCount(user) };
}

// --- UC-68 View Notification Read Status (teacher, lead 18/11/2026: class events and activities they created) ----

// Notifications about items the teacher created: class events (class_events.created_by) and extracurricular activities
// (the activity's class feed post author). Reminders (created_by NULL) count too: they belong to the item.
const OWN_ITEMS_SQL = `
  SELECT 'CLASS_EVENT' AS target_type, e.event_id AS target_id, e.title, c.class_name, e.start_at AS item_at
  FROM class_events e JOIN classes c ON c.class_id = e.class_id
  WHERE e.created_by = $1 AND e.deleted_at IS NULL
  UNION ALL
  SELECT 'EXTRACURRICULAR_EVENT', x.event_id, x.title, c.class_name, x.start_at
  FROM extracurricular_events x JOIN posts p ON p.post_id = x.post_id AND p.deleted_at IS NULL
  JOIN groups g ON g.group_id = p.group_id JOIN classes c ON c.class_id = g.class_id
  WHERE p.author_id = $1`;

/**
 * GET /notifications/sent?page= – the teacher's items that sent notifications, newest notification first; each with
 * its notifications and how many recipients have / have not read each.
 */
export async function listSent(user, query) {
  if (user.activeRole !== 'TEACHER') throw forbidden();
  const { page, pageSize } = readPaging(query, 10);
  const { rows } = await pool.query(
    `WITH items AS (${OWN_ITEMS_SQL}),
     sent AS (
       SELECT i.target_type, i.target_id, i.title AS item_title, i.class_name, i.item_at,
              n.notification_id, n.title, n.is_personal, n.created_at,
              COUNT(r.user_id) AS recipients, COUNT(r.read_at) AS read
       FROM items i
       JOIN notifications n ON n.target_type = i.target_type AND n.target_id = i.target_id
       JOIN notification_recipients r ON r.notification_id = n.notification_id
       GROUP BY i.target_type, i.target_id, i.title, i.class_name, i.item_at, n.notification_id),
     grouped AS (
       SELECT target_type, target_id, item_title, class_name, item_at, MAX(created_at) AS last_at,
              json_agg(json_build_object('notificationId', notification_id, 'title', title, 'isPersonal', is_personal,
                       'createdAt', created_at, 'recipients', recipients, 'read', read) ORDER BY created_at DESC) AS notifications
       FROM sent GROUP BY target_type, target_id, item_title, class_name, item_at)
     SELECT target_type AS "targetType", target_id AS "targetId", item_title AS "title", class_name AS "className",
            item_at AS "itemAt", notifications, COUNT(*) OVER () AS "total"
     FROM grouped ORDER BY last_at DESC, target_id DESC
     LIMIT $2 OFFSET $3`,
    [user.userId, pageSize, (page - 1) * pageSize],
  );
  return { items: rows.map(({ total, ...r }) => r), total: rows[0]?.total ?? 0, page, pageSize };
}

/**
 * GET /notifications/sent/:notificationId – who got one notification of the teacher's item, unread first
 * (name, role, child), to remind them. Not the teacher's item = not found.
 */
export async function sentDetail(user, idParam) {
  if (user.activeRole !== 'TEACHER') throw forbidden();
  const id = Number(idParam);
  if (!Number.isInteger(id) || id < 1) throw notFound('MSG_NOTIFICATION_NOT_FOUND', 'Notification not found.');
  const { rows: head } = await pool.query(
    `WITH items AS (${OWN_ITEMS_SQL})
     SELECT n.notification_id AS "notificationId", n.title, n.detail, n.is_personal AS "isPersonal",
            n.created_at AS "createdAt", i.target_type AS "targetType", i.target_id AS "targetId",
            i.title AS "itemTitle", i.class_name AS "className"
     FROM notifications n JOIN items i ON i.target_type = n.target_type AND i.target_id = n.target_id
     WHERE n.notification_id = $2`,
    [user.userId, id],
  );
  if (!head[0]) throw notFound('MSG_NOTIFICATION_NOT_FOUND', 'Notification not found.');
  // ASSUMPTION: the phone number is shown so the teacher can remind by phone (the FE-07 registration list already shows
  // parents' phones to the teacher of the class, business rules §7).
  const { rows: recipients } = await pool.query(
    `SELECT u.user_id AS "userId", u.full_name AS "fullName", u.phone, r.role_code AS "role", r.read_at AS "readAt",
            su.full_name AS "studentName", s.student_code AS "studentCode"
     FROM notification_recipients r JOIN users u ON u.user_id = r.user_id
     LEFT JOIN students s ON s.student_id = r.student_id LEFT JOIN users su ON su.user_id = s.user_id
     WHERE r.notification_id = $1
     ORDER BY (r.read_at IS NOT NULL), r.role_code, ${vietnameseNameOrder('u.full_name')}, u.user_id`,
    [id],
  );
  return {
    notification: head[0],
    recipients,
    counts: { total: recipients.length, read: recipients.filter((r) => r.readAt).length },
  };
}
