import { pool, withTransaction } from '../../config/db.js';
import { emitToUsers } from '../../sockets/index.js';
import { AppError, badRequest, forbidden, notFound } from '../../utils/AppError.js';
import { logActivity } from '../../utils/activityLog.js';
import { MAX_REPORT_NOTE_LENGTH, parseSupportNote } from '../../utils/commentReports.js';
import { notifyContentHidden, notifySupportRequest } from '../../utils/moderationNotify.js';
import { recordReportViolation, reportCategory } from '../../utils/moderationViolations.js';
import { getNumberSetting } from '../../utils/settings.js';
import { activeMemberIds, findVisibleMessage, openChat } from '../conversations/conversations.service.js';

// Moderation phase 5 (FE-08, owner Anh, 25/11/2026) – reports of chat messages (docs/moderation-plan.md "Luồng báo
// cáo" > "Tin nhắn — luồng mới", "Quyền xem nội dung và nhật ký"). Same shape as the comment reports
// (utils/commentReports.js), in their own table message_reports.
//
//   reportMessage             a member reports someone else's message (FE-06's own checks: openChat, findVisibleMessage)
//   listMessageReports        the School Manager's queue, one item per message; never the content, never a reporter
//   getReportedMessage        the reported message ALONE (no message around it), while a report is open; not logged
//   readReportContext         the ONLY way the School Manager reads other messages of a chat: 6 before + 6 after the
//                             reported one, after giving a reason; every read is logged in the same function
//   resolveMessageReport      HIDE / KEEP, closing every pending report of the message at once
//
// Nobody ever learns who reported: no function here returns a reporter's id or name, and the notifications name nobody.
// getReportedMessage / readReportContext do NOT go through openChat (which refuses anyone who is not a member, the School Manager
// included) and nothing here widens any chat API: it checks everything itself and only reads.

export const MESSAGE_REPORT_REASONS = Object.freeze([
  'INAPPROPRIATE_LANGUAGE',
  'HARASSMENT',
  'SPAM',
  'FALSE_INFORMATION',
  'NEEDS_SUPPORT',
  'OTHER',
]); // message_reports_reason_check
export const MESSAGE_REPORT_ACTIONS = Object.freeze(['HIDE', 'KEEP']);
export const QUEUE_STATUSES = Object.freeze(['PENDING', 'HANDLED']);
export const MAX_VIEW_REASON_LENGTH = 500;
// Messages before / after the reported one in "Xem hội thoại xung quanh" (moderation.context_window, 27/11/2026):
// default 6, always kept within 0-20 whatever the setting says. There is no way to read more of a chat.
const DEFAULT_CONTEXT_WINDOW = 6;
const MAX_CONTEXT_WINDOW = 20;

const invalid = (field) => badRequest('MSG_INVALID_PARAM', `Invalid value for "${field}".`, { field });
const conflict = (code, message) => new AppError(409, code, message);
const reportNotFound = () => notFound('MSG_REPORT_NOT_FOUND', 'No report was found for this message.');

function positiveId(value, field) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw invalid(field);
  return id;
}

// The School Manager only, by the ACTIVE role – checked here as well as on the route: these functions are the only
// door to chat content for a non-member, so they never rely on the caller.
function assertManager(user) {
  if (user?.activeRole !== 'SCHOOL_MANAGER') throw forbidden();
}

// --- Report a message ---------------------------------------------------------------------------------------------

/**
 * Body of POST /moderation/message-reports: { messageId, reason, note? }. reason: one of MESSAGE_REPORT_REASONS
 * (400 MSG_INVALID_PARAM); note optional, trimmed, at most 500 characters; OTHER needs a note (400 MSG_REQUIRED),
 * as for comments. Any other field → 400 MSG_INVALID_PARAM.
 */
export function parseMessageReport(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('body');
  const extra = Object.keys(body).find((key) => !['messageId', 'reason', 'note'].includes(key));
  if (extra) throw invalid(extra);
  const messageId = positiveId(body.messageId, 'messageId');
  if (typeof body.reason !== 'string' || !MESSAGE_REPORT_REASONS.includes(body.reason)) throw invalid('reason');
  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') throw invalid('note');
  const note = (body.note ?? '').normalize('NFC').trim();
  if ([...note].length > MAX_REPORT_NOTE_LENGTH) throw invalid('note');
  if (body.reason === 'OTHER' && !note) throw badRequest('MSG_REQUIRED', 'Please describe the reason.', { field: 'note' });
  return { messageId, reason: body.reason, note: note || null };
}

/**
 * A member reports a message of someone else in a chat they are in.
 * Refused: a message that does not exist or that the user cannot see in the chat (404 MSG_MESSAGE_NOT_FOUND, FE-06's
 * findVisibleMessage: since they first joined, not deleted for themselves); a chat they are not (or no longer) a member
 * of, or may not open with the active role (FE-06's openChat: 403 / 404); their own message (400
 * MSG_CANNOT_REPORT_OWN_MESSAGE); a system line (400 MSG_SYSTEM_MESSAGE); a message deleted for everyone or hidden
 * (409 MSG_MESSAGE_DELETED). Reporting again: 200, nothing changes (created false), as for comments.
 * NEEDS_SUPPORT: after COMMIT every School Manager is told at once (moderationNotify.notifySupportRequest).
 * @returns {Promise<{ messageId: number, reportedByMe: true, created: boolean, supportHint: boolean }>}
 *   supportHint: show the reporter the "báo ngay thầy cô hoặc gọi 111" line (reason NEEDS_SUPPORT).
 */
export async function reportMessage(user, { messageId, reason, note }) {
  const { rows } = await pool.query('SELECT group_id AS "groupId" FROM messages WHERE message_id = $1 AND deleted_at IS NULL', [
    messageId,
  ]);
  if (!rows.length) throw notFound('MSG_MESSAGE_NOT_FOUND', 'Message not found.');
  const group = await openChat(pool, user, rows[0].groupId); // an active member who may open this chat
  const message = await findVisibleMessage(pool, user, group.groupId, messageId);
  if (message.isSystem) throw badRequest('MSG_SYSTEM_MESSAGE', 'A system line cannot be reported.');
  if (message.senderId === user.userId) {
    throw badRequest('MSG_CANNOT_REPORT_OWN_MESSAGE', 'You cannot report your own message.');
  }
  const created = await withTransaction(async (client) => {
    // Read again FOR SHARE: the message cannot be deleted for everyone or hidden before the report is saved.
    const { rows: locked } = await client.query(
      `SELECT deleted_for_everyone_at IS NOT NULL AS "isDeleted" FROM messages WHERE message_id = $1 FOR SHARE`,
      [messageId],
    );
    if (message.isDeleted || locked[0]?.isDeleted) throw conflict('MSG_MESSAGE_DELETED', 'This message has been deleted.');
    const { rowCount } = await client.query(
      `INSERT INTO message_reports (message_id, reported_by, reason, note, status, created_at)
       VALUES ($1, $2, $3, $4, 'PENDING', NOW())
       ON CONFLICT ON CONSTRAINT message_reports_message_id_reported_by_key DO NOTHING`,
      [messageId, user.userId, reason, note],
    );
    return rowCount > 0;
  });
  if (created && reason === 'NEEDS_SUPPORT') {
    notifySupportRequest({ kind: 'MESSAGE', id: messageId }).catch((err) =>
      console.error(`[moderation] support request for message #${messageId} not sent:`, err?.message),
    );
  }
  return { messageId, reportedByMe: true, created, supportHint: reason === 'NEEDS_SUPPORT' };
}

// --- The School Manager's queue -----------------------------------------------------------------------------------

/**
 * GET /moderation/message-reports?status=PENDING|HANDLED: one item per reported MESSAGE, never its content and never
 * a reporter. PENDING: messages with a pending report – NEEDS_SUPPORT first, then the earliest report first (a queue).
 * HANDLED: messages whose reports are all decided – newest decision first.
 * Each item: messageId, group { groupId, groupName (null for a 1-1 chat: its other member is the reporter), groupType },
 * sender { userId, fullName, roles, className }, sentAt, isDeleted / isModerated / isRecalled, reportCount,
 * firstReportedAt, lastReportedAt, reasons [{ reason, count }], notes [{ reason, note, createdAt }] (at most 20),
 * hasNeedsSupport, needsSupportOnly, status (PENDING | RESOLVED | DISMISSED), resolvedAt, resolvedByName, supportNote.
 * HANDLED items also carry (27/11/2026, the "Hành vi xử lý" of the tab "Đã xử lý", seen by every School Manager):
 * decision ('HIDE' | 'KEEP', from status) and contextViews [{ viewerName, viewedAt, reason }] – every "Xem hội thoại
 * xung quanh" of this message, oldest first, from activity_logs (CHAT_CONTEXT_VIEW, detail.reportMessageId).
 * ASSUMPTION: a message reported again after a decision lists the views of every round (they share reportMessageId).
 * ASSUMPTION: className = the sender's class of THIS group when they study in it, else their latest STUDYING class;
 * null for a teacher / parent / School Manager. HANDLED lists the decided reports of messages with none pending.
 */
// Extra columns of a HANDLED item. The log's detail is TEXT holding JSON: it is cast only on CHAT_CONTEXT_VIEW rows
// (CASE), which logActivity always writes as JSON; target_id narrows the rows first.
const HANDLED_FIELDS = `
            (SELECT CASE r.status WHEN 'RESOLVED' THEN 'HIDE' WHEN 'DISMISSED' THEN 'KEEP' END
             FROM message_reports r WHERE r.message_id = g.message_id AND r.deleted_at IS NULL AND r.status <> 'PENDING'
             ORDER BY r.resolved_at DESC LIMIT 1) AS decision,
            (SELECT COALESCE(json_agg(json_build_object('viewerName', vu.full_name, 'viewedAt', l.created_at::text,
                                                        'reason', CASE WHEN l.action = 'CHAT_CONTEXT_VIEW'
                                                                       THEN l.detail::jsonb ->> 'reason' END)
                                      ORDER BY l.created_at, l.log_id), '[]'::json)
             FROM activity_logs l
             LEFT JOIN users vu ON vu.user_id = l.user_id
             WHERE l.action = 'CHAT_CONTEXT_VIEW' AND l.target_type = 'MESSAGE' AND l.target_id = g.message_id
               AND (CASE WHEN l.action = 'CHAT_CONTEXT_VIEW' THEN l.detail::jsonb ->> 'reportMessageId' END)
                   = g.message_id::text) AS "contextViews",`;

export async function listMessageReports(user, { status, page, pageSize }) {
  assertManager(user);
  const pending = status === 'PENDING';
  const which = pending ? `r.status = 'PENDING'` : `r.status <> 'PENDING'`;
  const grouped = `
    SELECT r.message_id, COUNT(*) AS report_count, MIN(r.created_at) AS first_reported_at,
           MAX(r.created_at) AS last_reported_at, MAX(r.resolved_at) AS resolved_at,
           BOOL_OR(r.reason = 'NEEDS_SUPPORT') AS has_needs_support,
           BOOL_AND(r.reason = 'NEEDS_SUPPORT') AS needs_support_only,
           MAX(r.support_note) AS support_note
    FROM message_reports r
    WHERE r.deleted_at IS NULL AND ${which}
      ${pending ? '' : `AND NOT EXISTS (SELECT 1 FROM message_reports p WHERE p.message_id = r.message_id
                                          AND p.status = 'PENDING' AND p.deleted_at IS NULL)`}
    GROUP BY r.message_id`;
  const { rows: totalRows } = await pool.query(`SELECT COUNT(*) AS total FROM (${grouped}) g`);
  const { rows } = await pool.query(
    `WITH g AS (${grouped})
     SELECT m.message_id AS "messageId",
            json_build_object('groupId', gr.group_id, 'groupType', gr.group_type,
                              'groupName', CASE WHEN gr.group_type = 'DIRECT' THEN NULL ELSE gr.group_name END) AS "group",
            json_build_object(
              'userId', su.user_id, 'fullName', su.full_name,
              'roles', (SELECT COALESCE(json_agg(ro.role_code ORDER BY ro.role_id), '[]'::json)
                        FROM user_roles ur JOIN roles ro ON ro.role_id = ur.role_id
                        WHERE ur.user_id = su.user_id AND ro.role_code <> 'SYSTEM_ADMIN'),
              'className', (SELECT c.class_name FROM students s
                            JOIN class_enrollments ce ON ce.student_id = s.student_id
                            JOIN classes c ON c.class_id = ce.class_id
                            WHERE s.user_id = su.user_id
                            ORDER BY (ce.class_id = gr.class_id) DESC, (ce.status = 'STUDYING') DESC, ce.enrolled_at DESC
                            LIMIT 1)) AS sender,
            m.sent_at AS "sentAt",
            m.deleted_for_everyone_at IS NOT NULL AS "isDeleted",
            (m.deleted_for_everyone_at IS NOT NULL AND m.deleted_for_everyone_by IS NULL) AS "isModerated",
            (m.deleted_for_everyone_by IS NOT NULL) AS "isRecalled",
            g.report_count AS "reportCount", g.first_reported_at AS "firstReportedAt",
            g.last_reported_at AS "lastReportedAt",
            g.has_needs_support AS "hasNeedsSupport", g.needs_support_only AS "needsSupportOnly",
            (SELECT COALESCE(json_agg(json_build_object('reason', x.reason, 'count', x.n) ORDER BY x.n DESC, x.reason), '[]'::json)
             FROM (SELECT r.reason, COUNT(*) AS n FROM message_reports r
                   WHERE r.message_id = g.message_id AND r.deleted_at IS NULL AND ${which}
                   GROUP BY r.reason) x) AS reasons,
            (SELECT COALESCE(json_agg(json_build_object('reason', y.reason, 'note', y.note, 'createdAt', y.created_at)
                                      ORDER BY y.created_at DESC), '[]'::json)
             FROM (SELECT r.reason, r.note, r.created_at::text AS created_at FROM message_reports r
                   WHERE r.message_id = g.message_id AND r.deleted_at IS NULL AND ${which} AND r.note IS NOT NULL
                   ORDER BY r.created_at DESC LIMIT 20) y) AS notes,
            ${pending ? `'PENDING'` : `(SELECT r.status FROM message_reports r WHERE r.message_id = g.message_id
                                         AND r.deleted_at IS NULL AND r.status <> 'PENDING'
                                         ORDER BY r.resolved_at DESC LIMIT 1)`} AS status,
            g.resolved_at AS "resolvedAt", g.support_note AS "supportNote",${pending ? '' : HANDLED_FIELDS}
            (SELECT u.full_name FROM message_reports r JOIN users u ON u.user_id = r.resolved_by
             WHERE r.message_id = g.message_id AND r.deleted_at IS NULL AND r.resolved_by IS NOT NULL
             ORDER BY r.resolved_at DESC LIMIT 1) AS "resolvedByName"
     FROM g
     JOIN messages m ON m.message_id = g.message_id
     JOIN groups gr ON gr.group_id = m.group_id
     JOIN users su ON su.user_id = m.sender_id
     ORDER BY ${pending ? 'g.has_needs_support DESC, g.first_reported_at, g.message_id' : 'g.resolved_at DESC NULLS LAST, g.message_id DESC'}
     LIMIT $1 OFFSET $2`,
    [pageSize, (page - 1) * pageSize],
  );
  const { rows: counts } = await pool.query(
    `SELECT COUNT(DISTINCT message_id) AS "pendingCount",
            COUNT(DISTINCT message_id) FILTER (WHERE reason = 'NEEDS_SUPPORT') AS "supportCount"
     FROM message_reports WHERE status = 'PENDING' AND deleted_at IS NULL`,
  );
  return { items: rows, page, pageSize, total: totalRows[0].total, ...counts[0] };
}

// --- Reading the chat of a reported message (School Manager only, logged) ------------------------------------------

// The messages of a chat as the School Manager reads them for a report (module's own SELECT, read only):
//   - deleted for everyone by its sender (deleted_for_everyone_by set): no content, no files – as FE-06 shows it;
//   - hidden by the moderation (deleted_for_everyone_by NULL): its content, with isModerated (this is the evidence);
//   - a system line: as FE-06 sends it (type / event / content / targetName);
//   - files: their names only, never a link.
// $1 = the reported message id (isReported); the WHERE / ORDER / LIMIT come from the caller.
// One exception to "recalled = no content" (docs "Rào chắn" 5, 25/11/2026): the REPORTED message itself, recalled by
// its sender AFTER its first report – the content stays readable, with recalledAfterReport, so recalling cannot erase
// the evidence once someone has reported it. Every other recalled message stays empty.
const RECALLED_AFTER_REPORT = `(m.message_id = $1 AND m.deleted_for_everyone_by IS NOT NULL
  AND m.deleted_for_everyone_at > (SELECT MIN(fr.created_at) FROM message_reports fr
                                   WHERE fr.message_id = $1 AND fr.deleted_at IS NULL))`;
const MESSAGE_FIELDS = `
  m.message_id AS "messageId", m.sender_id AS "senderId", u.full_name AS "senderName", e.nickname AS "senderNickname",
  m.sent_at AS "sentAt", m.message_type AS "type", m.system_event AS "event", m.target_user_id AS "targetUserId",
  tu.full_name AS "targetName",
  CASE WHEN m.deleted_for_everyone_by IS NOT NULL AND NOT COALESCE(${RECALLED_AFTER_REPORT}, FALSE) THEN NULL
       ELSE m.content END AS content,
  (m.deleted_for_everyone_by IS NOT NULL) AS "isRecalled",
  COALESCE(${RECALLED_AFTER_REPORT}, FALSE) AS "recalledAfterReport",
  (m.deleted_for_everyone_at IS NOT NULL AND m.deleted_for_everyone_by IS NULL) AS "isModerated",
  m.reply_to_message_id AS "replyToMessageId",
  (m.message_id = $1) AS "isReported",
  CASE WHEN m.deleted_for_everyone_by IS NOT NULL AND NOT COALESCE(${RECALLED_AFTER_REPORT}, FALSE) THEN '[]'::json
       ELSE COALESCE((SELECT json_agg(json_build_object('fileName', a.file_name)
                                      ORDER BY a.sort_order NULLS LAST, a.created_at, a.attachment_id)
                      FROM attachments a WHERE a.message_id = m.message_id AND a.deleted_at IS NULL), '[]'::json)
  END AS attachments`;
const MESSAGE_FROM = `
  FROM messages m
  JOIN groups g ON g.group_id = m.group_id
  JOIN users u ON u.user_id = m.sender_id
  LEFT JOIN users tu ON tu.user_id = m.target_user_id
  LEFT JOIN students st ON st.user_id = m.sender_id
  LEFT JOIN class_enrollments e ON e.student_id = st.student_id AND e.class_id = g.class_id`;

// The reported message, its chat and its reports – or the reason it cannot be read: no such message / no report at
// all → 404 MSG_REPORT_NOT_FOUND; every report already decided → 403 MSG_REPORT_CLOSED (reading belongs to an OPEN
// report, docs "Rào chắn" 2: a handled report never gives the content again).
async function openReport(db, messageId) {
  const { rows } = await db.query(
    `SELECT m.message_id AS "messageId", m.group_id AS "groupId", g.group_type AS "groupType",
            CASE WHEN g.group_type = 'DIRECT' THEN NULL ELSE g.group_name END AS "groupName",
            COUNT(r.report_id) AS "reportCount",
            COUNT(r.report_id) FILTER (WHERE r.status = 'PENDING') AS "pendingCount"
     FROM messages m
     JOIN groups g ON g.group_id = m.group_id
     LEFT JOIN message_reports r ON r.message_id = m.message_id AND r.deleted_at IS NULL
     WHERE m.message_id = $1 AND m.deleted_at IS NULL
     GROUP BY m.message_id, g.group_id`,
    [messageId],
  );
  const report = rows[0];
  if (!report || !report.reportCount) throw reportNotFound();
  if (!report.pendingCount) {
    throw forbidden('MSG_REPORT_CLOSED', 'The reports of this message have been handled; the message can no longer be read.');
  }
  return report;
}

// The reason of "Xem hội thoại xung quanh": required, trimmed, 1-500 characters.
function parseViewReason(value) {
  if (value !== undefined && value !== null && typeof value !== 'string') throw invalid('reason');
  const reason = (value ?? '').normalize('NFC').trim();
  if (!reason) {
    throw badRequest('MSG_VIEW_REASON_REQUIRED', 'Please give a reason to read the messages around this one.', { field: 'reason' });
  }
  if ([...reason].length > MAX_VIEW_REASON_LENGTH) throw invalid('reason');
  return reason;
}

// Messages of the reported message's chat ($2), read only; $1 = the reported message. where / order / limit are
// constants of this file, never user input.
const selectMessages = (messageId, groupId, where, order, limit) =>
  pool.query(
    `SELECT ${MESSAGE_FIELDS} ${MESSAGE_FROM}
     WHERE m.group_id = $2 AND m.deleted_at IS NULL AND ${where}
     ORDER BY ${order} LIMIT ${Number(limit)}`,
    [messageId, groupId],
  );

/**
 * GET /moderation/message-reports/:messageId (School Manager, 27/11/2026): the reported message ALONE – its content,
 * sender, time and file names (recalledAfterReport rule as above) – while it has an open report. No other message of
 * the chat, and not logged (business-rules §17: it is what was reported).
 * @returns {Promise<{ messageId, group: { groupId, groupName, groupType }, message: object }>}
 */
export async function getReportedMessage(user, messageId) {
  assertManager(user);
  const report = await openReport(pool, messageId);
  const group = { groupId: report.groupId, groupName: report.groupName, groupType: report.groupType };
  const { rows } = await selectMessages(messageId, report.groupId, 'm.message_id = $1', 'm.message_id', 1);
  if (!rows.length) throw reportNotFound();
  return { messageId, group, message: rows[0] };
}

/**
 * POST /moderation/message-reports/:messageId/context { reason } (School Manager, 27/11/2026) – "Xem hội thoại xung
 * quanh": the only way a School Manager reads OTHER messages of a chat (docs/moderation-plan.md "Quyền xem nội dung và
 * nhật ký"). Only for a message with an OPEN report, only that message's chat: moderation.context_window messages
 * (default 6, kept within 0-20) before it, the message, and as many after it – from every member; fewer when the chat
 * has fewer. The reason is required (400 MSG_VIEW_REASON_REQUIRED; at most 500 characters). Every read is written to
 * activity_logs HERE, before the messages are returned (a failed log fails the read): CHAT_CONTEXT_VIEW
 * { reportMessageId, groupId, reason }. There is no "whole conversation" view (removed 27/11/2026).
 * @returns {Promise<{ messageId, group, window: number, messages: object[] }>}
 */
export async function readReportContext(user, messageId, { reason } = {}) {
  assertManager(user);
  const viewReason = parseViewReason(reason);
  const report = await openReport(pool, messageId);
  const group = { groupId: report.groupId, groupName: report.groupName, groupType: report.groupType };
  const setting = await getNumberSetting('moderation.context_window', DEFAULT_CONTEXT_WINDOW);
  const size = Math.min(MAX_CONTEXT_WINDOW, Math.max(0, Math.floor(setting)));
  await logActivity({
    userId: user.userId,
    action: 'CHAT_CONTEXT_VIEW',
    targetType: 'MESSAGE',
    targetId: messageId,
    detail: { reportMessageId: messageId, groupId: report.groupId, reason: viewReason },
  });
  const { rows: older } = await selectMessages(messageId, report.groupId, 'm.message_id <= $1', 'm.message_id DESC', size + 1);
  const { rows: newer } = await selectMessages(messageId, report.groupId, 'm.message_id > $1', 'm.message_id', size);
  return { messageId, group, window: size, messages: [...older.reverse(), ...newer] };
}

// --- The decision ---------------------------------------------------------------------------------------------------

/**
 * PATCH /moderation/message-reports/:messageId { action: 'HIDE' | 'KEEP', supportNote? } – one decision closes every
 * pending report of the message, in one transaction (the message and its pending reports are locked).
 *   - no pending report: 409 MSG_REPORT_ALREADY_HANDLED (reports exist) / 404 MSG_REPORT_NOT_FOUND;
 *   - a pending NEEDS_SUPPORT report: supportNote required (400 MSG_SUPPORT_NOTE_REQUIRED), written on those reports;
 *   - every pending report NEEDS_SUPPORT: only KEEP; HIDE → 400 MSG_REPORT_SUPPORT_ONLY;
 *   - HIDE: deleted_for_everyone_at = NOW() with deleted_for_everyone_by NULL (as the automatic check: isModerated),
 *     reports → RESOLVED, a moderation_violations row (source REPORT, category from the reasons other than
 *     NEEDS_SUPPORT). After COMMIT: the sender is told (no content, nothing about NEEDS_SUPPORT) and the members get
 *     'message:deleted' – the event FE-06 sends when a message is deleted for everyone – with isModerated: true.
 *     A message already deleted for everyone meanwhile is not changed: no violation, no notification, no event.
 *   - KEEP: reports → DISMISSED; nothing else changes, nobody is told.
 * Logged: MESSAGE_REPORT_RESOLVE { messageId, action, hasSupportNote }.
 */
export async function resolveMessageReport(user, messageId, { action, supportNote }) {
  assertManager(user);
  if (!MESSAGE_REPORT_ACTIONS.includes(action)) throw invalid('action');
  const result = await withTransaction(async (client) => {
    const { rows: found } = await client.query(
      `SELECT message_id AS "messageId", group_id AS "groupId", sender_id AS "senderId",
              deleted_for_everyone_at IS NOT NULL AS "isDeleted"
       FROM messages WHERE message_id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [messageId],
    );
    const message = found[0];
    if (!message) throw reportNotFound();
    const { rows: pendingRows } = await client.query(
      `SELECT report_id, reason FROM message_reports
       WHERE message_id = $1 AND status = 'PENDING' AND deleted_at IS NULL FOR UPDATE`,
      [messageId],
    );
    if (!pendingRows.length) {
      const { rows: any } = await client.query(
        'SELECT 1 FROM message_reports WHERE message_id = $1 AND deleted_at IS NULL LIMIT 1',
        [messageId],
      );
      if (any.length) throw conflict('MSG_REPORT_ALREADY_HANDLED', 'The reports of this message have already been handled.');
      throw reportNotFound();
    }
    const counts = new Map();
    for (const r of pendingRows) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
    const hasSupport = counts.has('NEEDS_SUPPORT');
    const category = reportCategory([...counts].map(([reason, count]) => ({ reason, count })));
    const note = parseSupportNote(supportNote, hasSupport);
    if (action === 'HIDE' && !category) {
      throw badRequest('MSG_REPORT_SUPPORT_ONLY', 'Reports that only ask for support are recorded, not hidden.', {
        field: 'action',
      });
    }
    if (note) {
      await client.query(
        `UPDATE message_reports SET support_note = $2
         WHERE message_id = $1 AND status = 'PENDING' AND deleted_at IS NULL AND reason = 'NEEDS_SUPPORT'`,
        [messageId, note],
      );
    }
    let hidden = false;
    if (action === 'HIDE') {
      const { rowCount } = await client.query(
        'UPDATE messages SET deleted_for_everyone_at = NOW() WHERE message_id = $1 AND deleted_for_everyone_at IS NULL',
        [messageId],
      );
      hidden = rowCount > 0;
      if (hidden) {
        await recordReportViolation(client, { contentType: 'MESSAGE', messageId, authorId: message.senderId, category });
      }
    }
    const status = action === 'HIDE' ? 'RESOLVED' : 'DISMISSED';
    const { rowCount: resolvedCount } = await client.query(
      `UPDATE message_reports SET status = $3, resolved_by = $2, resolved_at = NOW()
       WHERE message_id = $1 AND status = 'PENDING' AND deleted_at IS NULL`,
      [messageId, user.userId, status],
    );
    return { messageId, groupId: message.groupId, senderId: message.senderId, action, status, resolvedCount, hidden, category, hasSupportNote: Boolean(note) };
  });

  await logActivity({
    userId: user.userId,
    action: 'MESSAGE_REPORT_RESOLVE',
    targetType: 'MESSAGE',
    targetId: messageId,
    detail: { messageId, action, hasSupportNote: result.hasSupportNote },
  });
  if (result.hidden) {
    notifyContentHidden({
      contentType: 'MESSAGE',
      authorId: result.senderId,
      postTarget: { column: 'group_id', id: result.groupId },
      category: result.category,
      source: 'REPORT',
    }).catch((err) => console.error(`[moderation] hidden-message notification #${messageId} not sent:`, err?.message));
    (async () => {
      // Same event and payload as FE-06's delete for everyone (messageActions.service.js), plus isModerated: open chats
      // turn the message into the "đã bị ẩn" placeholder. No content in the event.
      emitToUsers(await activeMemberIds(pool, result.groupId), 'message:deleted', {
        groupId: result.groupId,
        messageId,
        isModerated: true,
      });
    })().catch((err) => console.error(`[moderation] message:deleted #${messageId} not sent:`, err?.message));
  }
  const { messageId: id, status, resolvedCount, hidden, action: decided } = result;
  return { messageId: id, action: decided, status, resolvedCount, hidden };
}

/**
 * GET /moderation/message-reports/summary – the menu badge (phase 6): messages with a pending report (pendingCount)
 * and those of them with a pending "Cần được hỗ trợ" report (supportCount: the badge is highlighted). Counts only.
 */
export async function getMessageReportSummary(user) {
  assertManager(user);
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT message_id) AS "pendingCount",
            COUNT(DISTINCT message_id) FILTER (WHERE reason = 'NEEDS_SUPPORT') AS "supportCount"
     FROM message_reports WHERE status = 'PENDING' AND deleted_at IS NULL`,
  );
  return rows[0];
}
