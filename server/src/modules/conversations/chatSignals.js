import { pool } from '../../config/db.js';
import { emitToUsers } from '../../sockets/index.js';
import { activeMemberIds, publishNewMessages } from './conversations.service.js';

// FE-06 (owner Khanh, 17/11/2026, business-rules §6 "Real time"): telling open chats that who may read or send changed,
// when the change was made by someone else's action (a class change, a teaching assignment) inside THEIR transaction.
//
// Events (ids only; the client asks the REST API again, which checks the active role and the data scope):
//   group:removed        { groupId, closed }  to a person taken out of a group: it leaves their lists, its chat closes
//   group:changed        { groupId, change }  to the members (counts, names) and to people added (it joins their lists)
//   chat:access-changed  { groupId }          to both people of a 1-1 chat of someone affected: may they still write?
//
// The change is made inside the caller's transaction, and the signals must not go out before it is saved (a rollback
// would leave the clients wrong). The caller's code is not ours to change (homeroom / teaching assignments, student
// transfers), so instead of hooking COMMIT this waits until the change can be seen from another connection: every
// removed membership closed, every added one open, every system line there. A change that never shows (rolled back,
// or a transaction slower than WAIT_MS) sends nothing; the clients then see it at the next load, as before.
const POLL_MS = 250;
const WAIT_MS = 10_000;

const pairsOf = (rows) => [rows.map((r) => r.groupId), rows.map((r) => r.userId)];

async function isSaved({ removed, added, messageIds }) {
  const [rg, ru] = pairsOf(removed);
  const [ag, au] = pairsOf(added);
  const { rows } = await pool.query(
    `SELECT NOT EXISTS (SELECT 1 FROM unnest($1::bigint[], $2::bigint[]) r(g, u)
                        WHERE EXISTS (SELECT 1 FROM group_members m
                                      WHERE m.group_id = r.g AND m.user_id = r.u AND m.left_at IS NULL))
        AND NOT EXISTS (SELECT 1 FROM unnest($3::bigint[], $4::bigint[]) a(g, u)
                        WHERE NOT EXISTS (SELECT 1 FROM group_members m
                                          WHERE m.group_id = a.g AND m.user_id = a.u AND m.left_at IS NULL))
        AND (SELECT COUNT(*) FROM messages WHERE message_id = ANY($5::bigint[])) = cardinality($5::bigint[]) AS "saved"`,
    [rg, ru, ag, au, messageIds],
  );
  return rows[0].saved;
}

/** The 1-1 chats of these people, with both members: [{ groupId, userIds }]. */
async function directChatsOf(userIds) {
  if (!userIds.length) return [];
  const { rows } = await pool.query(
    `SELECT g.group_id AS "groupId", array_agg(DISTINCT m.user_id) AS "userIds"
     FROM groups g JOIN group_members m ON m.group_id = g.group_id
     WHERE g.group_type = 'DIRECT' AND g.deleted_at IS NULL
       AND g.group_id IN (SELECT x.group_id FROM group_members x WHERE x.user_id = ANY($1::bigint[]))
     GROUP BY g.group_id`,
    [userIds],
  );
  return rows;
}

/**
 * Sends the signals of a membership change made in the caller's transaction, once it is saved (see above). Returns at
 * once; errors are only logged. changes: {
 *   removed: [{ groupId, userId }]   taken out (any group type)
 *   added:   [{ groupId, userId }]   put in or back
 *   closed:  [groupId]               teams closed because nobody is left
 *   lines:   [{ groupId, messageIds }] team system lines to send (message:new)
 * }
 */
export function signalWhenSaved({ removed = [], added = [], closed = [], lines = [] } = {}) {
  const messageIds = lines.flatMap((l) => l.messageIds);
  if (!removed.length && !added.length && !closed.length && !messageIds.length) return;
  (async () => {
    const until = Date.now() + WAIT_MS;
    while (!(await isSaved({ removed, added, messageIds }))) {
      if (Date.now() > until) return; // rolled back, or still not saved: nothing is sent
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    for (const { groupId, messageIds: ids } of lines) publishNewMessages(groupId, ids);
    for (const { groupId, userId } of removed) {
      emitToUsers([userId], 'group:removed', { groupId, closed: closed.includes(groupId) });
    }
    const touched = [...new Set([...removed, ...added].map((r) => r.groupId))].filter((g) => !closed.includes(g));
    for (const groupId of touched) {
      emitToUsers(await activeMemberIds(pool, groupId), 'group:changed', { groupId, change: 'MEMBERS' });
    }
    const people = [...new Set([...removed, ...added].map((r) => r.userId))];
    for (const chat of await directChatsOf(people)) {
      emitToUsers(chat.userIds, 'chat:access-changed', { groupId: chat.groupId });
    }
  })().catch((err) => console.error('[chat] membership signals not sent:', err?.message));
}
