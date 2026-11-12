import { pool, withTransaction } from '../../config/db.js';
import { emitToUsers } from '../../sockets/index.js';
import { env } from '../../config/env.js';
import { AppError, badRequest, forbidden, notFound } from '../../utils/AppError.js';
import * as files from '../../utils/attachments.js';
import { uploadedFiles } from '../../utils/requestParsers.js';
import { findGroupForUser, groupScopeSql } from '../groups/groupAccess.js';
import { byRankThenName, memberRows } from '../groups/groups.service.js';
import { getAttachmentLimits } from '../posts/posts.service.js';
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
// UC-110 reply, UC-111 reactions, UC-113 delete message (business-rules §6, agreed 07/11/2026). A message deleted for everyone stays as a placeholder without its content;
// a message deleted for me (message_user_deletions) is left out for that person only.
// Attachments (12/11/2026): files go up through the shared modules/uploads (target 'message' → messages/<groupId>/),
// rows through utils/attachments.js (column message_id). A message may be files only (messages.content NULL, schema).
// A message deleted for everyone hides its files (§6), like its text.

const conflict = (code, message, details) => new AppError(409, code, message, details);
const PAGE_DEFAULT = 30;
const PAGE_MAX = 100;
// ASSUMPTION: no agreed limit for one message (plan question Q5); 2000 characters until the lead decides.
export const MESSAGE_MAX_LENGTH = 2000;
const FROM_LIMIT = 500; // the most messages one jump to a quoted message loads
// ASSUMPTION: at most 10 files per message, as a group post (§5 sets sizes, not a number).
export const MAX_MESSAGE_ATTACHMENTS = 10;
const FILES = files.ATTACHMENT_COLUMNS.MESSAGE;
const fileCountSql = (alias) =>
  `(SELECT COUNT(*) FROM attachments fa WHERE fa.message_id = ${alias}.message_id AND fa.deleted_at IS NULL)`;

/** Limits of the chat composer's file button (system_settings sizes, the 15 types of the bucket). */
export const getMessageAttachmentLimits = () => getAttachmentLimits(MAX_MESSAGE_ATTACHMENTS);

// The files of a page of messages (one query); none for a message deleted for everyone (§6).
async function withFiles(messages, db = pool) {
  const ids = messages.filter((m) => !m.isDeleted).map((m) => m.messageId);
  const byId = await files.listAttachmentsOf(FILES, [...new Set(ids)], db);
  return messages.map((m) => ({ ...m, attachments: m.isDeleted ? [] : (byId.get(m.messageId) ?? []) }));
}

// SQL: when the user first joined the message's group (alias m). All their membership rows count, left ones too:
// UC-32 adds someone back with a new row, FE-02 / FE-04 reopen the old one (business-rules §6). Whether they are
// a member now is checked by openChat.
const visibleFrom = (userParam) => `(SELECT MIN(vm.joined_at) FROM group_members vm
   WHERE vm.group_id = m.group_id AND vm.user_id = ${userParam})`;

// SQL: true when the viewer removed message `alias` from their own view ("delete for me").
const hiddenFor = (viewer, alias = 'm') => `EXISTS (SELECT 1 FROM message_user_deletions d
   WHERE d.message_id = ${alias}.message_id AND d.user_id = ${viewer})`;

// SQL: minutes allowed for "delete for everyone". The setting is edited on the FE-13 screen, which has no range for
// it yet, so anything that is not a whole number falls back to 15 and the value is kept within 1-1440.
export const DELETE_MINUTES_SQL = `COALESCE((SELECT LEAST(GREATEST(s.setting_value::int, 1), 1440) FROM system_settings s
   WHERE s.setting_key = 'chat.delete_for_everyone_minutes' AND s.setting_value ~ '^[0-9]{1,5}$'), 15)`;

// SQL (JSON) for the message `m` is answering, as this viewer may see it. state: OK, DELETED (for everyone), HIDDEN
// (the viewer deleted it for themselves) or BEFORE_JOIN (sent before the viewer first joined, business-rules §6: nothing
// about it is revealed). Read when shown, so a quote follows what happens to the original.
const replyToSql = (viewer) => `(
  SELECT CASE
           WHEN rm.sent_at < ${visibleFrom(viewer)} THEN json_build_object('state', 'BEFORE_JOIN')
           WHEN rm.deleted_for_everyone_at IS NOT NULL THEN json_build_object('state', 'DELETED', 'messageId', rm.message_id)
           WHEN ${hiddenFor(viewer, 'rm')} THEN json_build_object('state', 'HIDDEN', 'messageId', rm.message_id)
           ELSE json_build_object('state', 'OK', 'messageId', rm.message_id, 'senderId', rm.sender_id,
                                  'senderName', ru.full_name, 'senderNickname', re.nickname,
                                  'content', left(rm.content, 200), 'attachmentCount', ${fileCountSql('rm')})
         END
  FROM messages rm
  JOIN users ru ON ru.user_id = rm.sender_id
  LEFT JOIN students rs ON rs.user_id = rm.sender_id
  LEFT JOIN class_enrollments re ON re.student_id = rs.student_id AND re.class_id = g.class_id
  WHERE rm.message_id = m.reply_to_message_id AND rm.deleted_at IS NULL AND m.deleted_for_everyone_at IS NULL)`;

// SQL (JSON array) [{ code, userIds }] of message `alias`; empty once it is deleted for everyone.
export const reactionsSql = (alias = 'm') => `CASE WHEN ${alias}.deleted_for_everyone_at IS NOT NULL THEN '[]'::json
  ELSE COALESCE((SELECT json_agg(json_build_object('code', r.code, 'userIds', r.ids) ORDER BY r.first_at)
                 FROM (SELECT mr.reaction_code AS code, array_agg(mr.user_id ORDER BY mr.created_at) AS ids,
                              MIN(mr.created_at) AS first_at
                       FROM message_reactions mr WHERE mr.message_id = ${alias}.message_id
                       GROUP BY mr.reaction_code) r), '[]'::json) END`;

// One message with its sender, as this viewer sees it. The nickname (UC-34) is shown only inside the class
// (business-rules §4): it comes from the sender's enrollment in the group's class, so it never appears in the teacher
// group. deleteSecondsLeft: how long the viewer may still delete their own message for everyone (0 = no longer).
// viewerFrom / columns: to read one message for several viewers at once (messageForViewers).
const messageSelect = (viewer, viewerFrom = '', columns = '') => `
  SELECT m.message_id AS "messageId", m.group_id AS "groupId", m.sender_id AS "senderId",
         CASE WHEN m.deleted_for_everyone_at IS NULL THEN m.content END AS content,
         m.deleted_for_everyone_at IS NOT NULL AS "isDeleted",
         m.sent_at AS "sentAt", u.full_name AS "senderName", u.avatar_url AS "senderAvatarUrl",
         u.status AS "senderStatus", e.nickname AS "senderNickname",
         ${replyToSql(viewer)} AS "replyTo", ${reactionsSql()} AS reactions,
         (CASE WHEN m.sender_id = ${viewer} AND m.deleted_for_everyone_at IS NULL
               THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (m.sent_at + make_interval(mins => ${DELETE_MINUTES_SQL}) - NOW()))))
               ELSE 0 END)::int AS "deleteSecondsLeft"${columns}
  FROM messages m ${viewerFrom}
  JOIN groups g ON g.group_id = m.group_id
  JOIN users u ON u.user_id = m.sender_id
  LEFT JOIN students st ON st.user_id = m.sender_id
  LEFT JOIN class_enrollments e ON e.student_id = st.student_id AND e.class_id = g.class_id`;

// A message this user can see in this chat (else 404): since they first joined, not deleted for themselves. A message
// deleted for everyone is still found (isDeleted), so the placeholder can be removed from one's own view.
export async function findVisibleMessage(db, user, groupId, messageId) {
  const id = Number(messageId);
  if (Number.isSafeInteger(id) && id > 0) {
    const { rows } = await db.query(
      `SELECT m.message_id AS "messageId", m.sender_id AS "senderId",
              m.deleted_for_everyone_at IS NOT NULL AS "isDeleted"
       FROM messages m
       WHERE m.message_id = $1 AND m.group_id = $2 AND m.deleted_at IS NULL
         AND m.sent_at >= ${visibleFrom('$3')} AND NOT ${hiddenFor('$3')}`,
      [id, groupId, user.userId],
    );
    if (rows.length) return rows[0];
  }
  throw notFound('MSG_MESSAGE_NOT_FOUND', 'Message not found.');
}

// Replying, reacting and deleting for everyone change the chat, so they stop where sending stops.
export function assertCanSend(group) {
  if (group.blockedReason === 'LOCKED') throw conflict('MSG_DIRECT_LOCKED', 'This account is locked.');
  if (group.blockedReason === 'OUT_OF_SCOPE') {
    throw conflict('MSG_DIRECT_OUT_OF_SCOPE', 'You can no longer write to this person.');
  }
  if (!group.canSend) throw conflict('MSG_GROUP_READ_ONLY', 'The school year has ended; the group is read only.');
}

// The same message once per viewer: a quote may be hidden from some of them (replyToSql).
async function messageForViewers(db, messageId, viewerIds) {
  const { rows } = await db.query(
    `${messageSelect('v.id', 'CROSS JOIN unnest($2::bigint[]) AS v(id)', ', v.id AS "viewerId"')}
     WHERE m.message_id = $1`,
    [messageId, viewerIds],
  );
  return rows;
}

// The group if the user may chat in it (else 404 / 403), plus canSend and, when sending is not possible, why:
// blockedReason READ_ONLY (ended school year), OUT_OF_SCOPE / LOCKED (1-1 chat, UC-49).
export async function openChat(db, user, groupId) {
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

export const activeMemberIds = async (db, groupId) =>
  (
    await db.query(`SELECT DISTINCT user_id AS "userId" FROM group_members WHERE group_id = $1 AND left_at IS NULL`, [
      groupId,
    ])
  ).rows.map((r) => r.userId);

function parsePage({ before, limit, from }) {
  const beforeId = before === undefined || before === '' ? null : Number(before);
  if (beforeId !== null && (!Number.isSafeInteger(beforeId) || beforeId <= 0)) {
    throw badRequest('MSG_INVALID_INPUT', 'before must be a message id.');
  }
  const size = limit === undefined || limit === '' ? PAGE_DEFAULT : Number(limit);
  if (!Number.isSafeInteger(size) || size < 1 || size > PAGE_MAX) {
    throw badRequest('MSG_INVALID_INPUT', `limit must be between 1 and ${PAGE_MAX}.`);
  }
  const fromId = from === undefined || from === '' ? null : Number(from);
  if (fromId !== null && (!Number.isSafeInteger(fromId) || fromId <= 0 || beforeId === null)) {
    throw badRequest('MSG_INVALID_INPUT', 'from must be a message id, together with before.');
  }
  return { beforeId, fromId, size: fromId === null ? size : FROM_LIMIT };
}

// UC-47: one page of messages, oldest first. Without `before` (first page) the response also carries the chat's
// header data and its active members with their read state, so the client can show labels and "seen by".
// `from` (with `before`): everything from that message up to `before`, to jump to a quoted message that is not loaded.
export async function listMessages(user, groupId, query) {
  const { beforeId, fromId, size } = parsePage(query);
  const group = await openChat(pool, user, groupId);
  const visible = `m.group_id = $1 AND m.deleted_at IS NULL AND m.sent_at >= ${visibleFrom('$2')} AND NOT ${hiddenFor('$2')}`;
  const { rows } = await pool.query(
    `${messageSelect('$2')}
     WHERE ${visible} AND ($3::bigint IS NULL OR m.message_id < $3) AND ($5::bigint IS NULL OR m.message_id >= $5)
     ORDER BY m.message_id DESC
     LIMIT $4`,
    [group.groupId, user.userId, beforeId, size + 1, fromId],
  );
  let hasMore = rows.length > size;
  const messages = rows.slice(0, size).reverse();
  if (fromId !== null && !hasMore && messages.length) {
    const { rows: older } = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM messages m WHERE ${visible} AND m.message_id < $3) AS "hasMore"`,
      [group.groupId, user.userId, messages[0].messageId],
    );
    hasMore = older[0].hasMore;
  }
  const page = { groupId: group.groupId, messages: await withFiles(messages), hasMore };
  if (beforeId !== null) return page;

  const [members, reads] = await Promise.all([memberRows(pool, group.groupId), readStates(pool, group.groupId)]);
  const readById = new Map(reads.map((r) => [r.userId, r]));
  return {
    ...page,
    groupType: group.groupType,
    readOnly: group.readOnly,
    canSend: group.canSend,
    blockedReason: group.blockedReason,
    peer: group.peer, // UC-49: the other person of a 1-1 chat, without phone or email
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
// UC-49: 1-1 chats too, with the other person (`peer`). An empty 1-1 chat is returned to both its members so it can
// be opened (lastMessage null); the client does not list it until it has a message.
// The client lays the chats out from GET /groups and fills in these summaries by groupId.
export async function listConversations(user) {
  const { rows } = await pool.query(
    `SELECT g.group_id AS "groupId", g.group_type AS "groupType",
            lm.message_id AS "messageId", lm.is_deleted AS "isDeleted",
            CASE WHEN lm.is_deleted THEN NULL ELSE lm.content END AS content,
            lm.sent_at AS "sentAt", lm.sender_id AS "senderId",
            CASE WHEN lm.is_deleted THEN 0 ELSE ${fileCountSql('lm')} END AS "attachmentCount",
            u.full_name AS "senderName", e.nickname AS "senderNickname",
            peer.user_id AS "peerId", peer.full_name AS "peerName", peer.avatar_url AS "peerAvatarUrl",
            peer.status AS "peerStatus",
            (SELECT COUNT(*) FROM messages x
             WHERE x.group_id = g.group_id AND x.deleted_at IS NULL AND x.sender_id <> $1
               AND x.deleted_for_everyone_at IS NULL AND NOT ${hiddenFor('$1', 'x')}
               AND x.sent_at >= gm.joined_at
               AND (gm.last_read_at IS NULL OR x.sent_at > gm.last_read_at)) AS "unreadCount"
     FROM groups g
     JOIN LATERAL (SELECT MIN(vm.joined_at) AS joined_at, MAX(vm.last_read_at) AS last_read_at
                   FROM group_members vm
                   WHERE vm.group_id = g.group_id AND vm.user_id = $1
                   HAVING bool_or(vm.left_at IS NULL)) gm ON TRUE
     LEFT JOIN LATERAL (SELECT m.message_id, m.content, m.sent_at, m.sender_id,
                               m.deleted_for_everyone_at IS NOT NULL AS is_deleted
                        FROM messages m
                        WHERE m.group_id = g.group_id AND m.deleted_at IS NULL AND m.sent_at >= gm.joined_at
                          AND NOT ${hiddenFor('$1')}
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
             -- UC-49 1-1 chats under every role (membership checked by the gm join)
             OR (g.group_type = 'DIRECT' AND g.deleted_at IS NULL)
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
          isDeleted: r.isDeleted,
          content: r.content,
          attachmentCount: r.attachmentCount,
          sentAt: r.sentAt,
          senderId: r.senderId,
          senderName: r.senderName,
          senderNickname: r.senderNickname,
        }
      : null,
  }));
}

// The text of a message; with files it may be left empty (→ NULL, schema: a message of attachments only).
function cleanContent(content, { hasFiles = false } = {}) {
  if (hasFiles && (content === undefined || content === null || (typeof content === 'string' && !content.trim()))) {
    return null;
  }
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

// UC-47: send a message (text, files, or both). The sender's own message counts as read for them. Every active
// member gets it in real time ("message:new", all their tabs), the sender's other tabs included.
// attachments: the /uploads/confirm answers of target 'message' for THIS group (messages/<groupId>/…), at most
// MAX_MESSAGE_ATTACHMENTS; the objects are checked before the transaction, the rows written with the message.
export async function sendMessage(user, groupId, body) {
  const group = await openChat(pool, user, groupId);
  assertCanSend(group);
  const attached = uploadedFiles(body ?? {}, 'attachments', {
    folder: `messages/${group.groupId}/`,
    bucket: env.storage.buckets.attachments,
    max: MAX_MESSAGE_ATTACHMENTS,
  });
  const content = cleanContent(body?.content, { hasFiles: attached.length > 0 });
  const fileRows = await files.readUploadedFiles(attached);
  // Reply: one level; the original must be a message the sender can see in this chat, not deleted for everyone.
  let replyTo = null;
  if (body?.replyToMessageId !== undefined && body.replyToMessageId !== null) {
    const original = await findVisibleMessage(pool, user, group.groupId, body.replyToMessageId).catch(() => null);
    if (!original || original.isDeleted) throw badRequest('MSG_REPLY_INVALID', 'This message can no longer be answered.');
    replyTo = original.messageId;
  }

  const messageId = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO messages (group_id, sender_id, content, reply_to_message_id) VALUES ($1, $2, $3, $4)
       RETURNING message_id`,
      [group.groupId, user.userId, content, replyTo],
    );
    await files.insertAttachments(
      { column: FILES, id: rows[0].message_id },
      fileRows.map((r) => ({ ...r, uploadedBy: user.userId })),
      client,
    );
    await client.query(
      `UPDATE group_members SET last_read_at = NOW() WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [group.groupId, user.userId],
    );
    return rows[0].message_id;
  });

  // One payload per member: a quote may be hidden from someone who joined after the original (replyToSql).
  const memberIds = await activeMemberIds(pool, group.groupId);
  const copies = await withFiles(await messageForViewers(pool, messageId, memberIds)); // one query, signed once for every copy
  for (const { viewerId, ...message } of copies) {
    emitToUsers([viewerId], 'message:new', { groupId: group.groupId, message });
  }
  emitToUsers(memberIds, 'message:read', {
    groupId: group.groupId,
    userId: user.userId,
    lastReadMessageId: messageId,
  });
  const { viewerId: _viewerId, ...mine } = copies.find((c) => c.viewerId === user.userId);
  return mine;
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
