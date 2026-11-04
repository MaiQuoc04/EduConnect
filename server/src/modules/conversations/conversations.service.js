import { pool, withTransaction } from '../../config/db.js';
import { emitToUsers } from '../../sockets/index.js';
import { AppError, badRequest, forbidden } from '../../utils/AppError.js';
import { findGroupForUser, groupScopeSql } from '../groups/groupAccess.js';
import { byRankThenName, memberRows } from '../groups/groups.service.js';
import { directPeer } from './direct.service.js';

// FE-06 Messaging (owner: Khanh). UC-47 Chat in Group – SCR-43 Group Chat / SCR-50 Chat Room.
// Group chats: GENERAL / STUDENT / PARENT (class groups), TEAM_CHAT (UC-35 teams) and TEACHER_SCHOOL. Who may open
// which group is FE-04's groupAccess.js (active role + data scope); 1-1 chats (DIRECT) arrive with UC-49.
// Rules (business-rules §2, §4, §6):
//   * the School Manager never sees class chats – only the teacher group (canSeeContent);
//   * a chat member sees the messages sent since they first joined the group (their earliest joined_at); someone
//     who comes back sees the whole history again, the time they were away included (business-rules §4, §6);
//   * groups of an ended school year are read only: messages can be read, not sent;
//   * read receipts: group_members.last_read_at; "seen by" = members whose last_read_at ≥ sent_at and who had
//     joined by then. Times are compared in SQL, so the client gets message ids instead of timestamps.

const conflict = (code, message, details) => new AppError(409, code, message, details);
const PAGE_DEFAULT = 30;
const PAGE_MAX = 100;
// ASSUMPTION: no agreed limit for one message (plan question Q5); 2000 characters until the lead decides.
export const MESSAGE_MAX_LENGTH = 2000;

// SQL: when the user first joined the message's group (alias m). All their membership rows count, left ones too:
// UC-32 adds someone back with a new row, FE-02 / FE-04 reopen the old one (business-rules §6). Whether they are
// a member now is checked by openChat.
const visibleFrom = (userParam) => `(SELECT MIN(vm.joined_at) FROM group_members vm
   WHERE vm.group_id = m.group_id AND vm.user_id = ${userParam})`;

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

// The group if the user may chat in it (else 404 / 403), plus canSend and, when sending is not possible, why:
// blockedReason READ_ONLY (ended school year), OUT_OF_SCOPE / LOCKED (1-1 chat, UC-49).
async function openChat(db, user, groupId) {
  const id = Number(groupId);
  if (Number.isSafeInteger(id) && id > 0) {
    // UC-49 1-1 chats: open to their two members under any role (the router already stops the System Admin).
    const { rows: direct } = await db.query(
      `SELECT g.group_id AS "groupId", g.group_type AS "groupType"
       FROM groups g JOIN group_members gm ON gm.group_id = g.group_id
       WHERE g.group_id = $1 AND g.group_type = 'DIRECT' AND g.deleted_at IS NULL
         AND gm.user_id = $2 AND gm.left_at IS NULL`,
      [id, user.userId],
    );
    if (direct.length) {
      const peer = await directPeer(db, user, id);
      const blockedReason = peer?.canSend ? null : peer?.locked ? 'LOCKED' : 'OUT_OF_SCOPE';
      return { ...direct[0], classId: null, readOnly: false, canSend: !blockedReason, blockedReason, peer };
    }
  }
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
  return { ...group, canSend: !group.readOnly, blockedReason: group.readOnly ? 'READ_ONLY' : null, peer: null };
}

// Read state of every active member, as message ids:
//   lastReadMessageId    – newest message (visible to them) sent at or before their last_read_at
//   joinedAfterMessageId – newest message sent before they first joined (0 if none)
// The member has seen message X when joinedAfterMessageId < X.messageId <= lastReadMessageId.
async function readStates(db, groupId, userId = null) {
  const { rows } = await db.query(
    `SELECT gm.user_id AS "userId",
            COALESCE((SELECT MAX(x.message_id) FROM messages x
                      WHERE x.group_id = $1 AND x.deleted_at IS NULL
                        AND x.sent_at >= gm.joined_at AND x.sent_at <= gm.last_read_at), 0) AS "lastReadMessageId",
            COALESCE((SELECT MAX(x.message_id) FROM messages x
                      WHERE x.group_id = $1 AND x.sent_at < gm.joined_at), 0) AS "joinedAfterMessageId"
     FROM (SELECT vm.user_id, MIN(vm.joined_at) AS joined_at, MAX(vm.last_read_at) AS last_read_at
           FROM group_members vm
           WHERE vm.group_id = $1 AND ($2::bigint IS NULL OR vm.user_id = $2)
           GROUP BY vm.user_id
           HAVING bool_or(vm.left_at IS NULL)) gm`,
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
    groupType: group.groupType,
    readOnly: group.readOnly,
    canSend: group.canSend,
    blockedReason: group.blockedReason,
    peer: group.peer, // UC-49: the other person of a 1-1 chat (contacts only for teachers / School Manager)
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

// UC-48 View Conversation List (SCR-49): for every chat the user can open with the active role, the latest message
// they may see and how many messages from others arrived since they last read it. Same visibility rule as UC-47:
// messages since they first joined. The School Manager gets the teacher group only (no class chats).
// UC-49: 1-1 chats too, with the other person (`peer`); an empty 1-1 chat only for the person who opened it.
// The client lays the chats out from GET /groups and fills in these summaries by groupId.
export async function listConversations(user) {
  const { rows } = await pool.query(
    `SELECT g.group_id AS "groupId", g.group_type AS "groupType",
            lm.message_id AS "messageId", lm.content, lm.sent_at AS "sentAt", lm.sender_id AS "senderId",
            u.full_name AS "senderName", e.nickname AS "senderNickname",
            peer.user_id AS "peerId", peer.full_name AS "peerName", peer.avatar_url AS "peerAvatarUrl",
            peer.status AS "peerStatus",
            (SELECT COUNT(*) FROM messages x
             WHERE x.group_id = g.group_id AND x.deleted_at IS NULL AND x.sender_id <> $1
               AND x.sent_at >= gm.joined_at
               AND (gm.last_read_at IS NULL OR x.sent_at > gm.last_read_at)) AS "unreadCount"
     FROM groups g
     JOIN LATERAL (SELECT MIN(vm.joined_at) AS joined_at, MAX(vm.last_read_at) AS last_read_at
                   FROM group_members vm
                   WHERE vm.group_id = g.group_id AND vm.user_id = $1
                   HAVING bool_or(vm.left_at IS NULL)) gm ON TRUE
     LEFT JOIN LATERAL (SELECT m.message_id, m.content, m.sent_at, m.sender_id FROM messages m
                        WHERE m.group_id = g.group_id AND m.deleted_at IS NULL AND m.sent_at >= gm.joined_at
                        ORDER BY m.message_id DESC LIMIT 1) lm ON TRUE
     LEFT JOIN users u ON u.user_id = lm.sender_id
     LEFT JOIN students st ON st.user_id = lm.sender_id
     LEFT JOIN class_enrollments e ON e.student_id = st.student_id AND e.class_id = g.class_id
     LEFT JOIN LATERAL (SELECT pu.user_id, pu.full_name, pu.avatar_url, pu.status
                        FROM group_members pm JOIN users pu ON pu.user_id = pm.user_id
                        WHERE g.group_type = 'DIRECT' AND pm.group_id = g.group_id AND pm.user_id <> $1
                        ORDER BY pm.member_id LIMIT 1) peer ON TRUE
     WHERE (
             (${groupScopeSql('$1', '$2')} AND NOT ($2 = 'SCHOOL_MANAGER' AND g.class_id IS NOT NULL))
             -- UC-49 1-1 chats under every role (membership checked by the gm join); an empty one only for the
             -- person who opened it, so nobody gets an empty chat they never asked for
             OR (g.group_type = 'DIRECT' AND g.deleted_at IS NULL
                 AND (lm.message_id IS NOT NULL OR g.created_by = $1))
           )`,
    [user.userId, user.activeRole],
  );
  return rows.map((r) => ({
    groupId: r.groupId,
    groupType: r.groupType,
    unreadCount: r.unreadCount,
    peer: r.peerId
      ? { userId: r.peerId, fullName: r.peerName, avatarUrl: r.peerAvatarUrl, status: r.peerStatus }
      : null,
    lastMessage: r.messageId
      ? {
          messageId: r.messageId,
          content: r.content,
          sentAt: r.sentAt,
          senderId: r.senderId,
          senderName: r.senderName,
          senderNickname: r.senderNickname,
        }
      : null,
  }));
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
  if (group.blockedReason === 'LOCKED') throw conflict('MSG_DIRECT_LOCKED', 'This account is locked.');
  if (group.blockedReason === 'OUT_OF_SCOPE') {
    throw conflict('MSG_DIRECT_OUT_OF_SCOPE', 'You can no longer write to this person.');
  }
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
