import ExcelJS from 'exceljs';
import { pool, withTransaction } from '../../config/db.js';
import { emitToUsers } from '../../sockets/index.js';
import { AppError, badRequest, forbidden, notFound } from '../../utils/AppError.js';
import { logActivity } from '../../utils/activityLog.js';
import { CATEGORY_LABELS, notifyContentRestored } from '../../utils/moderationNotify.js';
import { vietnameseNameOrder } from '../../utils/nameSort.js';
import { containsPattern, VI_TRANSLATE } from '../../utils/search.js';
import { activeMemberIds } from '../conversations/conversations.service.js';

// Moderation phase 6 (FE-08, owner Anh, 25/11/2026) – the School Manager's "Quy chuẩn cộng đồng" screen
// (docs/moderation-plan.md "Màn hình Quy chuẩn cộng đồng"): who broke the rules, by class, the history of one person,
// ONE piece of hidden content, and unhide.
//
// Every count reads moderation_violations only, status ACTIVE (docs "Đếm một lần vi phạm": unhidden = 0, a NEEDS_SUPPORT
// report is never a violation). The statistics NEVER return a comment's or a message's content: content only goes
// through getViolationContent (one piece, logged) and the two chat reads of moderation.service.js.

export const VIOLATION_CATEGORIES = Object.freeze([
  'VIOLENCE', 'SEXUAL', 'DISCRIMINATION', 'HARASSMENT', 'INAPPROPRIATE_LANGUAGE', 'SPAM', 'FALSE_INFORMATION', 'OTHER',
]); // moderation_violations_category_check, most severe first (ties of "topCategory")
export const CONTENT_TYPE_FILTERS = Object.freeze(['COMMENT', 'MESSAGE']);
export const SOURCES = Object.freeze(['AUTO', 'REPORT']);
export const ROLE_FILTERS = Object.freeze(['SCHOOL_MANAGER', 'TEACHER', 'STUDENT', 'PARENT']);
export const MAX_UNHIDE_REASON_LENGTH = 500; // moderation_violations.unhide_reason VARCHAR(500)
const DEFAULT_DAYS = 30;

const invalid = (field) => badRequest('MSG_INVALID_PARAM', `Invalid value for "${field}".`, { field });
const violationNotFound = () => notFound('MSG_VIOLATION_NOT_FOUND', 'Violation not found.');

function assertManager(user) {
  if (user?.activeRole !== 'SCHOOL_MANAGER') throw forbidden();
}

/**
 * WHERE of the violations of one window, with the shared filters (alias v = moderation_violations, u = its author).
 * filter: { from, to (YYYY-MM-DD or null), grade, classId, role, category, contentType, source, search }.
 * Window 'current' = from..to (both days included; default the last 30 days up to today); 'previous' = the window of
 * the same length just before it (the trend). Dates are turned into times by PostgreSQL in the database time zone
 * (Asia/Ho_Chi_Minh): a day is midnight to midnight, Vietnam time. Pushes its values on params.
 */
function filterSql(filter, params, window = 'current') {
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  const from = `COALESCE(${add(filter.from ?? null)}::date, CURRENT_DATE - ${DEFAULT_DAYS - 1})`;
  const to = `COALESCE(${add(filter.to ?? null)}::date, CURRENT_DATE)`;
  const where = [`v.status = 'ACTIVE'`];
  if (window === 'current') {
    where.push(`v.created_at >= ${from}`, `v.created_at < ${to} + 1`);
  } else {
    where.push(`v.created_at >= ${from} - (${to} - ${from} + 1)`, `v.created_at < ${from}`);
  }
  // Class and grade at the time of the violation (moderation_violations.class_id), never today's.
  if (filter.grade) {
    where.push(`v.class_id IN (SELECT c.class_id FROM classes c JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
                               WHERE gl.grade_level_name = ${add(filter.grade)})`);
  }
  if (filter.classId) where.push(`v.class_id = ${add(filter.classId)}`);
  if (filter.role) {
    where.push(`EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
                        WHERE ur.user_id = v.author_id AND r.role_code = ${add(filter.role)})`);
  }
  if (filter.category) where.push(`v.category = ${add(filter.category)}`);
  if (filter.contentType === 'COMMENT') where.push(`v.content_type IN ('SCHOOL_COMMENT', 'GROUP_COMMENT')`);
  if (filter.contentType === 'MESSAGE') where.push(`v.content_type = 'MESSAGE'`);
  if (filter.source) where.push(`v.source = ${add(filter.source)}`);
  const pattern = containsPattern(filter.search);
  if (pattern) {
    where.push(`lower(translate(u.full_name, ${add(VI_TRANSLATE.from)}, ${add(VI_TRANSLATE.to)})) LIKE ${add(pattern)}`);
  }
  return where.join(' AND ');
}

// The two windows actually used (defaults applied), for the answer.
async function windowsOf(filter) {
  const { rows } = await pool.query(
    `SELECT f::text AS "from", t::text AS "to", (f - (t - f + 1))::text AS "previousFrom", (f - 1)::text AS "previousTo"
     FROM (SELECT COALESCE($1::date, CURRENT_DATE - ${DEFAULT_DAYS - 1}) AS f, COALESCE($2::date, CURRENT_DATE) AS t) d`,
    [filter.from ?? null, filter.to ?? null],
  );
  const w = rows[0];
  return { from: w.from, to: w.to, previous: { from: w.previousFrom, to: w.previousTo } };
}

// One row per person with at least one ACTIVE violation in the window (no content, ever).
function violatorsSql(filter, params) {
  const current = filterSql(filter, params, 'current');
  const previous = filterSql(filter, params, 'previous');
  return `
    WITH base AS (
      SELECT v.* FROM moderation_violations v JOIN users u ON u.user_id = v.author_id WHERE ${current}),
    prev AS (
      SELECT v.author_id, COUNT(*) AS n FROM moderation_violations v JOIN users u ON u.user_id = v.author_id
      WHERE ${previous} GROUP BY v.author_id),
    agg AS (
      SELECT author_id, COUNT(*) AS total, MAX(created_at) AS last_at,
             COUNT(*) FILTER (WHERE source = 'AUTO') AS auto_n, COUNT(*) FILTER (WHERE source = 'REPORT') AS report_n,
             COUNT(*) FILTER (WHERE content_type = 'MESSAGE') AS message_n,
             COUNT(*) FILTER (WHERE content_type <> 'MESSAGE') AS comment_n
      FROM base GROUP BY author_id),
    cat AS (
      SELECT author_id, json_object_agg(category, n ORDER BY n DESC, category) AS by_category
      FROM (SELECT author_id, category, COUNT(*) AS n FROM base GROUP BY author_id, category) x GROUP BY author_id),
    last_class AS (
      SELECT DISTINCT ON (author_id) author_id, class_id FROM base ORDER BY author_id, created_at DESC, violation_id DESC)
    SELECT u.user_id AS "userId", u.full_name AS "fullName", u.full_name AS sort_name,
           (SELECT COALESCE(json_agg(ro.role_code ORDER BY ro.role_id), '[]'::json)
            FROM user_roles ur JOIN roles ro ON ro.role_id = ur.role_id
            WHERE ur.user_id = u.user_id AND ro.role_code <> 'SYSTEM_ADMIN') AS roles,
           c.class_name AS "className",
           agg.total, cat.by_category AS "byCategory",
           json_build_object('AUTO', agg.auto_n, 'REPORT', agg.report_n) AS "bySource",
           json_build_object('COMMENT', agg.comment_n, 'MESSAGE', agg.message_n) AS "byContentType",
           agg.last_at AS "lastAt", COALESCE(prev.n, 0) AS "previousTotal"
    FROM agg
    JOIN users u ON u.user_id = agg.author_id
    LEFT JOIN cat ON cat.author_id = agg.author_id
    LEFT JOIN prev ON prev.author_id = agg.author_id
    LEFT JOIN last_class lc ON lc.author_id = agg.author_id
    LEFT JOIN classes c ON c.class_id = lc.class_id`;
}

// Most violations first, then the Vietnamese name order (given name first, utils/nameSort.js), then the id.
const ORDER = `ORDER BY x.total DESC, ${vietnameseNameOrder('x.sort_name')}, x."userId"`;

function withTrend(row) {
  const { previousTotal, sort_name: _sortName, ...rest } = row;
  const trend = row.total > previousTotal ? 'up' : row.total < previousTotal ? 'down' : 'same';
  return { ...rest, trend, previousTotal };
}

/**
 * GET /moderation/violations – tab "Người vi phạm": one row per person, the most violations first, then the
 * Vietnamese name order (utils/nameSort.js). Each row: userId, fullName, roles, className (the class of their latest
 * violation in the window, null for a non-student), total, byCategory, bySource, byContentType, lastAt, trend (up / down
 * / same against the window of the same length just before) and previousTotal. Paged.
 * ASSUMPTION: className is the class stored with their LATEST violation of the window (a student who changed class
 * shows the newer one); the counts themselves always use each violation's own class.
 */
export async function listViolators(user, filter, { page, pageSize }) {
  assertManager(user);
  const params = [];
  const sql = violatorsSql(filter, params);
  const { rows: countRows } = await pool.query(`SELECT COUNT(*) AS total FROM (${sql}) x`, params);
  const { rows } = await pool.query(
    `SELECT * FROM (${sql}) x ${ORDER}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return { ...(await windowsOf(filter)), items: rows.map(withTrend), page, pageSize, total: countRows[0].total };
}

// --- Excel ----------------------------------------------------------------------------------------------------------

const ROLE_LABELS = { SCHOOL_MANAGER: 'Ban giám hiệu', TEACHER: 'Giáo viên', STUDENT: 'Học sinh', PARENT: 'Phụ huynh' };
const TREND_LABELS = { up: 'Tăng', down: 'Giảm', same: 'Như cũ' };
const label = (code) => {
  const text = CATEGORY_LABELS[code] ?? code;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * GET /moderation/violations/export – the same rows as listViolators (same filters, every page) as an .xlsx. No
 * content. Returns { workbook, filename }.
 */
export async function exportViolators(user, filter) {
  assertManager(user);
  const params = [];
  const { rows } = await pool.query(
    `SELECT * FROM (${violatorsSql(filter, params)}) x ${ORDER}`,
    params,
  );
  const windows = await windowsOf(filter);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Người vi phạm');
  sheet.columns = [
    { header: 'STT', key: 'no', width: 6 },
    { header: 'Họ và tên', key: 'fullName', width: 28 },
    { header: 'Vai trò', key: 'roles', width: 18 },
    { header: 'Lớp', key: 'className', width: 10 },
    { header: 'Tổng số lần vi phạm', key: 'total', width: 12 },
    { header: 'Theo loại', key: 'byCategory', width: 44 },
    { header: 'Bình luận', key: 'comments', width: 10 },
    { header: 'Tin nhắn', key: 'messages', width: 10 },
    { header: 'Tự động', key: 'auto', width: 10 },
    { header: 'Qua báo cáo', key: 'report', width: 12 },
    { header: 'Lần gần nhất', key: 'lastAt', width: 18 },
    { header: 'Xu hướng', key: 'trend', width: 10 },
    { header: 'Kỳ trước', key: 'previousTotal', width: 10 },
  ];
  sheet.getRow(1).font = { bold: true };
  rows.map(withTrend).forEach((r, i) =>
    sheet.addRow({
      no: i + 1,
      fullName: r.fullName,
      roles: r.roles.map((code) => ROLE_LABELS[code] ?? code).join(', '),
      className: r.className ?? '',
      total: r.total,
      byCategory: Object.entries(r.byCategory ?? {}).map(([code, n]) => `${label(code)} ${n}`).join(' · '),
      comments: r.byContentType.COMMENT,
      messages: r.byContentType.MESSAGE,
      auto: r.bySource.AUTO,
      report: r.bySource.REPORT,
      lastAt: String(r.lastAt).slice(0, 16),
      trend: TREND_LABELS[r.trend],
      previousTotal: r.previousTotal,
    }),
  );
  return { workbook, filename: `vi-pham_${windows.from}_${windows.to}.xlsx`, rowCount: rows.length };
}

// --- By class -------------------------------------------------------------------------------------------------------

/**
 * GET /moderation/violations/by-class – tab "Theo lớp": per class (the student's class at the time of each violation),
 * the number of violations, of students with at least one, and the category seen most (a tie goes to the most severe).
 * Violations without a class (teachers, parents, School Managers) are not in this tab.
 */
export async function listByClass(user, filter) {
  assertManager(user);
  const params = [];
  const current = filterSql(filter, params, 'current');
  const { rows } = await pool.query(
    `WITH base AS (
       SELECT v.* FROM moderation_violations v JOIN users u ON u.user_id = v.author_id
       WHERE ${current} AND v.class_id IS NOT NULL)
     SELECT c.class_id AS "classId", gl.grade_level_name AS grade, c.class_name AS "className",
            sy.year_name AS "schoolYear", COUNT(*) AS total, COUNT(DISTINCT b.author_id) AS "studentsWithViolation",
            (SELECT b2.category FROM base b2 WHERE b2.class_id = c.class_id GROUP BY b2.category
             ORDER BY COUNT(*) DESC, array_position($${params.length + 1}::text[], b2.category::text) LIMIT 1) AS "topCategory"
     FROM base b
     JOIN classes c ON c.class_id = b.class_id
     JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
     JOIN school_years sy ON sy.school_year_id = c.school_year_id
     GROUP BY c.class_id, gl.grade_level_name, c.class_name, sy.year_name
     ORDER BY gl.grade_level_name, c.class_name, sy.year_name`,
    [...params, VIOLATION_CATEGORIES],
  );
  return { ...(await windowsOf(filter)), items: rows };
}

// --- One person, one piece, unhide --------------------------------------------------------------------------------

// Where a violation happened, never the content: the school post's title, the group's name, or "a 1-1 chat" (its other
// member is not named). Alias v = moderation_violations.
const PLACE_SQL = `CASE
    WHEN v.content_type = 'SCHOOL_COMMENT' THEN json_build_object('kind', 'SCHOOL_POST', 'name',
      (SELECT sp.title FROM comments c JOIN school_posts sp ON sp.school_post_id = c.school_post_id WHERE c.comment_id = v.comment_id))
    WHEN v.content_type = 'GROUP_COMMENT' THEN json_build_object('kind', 'GROUP_POST', 'name',
      (SELECT g.group_name FROM comments c JOIN posts p ON p.post_id = c.post_id JOIN groups g ON g.group_id = p.group_id
       WHERE c.comment_id = v.comment_id))
    ELSE (SELECT CASE WHEN g.group_type = 'DIRECT' THEN json_build_object('kind', 'DIRECT_CHAT', 'name', NULL)
                      ELSE json_build_object('kind', 'GROUP_CHAT', 'name', g.group_name) END
          FROM messages m JOIN groups g ON g.group_id = m.group_id WHERE m.message_id = v.message_id)
  END`;

// May the School Manager read the content of this violation (alias v)? (25/11/2026, business-rules "Quy chuẩn cộng
// đồng"): always for source AUTO – deciding about an unhide is their job; for source REPORT only content whose
// reports THEY handle: school post comments, chat messages, and comments of the teacher group (TEACHER_SCHOOL).
// A REPORT violation of a comment of a class / student / parent group was decided by the homeroom teacher (FE-05),
// and the School Manager does not see class feeds (business-rules §1): no content there.
const CAN_VIEW_SQL = `(v.source = 'AUTO'
    OR v.content_type IN ('SCHOOL_COMMENT', 'MESSAGE')
    OR (v.content_type = 'GROUP_COMMENT' AND EXISTS (
          SELECT 1 FROM comments c JOIN posts p ON p.post_id = c.post_id JOIN groups g ON g.group_id = p.group_id
          WHERE c.comment_id = v.comment_id AND g.group_type = 'TEACHER_SCHOOL')))`;

/**
 * GET /moderation/violations/users/:userId – every violation of one person (ACTIVE and UNHIDDEN, newest first, all
 * time): violationId, createdAt, category, contentType, source, status, place, canUnhide (source AUTO and still
 * ACTIVE), and who unhid it, when and why. No content.
 * ASSUMPTION: the whole history, not only the window of the list (at most 500 rows): a School Manager deciding about one
 * person needs the earlier times too.
 */
export async function getUserHistory(user, userId) {
  assertManager(user);
  const { rows: people } = await pool.query(
    `SELECT u.user_id AS "userId", u.full_name AS "fullName",
            (SELECT COALESCE(json_agg(ro.role_code ORDER BY ro.role_id), '[]'::json)
             FROM user_roles ur JOIN roles ro ON ro.role_id = ur.role_id
             WHERE ur.user_id = u.user_id AND ro.role_code <> 'SYSTEM_ADMIN') AS roles
     FROM users u WHERE u.user_id = $1`,
    [userId],
  );
  if (!people.length) throw notFound('MSG_USER_NOT_FOUND', 'User not found.');
  const { rows } = await pool.query(
    `SELECT v.violation_id AS "violationId", v.created_at AS "createdAt", v.category, v.content_type AS "contentType",
            v.source, v.status, ${PLACE_SQL} AS place, c.class_name AS "className",
            (v.source = 'AUTO' AND v.status = 'ACTIVE') AS "canUnhide", ${CAN_VIEW_SQL} AS "canView",
            v.unhidden_at AS "unhiddenAt", ub.full_name AS "unhiddenByName", v.unhide_reason AS "unhideReason"
     FROM moderation_violations v
     LEFT JOIN classes c ON c.class_id = v.class_id
     LEFT JOIN users ub ON ub.user_id = v.unhidden_by
     WHERE v.author_id = $1
     ORDER BY v.created_at DESC, v.violation_id DESC
     LIMIT 500`,
    [userId],
  );
  return { ...people[0], items: rows };
}

/**
 * GET /moderation/violations/:id/content – exactly ONE piece of content, the one of this violation (no thread, no chat
 * around it), for the School Manager to decide about unhiding. Logged here, before anything is returned:
 * MODERATION_ITEM_VIEW { violationId } (a failed log fails the read). Files of a message: names only.
 * Only within CAN_VIEW_SQL (AUTO, or REPORT content the School Manager handles): else 403
 * MSG_VIOLATION_CONTENT_FORBIDDEN, nothing returned and nothing logged.
 */
export async function getViolationContent(user, violationId) {
  assertManager(user);
  const { rows } = await pool.query(
    `SELECT v.violation_id AS "violationId", v.content_type AS "contentType", v.source, v.category, v.status,
            v.author_id AS "authorId", au.full_name AS "authorName", ${PLACE_SQL} AS place, ${CAN_VIEW_SQL} AS "canView",
            COALESCE(c.content, m.content) AS content, COALESCE(c.created_at, m.sent_at) AS "writtenAt",
            CASE WHEN v.message_id IS NULL THEN '[]'::json
                 ELSE COALESCE((SELECT json_agg(json_build_object('fileName', a.file_name) ORDER BY a.attachment_id)
                                FROM attachments a WHERE a.message_id = v.message_id AND a.deleted_at IS NULL), '[]'::json)
            END AS attachments
     FROM moderation_violations v
     JOIN users au ON au.user_id = v.author_id
     LEFT JOIN comments c ON c.comment_id = v.comment_id
     LEFT JOIN messages m ON m.message_id = v.message_id
     WHERE v.violation_id = $1`,
    [violationId],
  );
  if (!rows.length) throw violationNotFound();
  const { canView, ...piece } = rows[0];
  if (!canView) {
    throw forbidden('MSG_VIOLATION_CONTENT_FORBIDDEN', 'This content was handled by the group moderator; it is not shown here.');
  }
  await logActivity({
    userId: user.userId,
    action: 'MODERATION_ITEM_VIEW',
    targetType: 'MODERATION_VIOLATION',
    targetId: violationId,
    detail: { violationId },
  });
  return piece;
}

function parseUnhideReason(value) {
  if (value !== undefined && value !== null && typeof value !== 'string') throw invalid('reason');
  const reason = (value ?? '').normalize('NFC').trim();
  if (!reason) throw badRequest('MSG_UNHIDE_REASON_REQUIRED', 'Please give the reason for showing it again.', { field: 'reason' });
  if ([...reason].length > MAX_UNHIDE_REASON_LENGTH) throw invalid('reason');
  return reason;
}

/**
 * POST /moderation/violations/:id/unhide { reason } – the safety net when the automatic check was wrong. Only a
 * violation of source AUTO that is still ACTIVE (else 409 MSG_VIOLATION_NOT_UNHIDABLE: a REPORT violation is a
 * moderator's decision, an UNHIDDEN one is already done). In one transaction:
 *   comment → hidden_at = NULL; message → deleted_for_everyone_at = NULL ONLY when deleted_for_everyone_by IS NULL
 *   (a message its sender recalled is never brought back); the violation → UNHIDDEN with who, when and why.
 * After COMMIT: the author is told (no content); a message → 'message:restored' { groupId, messageId } to the chat's
 * active members.
 * ASSUMPTION: a comment shown again sends no real-time event – it appears at the next load of the thread (the feeds'
 * comment signals are FE-05 / FE-08 room events, and a "new comment" signal would notify people again).
 * Logged: MODERATION_UNHIDE { violationId, reason }.
 */
export async function unhideViolation(user, violationId, body) {
  assertManager(user);
  const reason = parseUnhideReason(body?.reason);
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT v.violation_id AS "violationId", v.content_type AS "contentType", v.source, v.status,
              v.comment_id AS "commentId", v.message_id AS "messageId", v.author_id AS "authorId",
              COALESCE(c.school_post_id, c.post_id) AS "postId",
              CASE WHEN c.school_post_id IS NOT NULL THEN 'school_post_id' ELSE 'post_id' END AS "postColumn",
              m.group_id AS "groupId"
       FROM moderation_violations v
       LEFT JOIN comments c ON c.comment_id = v.comment_id
       LEFT JOIN messages m ON m.message_id = v.message_id
       WHERE v.violation_id = $1
       FOR UPDATE OF v`,
      [violationId],
    );
    const v = rows[0];
    if (!v) throw violationNotFound();
    if (v.source !== 'AUTO' || v.status !== 'ACTIVE') {
      throw new AppError(409, 'MSG_VIOLATION_NOT_UNHIDABLE', 'Only an active violation found by the automatic check can be unhidden.');
    }
    let shown;
    if (v.commentId) {
      ({ rowCount: shown } = await client.query(
        'UPDATE comments SET hidden_at = NULL WHERE comment_id = $1 AND hidden_at IS NOT NULL',
        [v.commentId],
      ));
    } else {
      ({ rowCount: shown } = await client.query(
        `UPDATE messages SET deleted_for_everyone_at = NULL
         WHERE message_id = $1 AND deleted_for_everyone_at IS NOT NULL AND deleted_for_everyone_by IS NULL`,
        [v.messageId],
      ));
    }
    await client.query(
      `UPDATE moderation_violations SET status = 'UNHIDDEN', unhidden_by = $2, unhidden_at = NOW(), unhide_reason = $3
       WHERE violation_id = $1`,
      [violationId, user.userId, reason],
    );
    return { ...v, shown: shown > 0 };
  });

  await logActivity({
    userId: user.userId,
    action: 'MODERATION_UNHIDE',
    targetType: 'MODERATION_VIOLATION',
    targetId: violationId,
    detail: { violationId, reason },
  });
  if (result.shown) {
    const postTarget = result.messageId
      ? { column: 'group_id', id: result.groupId }
      : { column: result.postColumn, id: result.postId };
    notifyContentRestored({ contentType: result.contentType, authorId: result.authorId, postTarget }).catch((err) =>
      console.error(`[moderation] restored notification for violation #${violationId} not sent:`, err?.message),
    );
    if (result.messageId) {
      (async () => {
        emitToUsers(await activeMemberIds(pool, result.groupId), 'message:restored', {
          groupId: result.groupId,
          messageId: result.messageId,
        });
      })().catch((err) => console.error(`[moderation] message:restored #${result.messageId} not sent:`, err?.message));
    }
  }
  return { violationId, status: 'UNHIDDEN', contentShown: result.shown };
}
