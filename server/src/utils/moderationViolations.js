import { findCurrentEnrollments } from '../modules/students/students.service.js';

// moderation_violations rows – shared by comments (utils/feedInteractions.js insertComment, utils/commentReports.js
// resolveReport) and chat messages (modules/conversations sendMessage, modules/moderation report decisions). Always
// written with the caller's transaction client, together with the change of the content itself.
//   AUTO    the automatic check matched rules (rule_ids = the rules)        – phase 3 / 4
//   REPORT  a moderator hid / deleted the content after reports (no rules)  – phase 5

// moderation_violations.class_id: the author's current class when they have the STUDENT role, else null. Uses the
// shared "current enrollment" of UC-07 / UC-08 (students.service findCurrentEnrollments: this school year, STUDYING
// first, else the latest), so the statistics screen groups by the same class the student list shows.
async function currentClassOfStudent(userId, db) {
  const { rows } = await db.query(
    `SELECT s.student_id AS "studentId"
     FROM students s
     WHERE s.user_id = $1
       AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
                   WHERE ur.user_id = s.user_id AND r.role_code = 'STUDENT')`,
    [userId],
  );
  if (!rows.length) return null;
  const enrollment = (await findCurrentEnrollments([rows[0].studentId], db)).get(rows[0].studentId);
  return enrollment?.classId ?? null;
}

/**
 * Writes the AUTO violation of one comment or one message (exactly one of commentId / messageId).
 * @param {import('pg').PoolClient} client the caller's transaction client
 * @param {{ contentType: 'SCHOOL_COMMENT' | 'GROUP_COMMENT' | 'MESSAGE', commentId?: number, messageId?: number,
 *   authorId: number, category: string, ruleIds: number[] }} violation
 */
export async function recordAutoViolation(client, { contentType, commentId = null, messageId = null, authorId, category, ruleIds }) {
  await client.query(
    `INSERT INTO moderation_violations (content_type, comment_id, message_id, author_id, class_id, source, category, rule_ids)
     VALUES ($1, $2, $3, $4, $5, 'AUTO', $6, $7::bigint[])`,
    [contentType, commentId, messageId, authorId, await currentClassOfStudent(authorId, client), category, ruleIds],
  );
}

// Report reasons that are violations, in the order that breaks a tie (docs/moderation-plan.md "Luồng báo cáo").
// NEEDS_SUPPORT is never a violation: it is someone who needs help, not a breach of the rules.
export const VIOLATION_REASON_ORDER = Object.freeze(['INAPPROPRIATE_LANGUAGE', 'HARASSMENT', 'SPAM', 'FALSE_INFORMATION', 'OTHER']);

/**
 * The category of a violation decided from reports: the reason chosen by the most reporters among the reasons OTHER
 * than NEEDS_SUPPORT; a tie goes to the first in VIOLATION_REASON_ORDER. null when every report is NEEDS_SUPPORT.
 * @param {{ reason: string, count: number | string }[]} reasons the pending reports grouped by reason
 */
export function reportCategory(reasons) {
  let best = null;
  for (const { reason, count } of reasons) {
    const rank = VIOLATION_REASON_ORDER.indexOf(reason);
    if (rank < 0) continue;
    const n = Number(count);
    if (!best || n > best.n || (n === best.n && rank < best.rank)) best = { reason, n, rank };
  }
  return best?.reason ?? null;
}

/**
 * Writes the REPORT violation of one comment or one message hidden / deleted by a moderator (rule_ids NULL).
 * One content has at most one violation row (unique index moderation_violations_comment_key / _message_key). When one
 * already exists (docs/moderation-plan.md "Ghi vi phạm cho nội dung đã từng được gỡ ẩn", 25/11/2026):
 *   - UNHIDDEN (hidden automatically, unhidden by the School Manager, then reported and removed): it comes back to
 *     ACTIVE – unhidden_by / unhidden_at / unhide_reason cleared – keeping its source, category and rule_ids: the
 *     reviewer has just confirmed the rule was right, the earlier unhide was the mistake;
 *   - ACTIVE: kept as it is.
 * @returns {Promise<boolean>} true when a row was written or brought back to ACTIVE
 */
export async function recordReportViolation(client, { contentType, commentId = null, messageId = null, authorId, category }) {
  const target = commentId != null ? 'comment_id' : 'message_id';
  const { rows } = await client.query(
    `INSERT INTO moderation_violations (content_type, comment_id, message_id, author_id, class_id, source, category, rule_ids)
     VALUES ($1, $2, $3, $4, $5, 'REPORT', $6, NULL)
     ON CONFLICT (${target}) WHERE ${target} IS NOT NULL DO UPDATE
       SET status = 'ACTIVE', unhidden_by = NULL, unhidden_at = NULL, unhide_reason = NULL
       WHERE moderation_violations.status = 'UNHIDDEN'
     RETURNING violation_id`,
    [contentType, commentId, messageId, authorId, await currentClassOfStudent(authorId, client), category],
  );
  return rows.length > 0;
}
