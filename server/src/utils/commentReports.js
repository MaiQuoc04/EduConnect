import { pool, withTransaction } from '../config/db.js';
import { AppError, badRequest, notFound } from './AppError.js';
import { FEED_COLUMNS, softDeleteComment } from './feedInteractions.js';
import { recordReportViolation, reportCategory } from './moderationViolations.js';

// Reports of feed comments (comment_reports, patch_v0.3_comment_reports.sql, 17/11/2026) – the data layer shared by
// FE-08 School Feed (owner Anh, first user) and FE-05 Group Feed (owner Khanh). Same contract as feedInteractions.js:
//
//   These functions only read and write rows. They check NOTHING about who may do it. The caller checks first:
//     - reporting: the reporter may see the post the comment belongs to (FE-08: openSchoolPostForInteraction; FE-05:
//       its own group / approval / hidden rules) and the comment belongs to the post of the URL (feed.findComment);
//     - handling: the user is the moderator of THAT comment (FE-08: School Manager, school post comments only, never
//       group comments – business-rules §1; FE-05: homeroom teacher / group moderator, comments of their groups only).
//   A report is tied to the COMMENT, never to a post: comments already carry post_id (group) or school_post_id
//   (school), so one table serves both feeds. listReports always takes a `source` (and the group ids for FE-05) so a
//   moderator only ever reads the comments of their own feed.
//
// Rules that are the same for both feeds live here:
//   - One report per person per comment (UNIQUE (comment_id, reported_by)). Reporting again is NOT an error: 200 and
//     nothing changes (see reportComment).
//   - Nobody reports their own comment (400 MSG_CANNOT_REPORT_OWN_COMMENT); a deleted comment cannot be reported
//     (404 MSG_COMMENT_NOT_FOUND – for the API it no longer exists, as for like / delete).
//   - A report hides nothing (business-rules §5: comments are deleted, never hidden). The moderator either DELETEs the
//     comment (soft, feed.softDeleteComment; every pending report of it → RESOLVED) or DISMISSes the reports (the
//     comment stays; → DISMISSED). One decision closes every pending report of the comment at once.
//   - The author of the comment never learns WHO reported it: no function here returns a reporter's id or name, not
//     even to the moderator, and the notification of a deleted comment names nobody (notifyCommentRemoved).
//
// FE-05 (Khanh) – how to reuse, without any schema change:
//   report     POST .../posts/:postId/comments/:commentId/report: check the post as for a comment (your §5 rules), then
//              feed.findComment({ column: 'post_id', id: postId }, commentId) (404 when missing / deleted), then
//              reportComment(commentId, user.userId, parseReportInput(body), client) in the same transaction.
//   list       listReports({ source: REPORT_SOURCES.GROUP_POST, groupIds: <groups the user moderates>, status, page,
//              pageSize }) and countPendingReports({ source: REPORT_SOURCES.GROUP_POST, groupIds }).
//   handle     in a transaction: findReportedComment(commentId, { forUpdate: true }, client) → check its groupId is one
//              the user moderates (else 404) → resolveReport(commentId, user.userId, 'DELETE' | 'DISMISS', client) →
//              after COMMIT, when commentDeleted: notifyCommentRemoved(result, user.userId) (fire and forget).
//   comments   withReportedByMe(tree, userId) after feed.listComments adds reportedByMe to each node (opt-in).
//   UC-66-like deletes (author / moderator deletes from the thread): call resolvePendingReports(commentId, userId,
//              client) after feed.softDeleteComment, so the queue never keeps reports of a comment already gone.
//
// Moderation phase 5 (25/11/2026, docs/moderation-plan.md "Luồng báo cáo"): reason NEEDS_SUPPORT ("Cần được hỗ trợ":
// someone may need help – self-harm, bullying, abuse, a crisis). It is not a violation:
//   - it goes first in the queue (listReports: hasNeedsSupport);
//   - deciding a comment with a pending NEEDS_SUPPORT report needs a supportNote (what was done to help), written on
//     those reports; when EVERY pending report is NEEDS_SUPPORT only DISMISS ("Ghi nhận") is allowed, never DELETE;
//   - the author is never told about it, and it never counts as a violation (the category of a DELETE comes from the
//     other reasons: moderationViolations.reportCategory).
// A DELETE decided from reports also writes a moderation_violations row (source REPORT).
// Who is told about a new NEEDS_SUPPORT report: school post comments – every School Manager at once
// (schoolposts.service reportSchoolPostComment → moderationNotify.notifySupportRequest).
// ASSUMPTION: group post comments (FE-05) only go first in the moderator's queue (UC-131), with no notification: telling
// the homeroom teacher at once would need a change in FE-05's module (Khanh), which is not part of this phase.

export const REPORT_REASONS = Object.freeze([
  'INAPPROPRIATE_LANGUAGE',
  'HARASSMENT',
  'SPAM',
  'FALSE_INFORMATION',
  'NEEDS_SUPPORT',
  'OTHER',
]); // comment_reports_reason_check (NEEDS_SUPPORT: patch_v0.3_moderation.sql)
export const NEEDS_SUPPORT = 'NEEDS_SUPPORT';
export const MAX_SUPPORT_NOTE_LENGTH = 1000; // comment_reports.support_note VARCHAR(1000)
export const REPORT_STATUSES = Object.freeze(['PENDING', 'RESOLVED', 'DISMISSED']); // comment_reports_status_check
export const REPORT_ACTIONS = Object.freeze(['DELETE', 'DISMISS']);
export const REPORT_SOURCES = Object.freeze({ SCHOOL_POST: 'SCHOOL_POST', GROUP_POST: 'GROUP_POST', ALL: 'ALL' });
export const MAX_REPORT_NOTE_LENGTH = 500; // comment_reports.note VARCHAR(500)

// Vietnamese labels of the reasons, used only in the text of the notification (stored in notifications.detail, read
// as is by FE-09). The client has its own copy for the screens.
// ASSUMPTION: notification text is written in Vietnamese by the server (as notifySchoolPost stores the post title).
const REASON_LABELS = {
  INAPPROPRIATE_LANGUAGE: 'Ngôn từ không phù hợp',
  HARASSMENT: 'Quấy rối, xúc phạm hoặc bắt nạt',
  SPAM: 'Spam, quảng cáo hoặc nội dung lặp lại',
  FALSE_INFORMATION: 'Thông tin sai sự thật',
  OTHER: 'Lý do khác',
  // never used in a notification (the author is never told about it); here so the table is complete
  NEEDS_SUPPORT: 'Cần được hỗ trợ',
};

/**
 * The "Kết quả hỗ trợ" of a decision on content with a pending NEEDS_SUPPORT report (comments here, messages in
 * modules/moderation): required then – 400 MSG_SUPPORT_NOTE_REQUIRED { field: 'supportNote' } when missing or blank;
 * text, NFC, trimmed, at most 1000 characters (400 MSG_INVALID_PARAM). Without such a report it is ignored (null).
 * @returns {string | null}
 */
export function parseSupportNote(value, required) {
  if (!required) return null;
  if (value !== undefined && value !== null && typeof value !== 'string') throw invalid('supportNote');
  const note = (value ?? '').normalize('NFC').trim();
  if (!note) {
    throw badRequest('MSG_SUPPORT_NOTE_REQUIRED', 'Please write what was done to help.', { field: 'supportNote' });
  }
  if ([...note].length > MAX_SUPPORT_NOTE_LENGTH) throw invalid('supportNote');
  return note;
}

const invalid = (field) => badRequest('MSG_INVALID_PARAM', `Invalid value for "${field}".`, { field });
const commentNotFound = () => notFound('MSG_COMMENT_NOT_FOUND', 'The comment was not found.');

/**
 * Checks the body of a report (same rules in both feeds): { reason, note? }. reason must be one of REPORT_REASONS
 * (400 MSG_INVALID_PARAM { field: 'reason' }); note is optional text, trimmed, at most 500 characters.
 * ASSUMPTION: reason OTHER needs a note (400 MSG_REQUIRED { field: 'note' }): "Lý do khác" alone tells the moderator
 * nothing. Any other field in the body → 400 MSG_INVALID_PARAM.
 * @returns {{ reason: string, note: string | null }}
 */
export function parseReportInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('body');
  const extra = Object.keys(body).find((key) => key !== 'reason' && key !== 'note');
  if (extra) throw invalid(extra);
  if (typeof body.reason !== 'string' || !REPORT_REASONS.includes(body.reason)) throw invalid('reason');
  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') throw invalid('note');
  const note = (body.note ?? '').normalize('NFC').trim();
  if ([...note].length > MAX_REPORT_NOTE_LENGTH) throw invalid('note');
  if (body.reason === 'OTHER' && !note) {
    throw badRequest('MSG_REQUIRED', 'Please describe the reason.', { field: 'note' });
  }
  return { reason: body.reason, note: note || null };
}

// Runs fn inside the caller's transaction when given one (a pg PoolClient), else in a new one.
const inTransaction = (db, fn) => (db === pool ? withTransaction(fn) : fn(db));

/**
 * The comment a report is about, with the post / group it belongs to, so the caller can check it is in ITS feed and
 * that the user moderates it (FE-08: column 'school_post_id'; FE-05: column 'post_id' and groupId). Deleted comments
 * are returned too (isDeleted). null when the id does not exist. forUpdate locks the comment row (handling a report).
 * @returns {Promise<{ commentId: number, column: 'post_id' | 'school_post_id', postId: number, groupId: number | null,
 *   authorId: number, isDeleted: boolean } | null>}
 */
export async function findReportedComment(commentId, { forUpdate = false } = {}, db = pool) {
  const { rows } = await db.query(
    `SELECT c.comment_id AS "commentId",
            CASE WHEN c.school_post_id IS NOT NULL THEN 'school_post_id' ELSE 'post_id' END AS "column",
            COALESCE(c.school_post_id, c.post_id) AS "postId", p.group_id AS "groupId",
            c.author_id AS "authorId", c.deleted_at IS NOT NULL AS "isDeleted"
     FROM comments c
     LEFT JOIN posts p ON p.post_id = c.post_id
     WHERE c.comment_id = $1
     ${forUpdate ? 'FOR UPDATE OF c' : ''}`,
    [commentId],
  );
  return rows[0] ?? null;
}

/**
 * Reports a comment. The caller has checked that the reporter may see the post and that the comment belongs to it.
 * Checked here (same in both feeds): the comment exists and is not deleted (else 404 MSG_COMMENT_NOT_FOUND) and is not
 * the reporter's own (400 MSG_CANNOT_REPORT_OWN_COMMENT). The comment is read FOR SHARE, so it cannot be deleted
 * before the report is saved – pass the caller's transaction client.
 * Reporting the same comment again (UNIQUE (comment_id, reported_by)) is NOT an error: ON CONFLICT DO NOTHING, the
 * first report is kept unchanged (its reason and note, and its status – a report already DISMISSED is not reopened)
 * and created is false (the controller answers 200 instead of 201). Like "like", a double click or two tabs must not
 * turn into an error message, and the user's wish ("this comment is reported") is already true.
 * FE-05 calls it exactly the same way.
 * @param {number} commentId
 * @param {number} reportedBy user id of the reporter
 * @param {{ reason: string, note?: string | null }} input already checked (parseReportInput)
 * @returns {Promise<{ reportId: number, commentId: number, reason: string, note: string | null, status: string,
 *   createdAt: string, created: boolean }>}
 */
export async function reportComment(commentId, reportedBy, { reason, note = null }, db = pool) {
  return inTransaction(db, async (client) => {
    const { rows: found } = await client.query(
      `SELECT author_id AS "authorId", deleted_at IS NOT NULL AS "isDeleted" FROM comments WHERE comment_id = $1
       FOR SHARE`,
      [commentId],
    );
    const comment = found[0];
    if (!comment || comment.isDeleted) throw commentNotFound();
    if (comment.authorId === reportedBy) {
      throw badRequest('MSG_CANNOT_REPORT_OWN_COMMENT', 'You cannot report your own comment.');
    }
    const fields = `report_id AS "reportId", comment_id AS "commentId", reason, note, status, created_at AS "createdAt"`;
    const { rows } = await client.query(
      `INSERT INTO comment_reports (comment_id, reported_by, reason, note, status, created_at)
       VALUES ($1, $2, $3, $4, 'PENDING', NOW())
       ON CONFLICT (comment_id, reported_by) DO NOTHING
       RETURNING ${fields}`,
      [commentId, reportedBy, reason, note],
    );
    if (rows[0]) return { ...rows[0], created: true };
    const { rows: existing } = await client.query(
      `SELECT ${fields} FROM comment_reports WHERE comment_id = $1 AND reported_by = $2`,
      [commentId, reportedBy],
    );
    return { ...existing[0], created: false };
  });
}

/**
 * Adds reportedByMe to every node of a comment tree from feed.listComments, in ONE query (the "Báo cáo" button turns
 * into "Đã báo cáo"). A deleted comment (placeholder) gets false. Opt-in: listComments does not call it; FE-05 calls it
 * after its own permission checks. Returns a new tree; the input is not changed.
 * @param {object[]} items the tree (nodes with commentId, isDeleted, replies)
 * @param {number} userId the reader
 */
export async function withReportedByMe(items, userId, db = pool) {
  const ids = [];
  const walk = (list) => list.forEach((n) => { if (!n.isDeleted) ids.push(n.commentId); walk(n.replies); });
  walk(items);
  let mine = new Set();
  if (ids.length) {
    const { rows } = await db.query(
      `SELECT comment_id AS "commentId" FROM comment_reports
       WHERE reported_by = $1 AND comment_id = ANY($2::bigint[]) AND deleted_at IS NULL`,
      [userId, ids],
    );
    mine = new Set(rows.map((r) => r.commentId));
  }
  const decorate = (list) =>
    list.map((n) => ({ ...n, reportedByMe: !n.isDeleted && mine.has(n.commentId), replies: decorate(n.replies) }));
  return decorate(items);
}

// --- The moderator's queue -----------------------------------------------------------------------------------------

/**
 * WHERE part choosing the comments of one feed (alias c = comments, p = posts). Pushes its values on params.
 * GROUP_POST and ALL need groupIds (an array, possibly empty): the group ids whose comments the caller may read. It is
 * required on purpose – forgetting it must not show every group's comments to one moderator.
 */
function sourceSql({ source, groupIds }, params) {
  const school = 'c.school_post_id IS NOT NULL';
  if (source === REPORT_SOURCES.SCHOOL_POST) return school;
  if (source !== REPORT_SOURCES.GROUP_POST && source !== REPORT_SOURCES.ALL) {
    throw new Error(`commentReports: unknown source ${source}`); // programming error → 500
  }
  if (!Array.isArray(groupIds)) throw new Error('commentReports: groupIds is required for group comments');
  params.push(groupIds);
  const group = `(c.post_id IS NOT NULL AND p.group_id = ANY($${params.length}::bigint[]))`;
  return source === REPORT_SOURCES.ALL ? `(${school} OR ${group})` : group;
}

// A pending report of a comment or a post already deleted has nothing left to decide: it is not shown in the queue
// and not counted (FE-08 closes them when the comment is deleted; this also covers a post deleted meanwhile).
// Moderation (25/11/2026): except a NEEDS_SUPPORT report – the person who may need help still does when the comment is
// gone, so it stays in the queue until someone records what was done (resolvePendingReports leaves it pending).
const STILL_THERE = `(r.reason = 'NEEDS_SUPPORT' OR (c.deleted_at IS NULL AND sp.deleted_at IS NULL AND p.deleted_at IS NULL))`;

// The reported comments of one feed in one status, one row per comment (alias g).
function groupedSql(filter, params) {
  params.push(filter.status);
  const status = `$${params.length}`;
  return `SELECT r.comment_id, COUNT(*) AS report_count, MIN(r.created_at) AS first_reported_at,
                 MAX(r.created_at) AS last_reported_at, MAX(r.resolved_at) AS resolved_at,
                 BOOL_OR(r.reason = 'NEEDS_SUPPORT') AS has_needs_support,
                 BOOL_AND(r.reason = 'NEEDS_SUPPORT') AS needs_support_only,
                 MAX(r.support_note) AS support_note
          FROM comment_reports r
          JOIN comments c ON c.comment_id = r.comment_id
          LEFT JOIN school_posts sp ON sp.school_post_id = c.school_post_id
          LEFT JOIN posts p ON p.post_id = c.post_id
          WHERE r.deleted_at IS NULL AND r.status = ${status} AND ${sourceSql(filter, params)}
            ${filter.status === 'PENDING' ? `AND ${STILL_THERE}` : ''}
          GROUP BY r.comment_id`;
}

/**
 * One page of the reported comments of one feed, ONE item per comment whatever the number of reports, with what the
 * moderator needs to decide without opening the post.
 * @param {{ status: 'PENDING' | 'RESOLVED' | 'DISMISSED', source: 'SCHOOL_POST' | 'GROUP_POST' | 'ALL',
 *   groupIds?: number[], page: number, pageSize: number }} filter
 *   FE-08 (School Manager): { source: 'SCHOOL_POST' } – group comments never come back (§1).
 *   FE-05 (moderator):      { source: 'GROUP_POST', groupIds: [the groups they moderate] }.
 * Order: PENDING oldest first report first (a queue: nothing waits forever); RESOLVED / DISMISSED newest decision first.
 * Moderation (25/11/2026): in PENDING a comment with a NEEDS_SUPPORT report always comes first. Each item also has
 * hasNeedsSupport, needsSupportOnly (then only DISMISS – "Ghi nhận" – is allowed) and supportNote (once decided).
 * PENDING leaves out comments (or posts) already deleted: nothing is left to decide (except NEEDS_SUPPORT reports).
 * @returns {Promise<{ items: object[], page: number, pageSize: number, total: number }>} each item:
 *   { commentId, content, commentCreatedAt, isDeleted, authorId, authorName, authorAvatarUrl,
 *     source: 'SCHOOL_POST' | 'GROUP_POST', postId, postTitle (school post) | null, postExcerpt (group post) | null,
 *     groupId, groupName (group post) | null, postDeleted, status, reportCount, firstReportedAt, lastReportedAt,
 *     reasons: [{ reason, count }] most frequent first, notes: [{ reason, note, createdAt }] (newest first, at most 20,
 *     only reports with a note), resolvedAt, resolvedByName }
 *   No reporter id or name is ever returned (decided 17/11/2026: the author must not learn who reported them, and the
 *   moderator does not need it to judge the comment).
 */
export async function listReports(filter, db = pool) {
  const { status, page, pageSize } = filter;
  if (!REPORT_STATUSES.includes(status)) throw new Error(`commentReports: unknown status ${status}`);
  const countParams = [];
  const { rows: countRows } = await db.query(
    `SELECT COUNT(*) AS total FROM (${groupedSql(filter, countParams)}) g`,
    countParams,
  );
  const params = [];
  const grouped = groupedSql(filter, params);
  params.push(pageSize, (page - 1) * pageSize);
  const order = status === 'PENDING'
    ? 'g.has_needs_support DESC, g.first_reported_at, g.comment_id'
    : 'g.resolved_at DESC NULLS LAST, g.comment_id DESC';
  const { rows } = await db.query(
    `WITH g AS (${grouped})
     SELECT c.comment_id AS "commentId", c.content, c.created_at AS "commentCreatedAt",
            c.deleted_at IS NOT NULL AS "isDeleted", c.parent_comment_id AS "parentCommentId",
            c.author_id AS "authorId", au.full_name AS "authorName", au.avatar_url AS "authorAvatarUrl",
            CASE WHEN c.school_post_id IS NOT NULL THEN 'SCHOOL_POST' ELSE 'GROUP_POST' END AS "source",
            COALESCE(c.school_post_id, c.post_id) AS "postId", sp.title AS "postTitle",
            -- moderation (27/11/2026): the text of a group post its author edited into BLOCKED is theirs alone
            CASE WHEN p.approval_status = 'BLOCKED' THEN NULL ELSE LEFT(p.content, 120) END AS "postExcerpt", p.group_id AS "groupId", gr.group_name AS "groupName",
            COALESCE(sp.deleted_at, p.deleted_at) IS NOT NULL AS "postDeleted",
            $1::varchar AS status, -- groupedSql pushes the status first: it is always $1
            g.report_count AS "reportCount", g.first_reported_at AS "firstReportedAt",
            g.last_reported_at AS "lastReportedAt", g.resolved_at AS "resolvedAt", rb.full_name AS "resolvedByName",
            g.has_needs_support AS "hasNeedsSupport", g.needs_support_only AS "needsSupportOnly",
            g.support_note AS "supportNote",
            (SELECT COALESCE(json_agg(json_build_object('reason', x.reason, 'count', x.n) ORDER BY x.n DESC, x.reason),
                             '[]'::json)
             FROM (SELECT r.reason, COUNT(*) AS n FROM comment_reports r
                   WHERE r.comment_id = g.comment_id AND r.status = $1 AND r.deleted_at IS NULL
                   GROUP BY r.reason) x) AS reasons,
            (SELECT COALESCE(json_agg(json_build_object('reason', y.reason, 'note', y.note, 'createdAt', y.created_at)
                                      ORDER BY y.created_at DESC), '[]'::json)
             FROM (SELECT r.reason, r.note, r.created_at::text AS created_at FROM comment_reports r
                   WHERE r.comment_id = g.comment_id AND r.status = $1 AND r.deleted_at IS NULL AND r.note IS NOT NULL
                   ORDER BY r.created_at DESC LIMIT 20) y) AS notes
     FROM g
     JOIN comments c ON c.comment_id = g.comment_id
     JOIN users au ON au.user_id = c.author_id
     LEFT JOIN school_posts sp ON sp.school_post_id = c.school_post_id
     LEFT JOIN posts p ON p.post_id = c.post_id
     LEFT JOIN groups gr ON gr.group_id = p.group_id
     LEFT JOIN LATERAL (
       SELECT u.full_name FROM comment_reports r JOIN users u ON u.user_id = r.resolved_by
       WHERE r.comment_id = g.comment_id AND r.status = $1 AND r.deleted_at IS NULL AND r.resolved_by IS NOT NULL
       ORDER BY r.resolved_at DESC LIMIT 1) rb ON TRUE
     ORDER BY ${order}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { items: rows, page, pageSize, total: countRows[0].total };
}

/**
 * Number of reported comments waiting in one feed (the same items listReports({ status: 'PENDING' }) returns, so a
 * badge and the queue always agree). Same filter as listReports, without status / paging.
 * FE-08: countPendingReports({ source: 'SCHOOL_POST' }); FE-05: { source: 'GROUP_POST', groupIds }.
 * @returns {Promise<number>}
 */
export async function countPendingReports(filter, db = pool) {
  const params = [];
  const { rows } = await db.query(
    `SELECT COUNT(*) AS total FROM (${groupedSql({ ...filter, status: 'PENDING' }, params)}) g`,
    params,
  );
  return rows[0].total;
}

/**
 * Marks every PENDING report of a comment RESOLVED (resolved_by, resolved_at = NOW()). For a comment deleted another
 * way (FE-08 UC-66, FE-05 delete from the thread): call it in the same transaction, right after softDeleteComment.
 * ASSUMPTION (moderation, 25/11/2026): a NEEDS_SUPPORT report is NOT closed this way – deleting the comment does not
 * help the person who may need help, and closing it needs a "Kết quả hỗ trợ". It stays PENDING (still listed, see
 * STILL_THERE) until a moderator records one with resolveReport.
 * @returns {Promise<number>} how many reports were closed
 */
export async function resolvePendingReports(commentId, resolvedBy, db = pool) {
  const { rowCount } = await db.query(
    `UPDATE comment_reports SET status = 'RESOLVED', resolved_by = $2, resolved_at = NOW()
     WHERE comment_id = $1 AND status = 'PENDING' AND deleted_at IS NULL AND reason <> 'NEEDS_SUPPORT'`,
    [commentId, resolvedBy],
  );
  return rowCount;
}

/**
 * The moderator's decision on a reported comment; closes EVERY pending report of it at once.
 *   DELETE   soft-deletes the comment (feed.softDeleteComment: deleted_at / deleted_by; its replies stay, it shows as
 *            "Bình luận đã bị xoá" while one is visible) and marks the pending reports RESOLVED.
 *   DISMISS  marks them DISMISSED; the comment is not touched.
 * Both in one transaction (pass the caller's client: the caller has locked the comment with findReportedComment and
 * checked it moderates it). No pending report → 409 MSG_REPORT_ALREADY_HANDLED when the comment had reports (another
 * moderator decided first), else 404 MSG_REPORT_NOT_FOUND. A comment already deleted meanwhile is not deleted again
 * (commentDeleted false: no second notification).
 * The notification is NOT sent here: the caller sends it AFTER COMMIT with notifyCommentRemoved (fire and forget).
 * FE-05 calls it exactly the same way.
 * Moderation (25/11/2026), options.supportNote ("Kết quả hỗ trợ"):
 *   - a pending NEEDS_SUPPORT report → supportNote required (400 MSG_SUPPORT_NOTE_REQUIRED), written on those reports;
 *   - EVERY pending report NEEDS_SUPPORT → only DISMISS ("Ghi nhận"); DELETE → 400 MSG_REPORT_SUPPORT_ONLY;
 *   - DELETE writes a moderation_violations row (source REPORT, category = reportCategory of the other reasons).
 * @param {number} commentId
 * @param {number} resolvedBy the moderator's user id
 * @param {'DELETE' | 'DISMISS'} action
 * @param {import('pg').PoolClient | import('pg').Pool} [db]
 * @param {{ supportNote?: string }} [options]
 * @returns {Promise<{ commentId: number, action: string, status: 'RESOLVED' | 'DISMISSED', resolvedCount: number,
 *   commentDeleted: boolean, authorId: number, target: { column: string, id: number }, reason: string | null }>}
 *   reason = the most frequent reason of the closed reports OTHER than NEEDS_SUPPORT (for the notification, which
 *   never mentions a "Cần được hỗ trợ" report); null when every report was NEEDS_SUPPORT.
 */
export async function resolveReport(commentId, resolvedBy, action, db = pool, { supportNote } = {}) {
  if (!REPORT_ACTIONS.includes(action)) throw new Error(`commentReports: unknown action ${action}`);
  return inTransaction(db, async (client) => {
    const comment = await findReportedComment(commentId, { forUpdate: true }, client);
    if (!comment) throw notFound('MSG_REPORT_NOT_FOUND', 'No report was found for this comment.');
    // Locked: two moderators deciding together cannot both close the same reports.
    const { rows: pendingRows } = await client.query(
      `SELECT report_id, reason FROM comment_reports
       WHERE comment_id = $1 AND status = 'PENDING' AND deleted_at IS NULL
       FOR UPDATE`,
      [commentId],
    );
    const counts = new Map();
    for (const r of pendingRows) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
    const pending = [...counts].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n || a.reason.localeCompare(b.reason));
    if (!pending.length) {
      const { rows } = await client.query(
        'SELECT 1 FROM comment_reports WHERE comment_id = $1 AND deleted_at IS NULL LIMIT 1',
        [commentId],
      );
      if (rows.length) {
        throw new AppError(409, 'MSG_REPORT_ALREADY_HANDLED', 'The reports of this comment have already been handled.');
      }
      throw notFound('MSG_REPORT_NOT_FOUND', 'No report was found for this comment.');
    }
    const hasSupport = counts.has(NEEDS_SUPPORT);
    const category = reportCategory(pending.map((p) => ({ reason: p.reason, count: p.n })));
    const note = parseSupportNote(supportNote, hasSupport);
    if (action === 'DELETE' && !category) {
      throw badRequest('MSG_REPORT_SUPPORT_ONLY', 'Reports that only ask for support are recorded, not deleted.', {
        field: 'action',
      });
    }
    // "Kết quả hỗ trợ" on the NEEDS_SUPPORT reports first: they are closed together with the others below.
    if (note) {
      await client.query(
        `UPDATE comment_reports SET support_note = $2
         WHERE comment_id = $1 AND status = 'PENDING' AND deleted_at IS NULL AND reason = 'NEEDS_SUPPORT'`,
        [commentId, note],
      );
    }
    const target = { column: comment.column, id: comment.postId };
    let commentDeleted = false;
    if (action === 'DELETE') {
      commentDeleted = comment.isDeleted ? false : await softDeleteComment(target, commentId, resolvedBy, client);
      if (commentDeleted) {
        await recordReportViolation(client, {
          contentType: comment.column === FEED_COLUMNS.SCHOOL_POST ? 'SCHOOL_COMMENT' : 'GROUP_COMMENT',
          commentId,
          authorId: comment.authorId,
          category,
        });
      }
    }
    const status = action === 'DELETE' ? 'RESOLVED' : 'DISMISSED';
    // Every pending report of the comment, NEEDS_SUPPORT included (resolvePendingReports leaves those alone).
    const { rowCount: resolvedCount } = await client.query(
      `UPDATE comment_reports SET status = $3, resolved_by = $2, resolved_at = NOW()
       WHERE comment_id = $1 AND status = 'PENDING' AND deleted_at IS NULL`,
      [commentId, resolvedBy, status],
    );
    return {
      commentId,
      action,
      status,
      resolvedCount,
      commentDeleted,
      authorId: comment.authorId,
      target,
      reason: category,
    };
  });
}

// --- Notification to the author of a deleted comment (business-rules §9) -------------------------------------------

const EXCERPT_LENGTH = 80;
const excerpt = (text, max) => {
  const chars = [...String(text ?? '').replace(/\s+/g, ' ').trim()];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
};

/**
 * Tells the author of a comment deleted after reports that it was deleted (business-rules §9): ONE notifications row
 * and ONE notification_recipients row (the author), in one transaction. Call it AFTER the COMMIT of resolveReport,
 * fire and forget with .catch (a failed notification never undoes the decision), only when commentDeleted is true.
 *   type        'SCHOOL_POST' (school feed) or 'GROUP_POST' (group feed): the feature the comment lives in.
 *   target      SCHOOL_POST / POST + the post id: clicking opens the post the comment was under.
 *   is_personal TRUE: it is about this one person, with detail (the comment and the reason) – §9 personal
 *               notifications are "important items with more detail"; a bell-only line would not say which comment.
 *   created_by  the moderator who decided (FE-09 UC-68 "who has not read" belongs to the creator).
 * The text names NOBODY: not the reporters (decided 17/11/2026), not the moderator – only that the comment was
 * reported and reviewed, and the most frequent reason.
 * @param {{ commentId: number, authorId: number, target: { column: string, id: number }, reason: string }} result
 *   what resolveReport returned
 * @param {number} createdBy the moderator's user id
 * @returns {Promise<number>} the notification id
 */
export async function notifyCommentRemoved({ commentId, authorId, target, reason }, createdBy, db = pool) {
  const school = target.column === FEED_COLUMNS.SCHOOL_POST;
  return inTransaction(db, async (client) => {
    const { rows: info } = await client.query(
      `SELECT c.content, sp.title, gr.group_name AS "groupName"
       FROM comments c
       LEFT JOIN school_posts sp ON sp.school_post_id = c.school_post_id
       LEFT JOIN posts p ON p.post_id = c.post_id
       LEFT JOIN groups gr ON gr.group_id = p.group_id
       WHERE c.comment_id = $1`,
      [commentId],
    );
    const { content, title: postTitle, groupName } = info[0] ?? {};
    const where = school
      ? `trong bài “${excerpt(postTitle, 120)}” trên bảng tin trường`
      : `trong một bài viết của nhóm ${groupName ? `“${excerpt(groupName, 120)}”` : 'lớp'}`;
    const detail =
      `Bình luận “${excerpt(content, EXCERPT_LENGTH)}” của bạn ${where} đã bị xoá sau khi được báo cáo và xem xét. ` +
      `Lý do: ${REASON_LABELS[reason] ?? REASON_LABELS.OTHER}. ` +
      'Vui lòng giữ lời lẽ phù hợp khi bình luận.';
    const { rows } = await client.query(
      `INSERT INTO notifications (type, title, detail, is_personal, target_type, target_id, created_by, created_at)
       VALUES ($1, 'Bình luận của bạn đã bị xoá', $2, TRUE, $3, $4, $5, NOW())
       RETURNING notification_id AS "notificationId"`,
      [school ? 'SCHOOL_POST' : 'GROUP_POST', detail, school ? 'SCHOOL_POST' : 'POST', target.id, createdBy],
    );
    const { notificationId } = rows[0];
    // FE-09 (Quoc, 18/11/2026, lead): a comment does not store the role it was written under, so the author gets the
    // notice under each of their roles that can read feeds (every role but SYSTEM_ADMIN); reading it under one role
    // does not mark the others (notification_recipients.role_code).
    await client.query(
      `INSERT INTO notification_recipients (notification_id, user_id, role_code, student_id, read_at)
       SELECT $1, ur.user_id, r.role_code, NULL, NULL
       FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
       WHERE ur.user_id = $2 AND r.role_code <> 'SYSTEM_ADMIN'`,
      [notificationId, authorId],
    );
    return notificationId;
  });
}
