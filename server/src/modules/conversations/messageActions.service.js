import { pool } from '../../config/db.js';
import { emitToUsers } from '../../sockets/index.js';
import { AppError, badRequest, forbidden } from '../../utils/AppError.js';
import {
  activeMemberIds,
  assertCanSend,
  DELETE_MINUTES_SQL,
  findVisibleMessage,
  openChat,
  reactionsSql,
} from './conversations.service.js';

// FE-06 Messaging (owner: Khanh): what one can do with a message after it is sent (business-rules §6, agreed 07/11/2026).
//   * UC-111 Reaction: one per person per message, from a fixed set; choosing another replaces it. Not counted as unread.
//   * UC-113 Delete for everyone: own message only, within chat.delete_for_everyone_minutes (15), compared in SQL. It stays
//     as a placeholder; the API never returns its content again (the database keeps it). Stops where sending stops.
//   * UC-113 Delete for me: any message one can see, no time limit, also where sending is closed; others see no change.
//     It stays hidden when the person leaves the group and comes back (exception to business-rules §4).

const conflict = (code, message, details) => new AppError(409, code, message, details);
const REACTION_CODES = ['LIKE', 'LOVE', 'HAHA', 'WOW', 'SAD', 'THANKS'];

// Tells every active member the new reactions of a message and returns them.
async function publishReactions(group, messageId) {
  const { rows } = await pool.query(`SELECT ${reactionsSql()} AS reactions FROM messages m WHERE m.message_id = $1`, [
    messageId,
  ]);
  const { reactions } = rows[0];
  emitToUsers(await activeMemberIds(pool, group.groupId), 'message:reaction', {
    groupId: group.groupId,
    messageId,
    reactions,
  });
  return { groupId: group.groupId, messageId, reactions };
}

async function openForChange(user, groupId, messageId) {
  const group = await openChat(pool, user, groupId);
  assertCanSend(group);
  const message = await findVisibleMessage(pool, user, group.groupId, messageId);
  if (message.isDeleted) throw conflict('MSG_MESSAGE_DELETED', 'This message has been deleted.');
  return { group, message };
}

export async function setReaction(user, groupId, messageId, code) {
  if (!REACTION_CODES.includes(code)) throw badRequest('MSG_REACTION_INVALID', 'This reaction is not available.');
  const { group, message } = await openForChange(user, groupId, messageId);
  await pool.query(
    `INSERT INTO message_reactions (message_id, user_id, reaction_code) VALUES ($1, $2, $3)
     ON CONFLICT (message_id, user_id) DO UPDATE SET reaction_code = EXCLUDED.reaction_code`,
    [message.messageId, user.userId, code],
  );
  return publishReactions(group, message.messageId);
}

export async function removeReaction(user, groupId, messageId) {
  const { group, message } = await openForChange(user, groupId, messageId);
  await pool.query('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2', [
    message.messageId,
    user.userId,
  ]);
  return publishReactions(group, message.messageId);
}

async function deleteForEveryone(user, group, message) {
  // The time limit is checked in the UPDATE itself, so a request at the last moment cannot slip through.
  const { rowCount } = await pool.query(
    `UPDATE messages SET deleted_for_everyone_at = NOW(), deleted_for_everyone_by = $2
     WHERE message_id = $1 AND sender_id = $2 AND deleted_for_everyone_at IS NULL
       AND sent_at > NOW() - make_interval(mins => ${DELETE_MINUTES_SQL})`,
    [message.messageId, user.userId],
  );
  if (!rowCount) {
    if (message.senderId !== user.userId) {
      throw forbidden('MSG_DELETE_NOT_OWNER', 'Only the sender can delete a message for everyone.');
    }
    if (message.isDeleted) throw conflict('MSG_MESSAGE_DELETED', 'This message has been deleted.');
    throw conflict('MSG_DELETE_EXPIRED', 'This message can no longer be deleted for everyone.');
  }
  // No content in the event.
  emitToUsers(await activeMemberIds(pool, group.groupId), 'message:deleted', {
    groupId: group.groupId,
    messageId: message.messageId,
  });
}

async function deleteForMe(user, group, message) {
  await pool.query(
    `INSERT INTO message_user_deletions (message_id, user_id) VALUES ($1, $2)
     ON CONFLICT (message_id, user_id) DO NOTHING`,
    [message.messageId, user.userId],
  );
  // Only the person's own tabs: nobody else sees any change.
  emitToUsers([user.userId], 'message:hidden', { groupId: group.groupId, messageId: message.messageId });
}

export async function deleteMessage(user, groupId, messageId, scope) {
  if (scope !== 'everyone' && scope !== 'me') {
    throw badRequest('MSG_DELETE_SCOPE_INVALID', 'Choose who the message is deleted for.');
  }
  const group = await openChat(pool, user, groupId);
  if (scope === 'everyone') assertCanSend(group);
  const message = await findVisibleMessage(pool, user, group.groupId, messageId);
  if (scope === 'everyone') await deleteForEveryone(user, group, message);
  else await deleteForMe(user, group, message);
  return { groupId: group.groupId, messageId: message.messageId, scope };
}
