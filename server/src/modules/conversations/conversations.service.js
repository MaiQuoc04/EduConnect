import { pool, withTransaction } from '../../config/db.js';
import { emitToUsers } from '../../sockets/index.js';
import { AppError, badRequest, forbidden } from '../../utils/AppError.js';
import { findGroupForUser } from '../groups/groupAccess.js';
import { byRankThenName, memberRows } from '../groups/groups.service.js';

// FE-06 Messaging (owner: Khanh). UC-47 Chat in Group – SCR-43 Group Chat / SCR-50 Chat Room.
// Group chats: GENERAL / STUDENT / PARENT (class groups), TEAM_CHAT (UC-35 teams) and TEACHER_SCHOOL. Who may open
// which group is FE-04's groupAccess.js (active role + data scope); 1-1 chats (DIRECT) arrive with UC-49.
// Rules (business-rules §2, §4, §6):
//   * the School Manager never sees class chats – only the teacher group (canSeeContent);
//   * a chat member sees only messages sent since their latest joined_at (agreed 04/11/2026), first-time members
//     and people coming back alike; nothing from an earlier membership period;
//   * groups of an ended school year are read only: messages can be read, not sent;
//   * read receipts: group_members.last_read_at; "seen by" = members whose last_read_at ≥ sent_at and who had
//     joined by then. Times are compared in SQL, so the client gets message ids instead of timestamps.

const conflict = (code, message, details) => new AppError(409, code, message, details);
const PAGE_DEFAULT = 30;
const PAGE_MAX = 100;
// ASSUMPTION: no agreed limit for one message (plan question Q5); 2000 characters until the lead decides.
export const MESSAGE_MAX_LENGTH = 2000;

// SQL: the latest joined_at of the user's active membership in the message's group (alias m). Messages before it are
// not shown (business-rules §6).
const visibleFrom = (userParam) => `(SELECT MAX(vm.joined_at) FROM group_members vm
   WHERE vm.group_id = m.group_id AND vm.user_id = ${userParam} AND vm.left_at IS NULL)`;

// One message with its sender. The nickname (UC-34) is shown only inside the class (business-rules §4): it comes
// from the sender's enrollment in the group's class, so it never appears in the teacher group.
const MESSAGE_SELECT = `
  SELECT m.message_id AS "messageId", m.group_id AS "groupId", m.sender_id AS "senderId", m.content,
         m.sent_at AS "sentAt", u.full_name AS "senderName", u.avatar_url AS "senderAvatarUrl",
         u.status AS "senderStatus", e.nickname AS "senderNickname"
  FROM messages m
  JOIN groups g ON g.group_id = m.group_id
  JOIN users u ON u.user_id = m.sender_id
  LEFT JOIN students st ON st.user_id = m.sender_id
  LEFT JOIN class_enrollments e ON e.student_id = st.student_id AND e.class_id = g.class_id`;

// The group if the user may chat in it (else 404 / 403), plus canSend.
async function openChat(db, user, groupId) {
  const group = await findGroupForUser(db, user, groupId);
  if (!group.canSeeContent) {
    throw forbidden('MSG_CHAT_NO_ACCESS', 'The School Manager does not see class chats.');
  }
  // groupScopeSql lets the School Manager open every non-team group; the chat itself needs a membership row.
  const { rows } = await db.query(
    `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL LIMIT 1`,
    [group.groupId, user.userId],
  );
  if (!rows.length) throw forbidden('MSG_CHAT_NOT_MEMBER', 'You are not a member of this chat.');
  return { ...group, canSend: !group.readOnly };
}

// Read state of every active member, as message ids:
//   lastReadMessageId    – newest message (visible to them) sent at or before their last_read_at
//   joinedAfterMessageId – newest message sent before they joined (0 if none)
// The member has seen message X when joinedAfterMessageId < X.messageId <= lastReadMessageId.
async function readStates(db, groupId, userId = null) {
  const { rows } = await db.query(
    `SELECT gm.user_id AS "userId",
            COALESCE((SELECT MAX(x.message_id) FROM messages x
                      WHERE x.group_id = gm.group_id AND x.deleted_at IS NULL
                        AND x.sent_at >= gm.joined_at AND x.sent_at <= gm.last_read_at), 0) AS "lastReadMessageId",
            COALESCE((SELECT MAX(x.message_id) FROM messages x
                      WHERE x.group_id = gm.group_id AND x.sent_at < gm.joined_at), 0) AS "joinedAfterMessageId"
     FROM group_members gm
     WHERE gm.group_id = $1 AND gm.left_at IS NULL AND ($2::bigint IS NULL OR gm.user_id = $2)`,
    [groupId, userId],
  );
  return rows;
}

const activeMemberIds = async (db, groupId) =>
  (
    await db.query(`SELECT DISTINCT user_id AS "userId" FROM group_members WHERE group_id = $1 AND left_at IS NULL`, [
      groupId,
    ])
  ).rows.map((r) => r.userId);

function parsePage({ before, limit }) {
  const beforeId = before === undefined || before === '' ? null : Number(before);
  if (beforeId !== null && (!Number.isSafeInteger(beforeId) || beforeId <= 0)) {
    throw badRequest('MSG_INVALID_INPUT', 'before must be a message id.');
  }
  const size = limit === undefined || limit === '' ? PAGE_DEFAULT : Number(limit);
  if (!Number.isSafeInteger(size) || size < 1 || size > PAGE_MAX) {
    throw badRequest('MSG_INVALID_INPUT', `limit must be between 1 and ${PAGE_MAX}.`);
  }
  return { beforeId, size };
}

// UC-47: one page of messages, oldest first. Without `before` (first page) the response also carries the chat's
// header data and its active members with their read state, so the client can show labels and "seen by".
export async function listMessages(user, groupId, query) {
  const { beforeId, size } = parsePage(query);
  const group = await openChat(pool, user, groupId);
  const { rows } = await pool.query(
    `${MESSAGE_SELECT}
     WHERE m.group_id = $1 AND m.deleted_at IS NULL AND m.sent_at >= ${visibleFrom('$2')}
       AND ($3::bigint IS NULL OR m.message_id < $3)
     ORDER BY m.message_id DESC
     LIMIT $4`,
    [group.groupId, user.userId, beforeId, size + 1],
  );
  const hasMore = rows.length > size;
  const messages = rows.slice(0, size).reverse();
  const page = { groupId: group.groupId, messages, hasMore };
  if (beforeId !== null) return page;

  const [members, reads] = await Promise.all([memberRows(pool, group.groupId), readStates(pool, group.groupId)]);
  const readById = new Map(reads.map((r) => [r.userId, r]));
  return {
    ...page,
    readOnly: group.readOnly,
    canSend: group.canSend,
    // No email / phone here: the member list (UC-31) shows contacts to teachers and the School Manager.
    members: members.sort(byRankThenName).map((m) => ({
      userId: m.userId,
      fullName: m.fullName,
      avatarUrl: m.avatarUrl,
      status: m.status,
      nickname: m.isStudent ? m.nickname : null,
      kinds: m.kinds,
      children: m.children,
      lastReadMessageId: readById.get(m.userId)?.lastReadMessageId ?? 0,
      joinedAfterMessageId: readById.get(m.userId)?.joinedAfterMessageId ?? 0,
    })),
  };
}

function cleanContent(content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw badRequest('MSG_MESSAGE_EMPTY', 'The message is empty.');
  }
  // Keep the line breaks the user typed; only drop blank space around the whole message.
  const text = content.replace(/\r\n?/g, '\n').trim();
  if (text.length > MESSAGE_MAX_LENGTH) {
    throw badRequest('MSG_MESSAGE_TOO_LONG', `A message has at most ${MESSAGE_MAX_LENGTH} characters.`, {
      max: MESSAGE_MAX_LENGTH,
    });
  }
  return text;
}

// UC-47: send a text message. The sender's own message counts as read for them. Every active member gets it in
// real time ("message:new", all their tabs), the sender's other tabs included.
// Attachments (images / files ≤ 10 MB, video ≤ 50 MB) come later with the upload shared with FE-05.
export async function sendMessage(user, groupId, body) {
  const content = cleanContent(body?.content);
  const group = await openChat(pool, user, groupId);
  if (!group.canSend) throw conflict('MSG_GROUP_READ_ONLY', 'The school year has ended; the group is read only.');

  const message = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO messages (group_id, sender_id, content) VALUES ($1, $2, $3) RETURNING message_id`,
      [group.groupId, user.userId, content],
    );
    await client.query(
      `UPDATE group_members SET last_read_at = NOW() WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [group.groupId, user.userId],
    );
    const { rows: full } = await client.query(`${MESSAGE_SELECT} WHERE m.message_id = $1`, [rows[0].message_id]);
    return full[0];
  });

  const memberIds = await activeMemberIds(pool, group.groupId);
  emitToUsers(memberIds, 'message:new', { groupId: group.groupId, message });
  emitToUsers(memberIds, 'message:read', {
    groupId: group.groupId,
    userId: user.userId,
    lastReadMessageId: message.messageId,
  });
  return message;
}

// UC-47: the user has read the chat up to now (opening it, or a new message arriving while it is open).
// Allowed in read-only groups too: reading is not writing content.
export async function markRead(user, groupId) {
  const group = await openChat(pool, user, groupId);
  await pool.query(
    `UPDATE group_members SET last_read_at = NOW() WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [group.groupId, user.userId],
  );
  const [state] = await readStates(pool, group.groupId, user.userId);
  const lastReadMessageId = state?.lastReadMessageId ?? 0;
  emitToUsers(await activeMemberIds(pool, group.groupId), 'message:read', {
    groupId: group.groupId,
    userId: user.userId,
    lastReadMessageId,
  });
  return { groupId: group.groupId, lastReadMessageId };
}
