import { pool, withTransaction } from '../config/db.js';
import { emitToUsers } from '../sockets/index.js';
import { FEED_COLUMNS } from './feedInteractions.js';

// Notification to the author of content hidden by the automatic check (moderation phase 3, docs/moderation-plan.md
// "Luồng tự động" > "Người viết thấy gì"). Same shape as utils/commentReports.js notifyCommentRemoved: one
// notifications row + one notification_recipients row per role of the author (every role but SYSTEM_ADMIN).
//
// The text NEVER quotes the hidden content: notifications.detail is stored in the database, and no table may keep a
// copy of content that broke the rules (docs/moderation-plan.md "Thiết kế dữ liệu"). It names the place and the
// category only.
//
// Built for every content type of moderation_violations.content_type: comments (phase 3) and chat messages (phase 4,
// entry MESSAGE). Each entry gives its own bell row (type / target) and place.
//
// Phase 5: the same notice after a School Manager hid a reported message (source REPORT), and notifySupportRequest –
// the School Managers are told at once about a "Cần được hỗ trợ" report, without the content and without the reporter.

/**
 * Vietnamese name of each category, as the author reads it (same words as the client's moderation labels). The first
 * five come from the rules (automatic check); SPAM / FALSE_INFORMATION / OTHER only from a report decision
 * (moderation_violations_category_check).
 */
export const CATEGORY_LABELS = Object.freeze({
  VIOLENCE: 'bạo lực, đe doạ',
  SEXUAL: 'nội dung tình dục',
  DISCRIMINATION: 'kỳ thị',
  HARASSMENT: 'xúc phạm, quấy rối',
  INAPPROPRIATE_LANGUAGE: 'ngôn từ thô tục',
  SPAM: 'spam, quảng cáo',
  FALSE_INFORMATION: 'thông tin sai sự thật',
  OTHER: 'vi phạm khác',
});

const PLACE_LENGTH = 120;
const shorten = (text, max) => {
  const chars = [...String(text ?? '').replace(/\s+/g, ' ').trim()];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
};

// Per content type: what the bell row is (type / target_type, as notifyCommentRemoved) and where the content was.
const KINDS = Object.freeze({
  SCHOOL_COMMENT: {
    column: FEED_COLUMNS.SCHOOL_POST,
    noun: 'Bình luận',
    advice: 'Vui lòng giữ lời lẽ phù hợp khi bình luận.',
    type: 'SCHOOL_POST',
    targetType: 'SCHOOL_POST',
    async place(client, postId) {
      const { rows } = await client.query('SELECT title FROM school_posts WHERE school_post_id = $1', [postId]);
      return `trong bài “${shorten(rows[0]?.title, PLACE_LENGTH)}” trên bảng tin trường`;
    },
  },
  GROUP_COMMENT: {
    column: FEED_COLUMNS.GROUP_POST,
    noun: 'Bình luận',
    advice: 'Vui lòng giữ lời lẽ phù hợp khi bình luận.',
    type: 'GROUP_POST',
    targetType: 'POST',
    async place(client, postId) {
      const { rows } = await client.query(
        `SELECT gr.group_name AS "groupName"
         FROM posts p JOIN groups gr ON gr.group_id = p.group_id
         WHERE p.post_id = $1`,
        [postId],
      );
      const groupName = rows[0]?.groupName;
      return `trong một bài viết của nhóm ${groupName ? `“${shorten(groupName, PLACE_LENGTH)}”` : 'lớp'}`;
    },
  },
  // Phase 4 (25/11/2026): a chat message. postTarget = { column: 'group_id', id: <the chat's group id> }.
  // ASSUMPTION: type 'CHAT' (listed in notifications.type, no chat notification exists yet in the repo) and
  // target_type 'CHAT' with the group id. notifications.service.js (FE-09) has no link for 'CHAT' yet, so the bell row
  // opens nothing until FE-09 adds '/chat/<groupId>'; the text says everything the author needs.
  MESSAGE: {
    column: 'group_id',
    noun: 'Tin nhắn',
    advice: 'Vui lòng giữ lời lẽ phù hợp khi nhắn tin.',
    type: 'CHAT',
    targetType: 'CHAT',
    async place(client, groupId, authorId) {
      const { rows } = await client.query(
        `SELECT g.group_type AS "groupType", g.group_name AS "groupName",
                (SELECT pu.full_name FROM group_members pm JOIN users pu ON pu.user_id = pm.user_id
                 WHERE pm.group_id = g.group_id AND pm.user_id <> $2
                 ORDER BY pm.member_id LIMIT 1) AS "peerName"
         FROM groups g WHERE g.group_id = $1`,
        [groupId, authorId],
      );
      const { groupType, groupName, peerName } = rows[0] ?? {};
      // A 1-1 chat has no name of its own: it is "the chat with <the other person>" (as the conversation list shows).
      if (groupType === 'DIRECT') {
        return peerName ? `trong cuộc trò chuyện với ${shorten(peerName, PLACE_LENGTH)}` : 'trong một cuộc trò chuyện riêng';
      }
      return groupName ? `trong nhóm “${shorten(groupName, PLACE_LENGTH)}”` : 'trong một nhóm trò chuyện';
    },
  },
});

const inTransaction = (db, fn) => (db === pool ? withTransaction(fn) : fn(db));

/**
 * Tells the author that their content was hidden by the automatic check. Call it AFTER the COMMIT that saved the
 * content, fire and forget with .catch (a failed notification never undoes the save).
 *   is_personal TRUE, created_by NULL (the system decided, not a person).
 * @param {{ contentType: 'SCHOOL_COMMENT' | 'GROUP_COMMENT' | 'MESSAGE', authorId: number,
 *   postTarget: { column: string, id: number }, category: string, source?: 'AUTO' | 'REPORT' }} input
 *   postTarget: the post of a comment ({ column: 'school_post_id' | 'post_id', id }), or the chat of a message
 *   ({ column: 'group_id', id })
 *   source (phase 5): 'REPORT' when a School Manager hid it after reports – the text then says so instead of "the
 *   system hid it". It never mentions a "Cần được hỗ trợ" report or who reported.
 * @returns {Promise<number>} the notification id
 */
export async function notifyContentHidden({ contentType, authorId, postTarget, category, source = 'AUTO' }, db = pool) {
  const kind = KINDS[contentType];
  if (!kind) throw new Error(`moderationNotify: unknown content type ${contentType}`); // programming error
  if (postTarget?.column !== kind.column) throw new Error(`moderationNotify: ${contentType} needs a ${kind.column} target`);
  const label = CATEGORY_LABELS[category];
  if (!label) throw new Error(`moderationNotify: unknown category ${category}`);
  return inTransaction(db, async (client) => {
    const where = await kind.place(client, postTarget.id, authorId);
    const title = `${kind.noun} của bạn đã bị ẩn`;
    const how = source === 'REPORT' ? 'đã bị ẩn sau khi được báo cáo và xem xét' : 'đã được hệ thống tự động ẩn';
    const detail = `${kind.noun} của bạn ${where} ${how} vì vi phạm quy chuẩn cộng đồng: ${label}. ${kind.advice}`;
    const { rows } = await client.query(
      `INSERT INTO notifications (type, title, detail, is_personal, target_type, target_id, created_by, created_at)
       VALUES ($1, $2, $3, TRUE, $4, $5, NULL, NOW())
       RETURNING notification_id AS "notificationId"`,
      [kind.type, title, detail, kind.targetType, postTarget.id],
    );
    const { notificationId } = rows[0];
    // As notifyCommentRemoved (FE-09, 18/11/2026): content does not store the role it was written under, so the
    // author gets the notice under each of their roles that can read feeds (every role but SYSTEM_ADMIN).
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

/**
 * Tells the author that their content hidden by the automatic check is shown again after the School Manager's review
 * (phase 6, POST /moderation/violations/:id/unhide). Same shape as notifyContentHidden (one notifications row, one
 * recipient row per role but SYSTEM_ADMIN, created_by NULL), and never the content. Call it AFTER the COMMIT, fire and
 * forget.
 * @param {{ contentType: 'SCHOOL_COMMENT' | 'GROUP_COMMENT' | 'MESSAGE', authorId: number,
 *   postTarget: { column: string, id: number } }} input as notifyContentHidden
 * @returns {Promise<number>} the notification id
 */
export async function notifyContentRestored({ contentType, authorId, postTarget }, db = pool) {
  const kind = KINDS[contentType];
  if (!kind) throw new Error(`moderationNotify: unknown content type ${contentType}`); // programming error
  if (postTarget?.column !== kind.column) throw new Error(`moderationNotify: ${contentType} needs a ${kind.column} target`);
  return inTransaction(db, async (client) => {
    const where = await kind.place(client, postTarget.id, authorId);
    const title = `${kind.noun} của bạn đã được hiển thị lại`;
    const detail = `${kind.noun} của bạn ${where} đã được hiển thị lại sau khi xem xét.`;
    const { rows } = await client.query(
      `INSERT INTO notifications (type, title, detail, is_personal, target_type, target_id, created_by, created_at)
       VALUES ($1, $2, $3, TRUE, $4, $5, NULL, NOW())
       RETURNING notification_id AS "notificationId"`,
      [kind.type, title, detail, kind.targetType, postTarget.id],
    );
    const { notificationId } = rows[0];
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

// --- "Cần được hỗ trợ" reports (phase 5) ---------------------------------------------------------------------------

// Where the reported content is, as the School Manager reads it. Never the content and never anything that names the
// reporter: a 1-1 chat is only "một cuộc trò chuyện riêng" (its other member IS the reporter).
const SUPPORT_PLACES = Object.freeze({
  MESSAGE: {
    noun: 'một tin nhắn',
    queue: 'hàng đợi báo cáo tin nhắn',
    async place(client, messageId) {
      const { rows } = await client.query(
        `SELECT g.group_type AS "groupType", g.group_name AS "groupName"
         FROM messages m JOIN groups g ON g.group_id = m.group_id WHERE m.message_id = $1`,
        [messageId],
      );
      const { groupType, groupName } = rows[0] ?? {};
      if (groupType === 'DIRECT' || !groupName) return 'trong một cuộc trò chuyện riêng';
      return `trong nhóm “${shorten(groupName, PLACE_LENGTH)}”`;
    },
  },
  SCHOOL_COMMENT: {
    noun: 'một bình luận',
    queue: 'hàng đợi báo cáo bình luận',
    async place(client, commentId) {
      const { rows } = await client.query(
        `SELECT sp.title FROM comments c JOIN school_posts sp ON sp.school_post_id = c.school_post_id
         WHERE c.comment_id = $1`,
        [commentId],
      );
      return `trong bài “${shorten(rows[0]?.title, PLACE_LENGTH)}” trên bảng tin trường`;
    },
  },
});

/**
 * Tells every School Manager at once that a "Cần được hỗ trợ" (NEEDS_SUPPORT) report arrived (docs/moderation-plan.md
 * "Luồng báo cáo": luôn lên đầu, thông báo ngay, kèm realtime). Call it AFTER the COMMIT of the report, fire and forget.
 *   - ONE notifications row and ONE notification_recipients row per School Manager (role_code SCHOOL_MANAGER);
 *   - no content and no reporter: created_by is NULL on purpose (FE-09 shows the creator of a notification), the text
 *     names only the place;
 *   - then 'moderation:report' with the id only to user:<id> of each School Manager.
 * ASSUMPTION: type 'SYSTEM' and target_type 'MESSAGE_REPORT' / 'COMMENT_REPORT' with the message / comment id: the repo
 * has no notification type for reports, and notifications.service.js (FE-09) has no link for them yet, so the bell row
 * opens nothing until FE-09 adds the queue pages; the text says where to go.
 * @param {{ kind: 'MESSAGE' | 'SCHOOL_COMMENT', id: number }} input id = the message id or the comment id
 * @returns {Promise<{ notificationId: number, managerIds: number[] }>}
 */
export async function notifySupportRequest({ kind, id }, db = pool) {
  const spec = SUPPORT_PLACES[kind];
  if (!spec) throw new Error(`moderationNotify: unknown support request kind ${kind}`); // programming error
  const result = await inTransaction(db, async (client) => {
    const where = await spec.place(client, id);
    const detail =
      `Có báo cáo “Cần được hỗ trợ” về ${spec.noun} ${where}. ` +
      `Vui lòng mở ${spec.queue} để xem và ghi nhận kết quả hỗ trợ.`;
    const { rows } = await client.query(
      `INSERT INTO notifications (type, title, detail, is_personal, target_type, target_id, created_by, created_at)
       VALUES ('SYSTEM', 'Có báo cáo cần được hỗ trợ', $1, TRUE, $2, $3, NULL, NOW())
       RETURNING notification_id AS "notificationId"`,
      [detail, kind === 'MESSAGE' ? 'MESSAGE_REPORT' : 'COMMENT_REPORT', id],
    );
    const { notificationId } = rows[0];
    const { rows: managers } = await client.query(
      `INSERT INTO notification_recipients (notification_id, user_id, role_code, student_id, read_at)
       SELECT $1, ur.user_id, 'SCHOOL_MANAGER', NULL, NULL
       FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
       WHERE r.role_code = 'SCHOOL_MANAGER'
       RETURNING user_id AS "userId"`,
      [notificationId],
    );
    return { notificationId, managerIds: managers.map((m) => m.userId) };
  });
  emitToUsers(result.managerIds, 'moderation:report', kind === 'MESSAGE' ? { messageId: id } : { commentId: id });
  return result;
}
