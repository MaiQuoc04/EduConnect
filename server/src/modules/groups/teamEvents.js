import { emitToUsers } from '../../sockets/index.js';
import { activeMemberIds, publishNewMessages } from '../conversations/conversations.service.js';
import { pool } from '../../config/db.js';
import { signalWhenSaved } from '../conversations/chatSignals.js';

// Team leader and system lines (FE-04 teams / FE-06 chat, owner Khanh; approved by the lead 15/11/2026, business-rules
// §4 "Teams in detail" and §6). Shared by teams.service.js (create, rename, leave, hand over) and by the code that takes
// people out of a class's teams (classes/classGroups.js syncClassTeachers, students.service.js transfer / promotion).
//
// System lines are rows of messages with message_type 'SYSTEM' (sender_id = the member the line is about):
//   TEAM_CREATED    "A đã tạo nhóm"
//   TEAM_RENAMED    "A đã đổi tên nhóm thành <content>"
//   MEMBER_LEFT     "A đã rời nhóm"
//   MEMBER_REMOVED  "A không còn trong nhóm"            (a class change, not their own choice)
//   LEADER_CHANGED  "A đã chuyển quyền trưởng nhóm cho B" (target_user_id = B)
//   MEMBER_ADDED    "A đã thêm B vào nhóm"               (17/11/2026: the leader adds B, target_user_id = B)
//   MEMBER_KICKED   "A đã xoá B khỏi nhóm"               (17/11/2026: the leader removes B, target_user_id = B)

export const EVENTS = Object.freeze({
  CREATED: 'TEAM_CREATED',
  RENAMED: 'TEAM_RENAMED',
  LEFT: 'MEMBER_LEFT',
  REMOVED: 'MEMBER_REMOVED',
  LEADER: 'LEADER_CHANGED',
  ADDED: 'MEMBER_ADDED',
  KICKED: 'MEMBER_KICKED',
});

/** Writes one system line in the caller's transaction; returns its message id (sent later with publish()). */
export async function insertSystemLine(client, { groupId, actorId, event, content = null, targetUserId = null }) {
  const { rows } = await client.query(
    `INSERT INTO messages (group_id, sender_id, content, message_type, system_event, target_user_id)
     VALUES ($1, $2, $3, 'SYSTEM', $4, $5)
     RETURNING message_id AS "messageId"`,
    [groupId, actorId, content, event, targetUserId],
  );
  return rows[0].messageId;
}

// The member who becomes leader when the leader is taken out by the system: the one who joined first among those
// still in (locked accounts included: business-rules §4, Q4 15/11/2026). null when nobody is left.
async function firstMember(client, groupId) {
  const { rows } = await client.query(
    `SELECT user_id AS "userId" FROM group_members
     WHERE group_id = $1 AND left_at IS NULL
     ORDER BY joined_at, member_id LIMIT 1`,
    [groupId],
  );
  return rows[0]?.userId ?? null;
}

/**
 * After the system took people out of groups ([{ groupId, userId }], left_at already set, in the caller's transaction):
 * for each TEAM_CHAT among them, a MEMBER_REMOVED line per person, the leadership handed to the first member still in
 * when the leader was one of them (LEADER_CHANGED), and the team closed when nobody is left (no line then).
 * Returns { lines: [{ groupId, messageIds }], closed: [groupId], removed }. Class groups in the list are ignored.
 * Real time (17/11/2026): the lines, group:removed / group:changed and chat:access-changed go out by themselves once the
 * caller's transaction is saved (chatSignals.signalWhenSaved) – callers send nothing.
 */
export async function afterRemovedFromTeams(client, removed) {
  const result = { lines: [], closed: [], removed: [] };
  if (!removed?.length) return result;
  const { rows: teams } = await client.query(
    `SELECT group_id AS "groupId", leader_id AS "leaderId" FROM groups
     WHERE group_id = ANY($1::bigint[]) AND group_type = 'TEAM_CHAT' AND deleted_at IS NULL
     FOR UPDATE`,
    [[...new Set(removed.map((r) => r.groupId))]],
  );
  for (const team of teams) {
    const people = removed.filter((r) => r.groupId === team.groupId).map((r) => r.userId);
    result.removed.push(...people.map((userId) => ({ groupId: team.groupId, userId })));
    const next = await firstMember(client, team.groupId);
    if (!next) {
      await client.query('UPDATE groups SET deleted_at = NOW() WHERE group_id = $1 AND deleted_at IS NULL', [team.groupId]);
      result.closed.push(team.groupId);
      continue;
    }
    const messageIds = [];
    for (const userId of people) {
      messageIds.push(await insertSystemLine(client, { groupId: team.groupId, actorId: userId, event: EVENTS.REMOVED }));
    }
    if (team.leaderId && people.includes(team.leaderId)) {
      await client.query('UPDATE groups SET leader_id = $2 WHERE group_id = $1', [team.groupId, next]);
      messageIds.push(
        await insertSystemLine(client, {
          groupId: team.groupId,
          actorId: team.leaderId,
          event: EVENTS.LEADER,
          targetUserId: next,
        }),
      );
    }
    result.lines.push({ groupId: team.groupId, messageIds });
  }
  signalWhenSaved(result);
  return result;
}

/**
 * Real time, after COMMIT (never inside the transaction). For each changed team:
 *   message:new     the system lines, to every active member (publishNewMessages)
 *   group:changed   { groupId, change } to every active member: lists, names, leader and member counts re-read
 *   group:removed   { groupId, closed } to the people who are out (all their tabs): the team leaves their lists
 * changes: { lines: [{ groupId, messageIds }], changed: [{ groupId, change }], removed: [{ groupId, userId }],
 * closed: [groupId] }. Errors are only logged.
 */
export function publish({ lines = [], changed = [], removed = [], closed = [] } = {}) {
  for (const { groupId, messageIds } of lines) publishNewMessages(groupId, messageIds);
  (async () => {
    for (const { groupId, change } of changed) {
      emitToUsers(await activeMemberIds(pool, groupId), 'group:changed', { groupId, change });
    }
    for (const { groupId, userId } of removed) {
      emitToUsers([userId], 'group:removed', { groupId, closed: closed.includes(groupId) });
    }
  })().catch((err) => console.error('[teams] group signals not sent:', err?.message));
}
