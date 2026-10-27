import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, forbidden, notFound } from '../../utils/AppError.js';
import { classPeopleSql, GROUP_RULE_SQL } from '../classes/classGroups.js';
import { findGroupForUser } from './groupAccess.js';
import { byRankThenName, memberRows } from './groups.service.js';

// FE-04 Class & Group Management – managing class group members (owner: Khanh). Screen SCR-24 Group Member List.
// UC-32 Add Group Member, UC-33 Remove Group Member (School Manager or the class's homeroom teacher, permissions
// note 5) and UC-34 Set Student Nickname (homeroom teacher only). Class groups of an open school year only.

const conflict = (code, message, details) => new AppError(409, code, message, details);
const NICKNAME_MAX = 50; // ASSUMPTION (agreed 27/10): 50 characters, although the column allows 100.

// The group, if the user may change its members. Inside a transaction the group row is locked, so two people
// adding the same member at once cannot create two active rows (schema: one active row per user, checked in code).
async function manageableGroup(db, user, groupId, { lock = false } = {}) {
  const group = await findGroupForUser(db, user, groupId);
  if (group.classId === null) throw forbidden();
  if (group.readOnly) throw conflict('MSG_GROUP_READ_ONLY', 'The school year has ended; the group is read only.');
  if (!group.canManageMembers) throw forbidden();
  if (lock) await db.query('SELECT 1 FROM groups WHERE group_id = $1 FOR UPDATE', [group.groupId]);
  return group;
}

// People of the class who belong in this group (classGroups.js rules) but are not active members now: never added,
// or removed / left before (leftAt = when they last left).
async function candidateRows(db, group) {
  const { rows } = await db.query(
    `WITH g AS (SELECT group_id, group_type FROM groups WHERE group_id = $1),
     people AS (${classPeopleSql('$2')})
     SELECT u.user_id AS "userId", u.full_name AS "fullName", u.avatar_url AS "avatarUrl", u.status,
            array_agg(DISTINCT p.kind ORDER BY p.kind) AS "kinds",
            (SELECT s.student_code FROM students s WHERE s.user_id = u.user_id) AS "studentCode",
            (SELECT MAX(m.left_at) FROM group_members m WHERE m.group_id = $1 AND m.user_id = u.user_id) AS "leftAt",
            COALESCE((SELECT json_agg(json_build_object('fullName', cu.full_name, 'relationship', sp.relationship_type)
                                      ORDER BY cu.full_name)
                      FROM parents pa
                      JOIN student_parents sp ON sp.parent_id = pa.parent_id
                      JOIN class_enrollments ce ON ce.student_id = sp.student_id
                                               AND ce.class_id = $2 AND ce.status = 'STUDYING'
                      JOIN students cs ON cs.student_id = sp.student_id
                      JOIN users cu ON cu.user_id = cs.user_id
                      WHERE pa.user_id = u.user_id), '[]'::json) AS "children"
     FROM g
     JOIN people p ON ${GROUP_RULE_SQL}
     JOIN users u ON u.user_id = p.user_id
     WHERE NOT EXISTS (SELECT 1 FROM group_members m
                       WHERE m.group_id = $1 AND m.user_id = u.user_id AND m.left_at IS NULL)
     GROUP BY u.user_id`,
    [group.groupId, group.classId],
  );
  return rows.map((r) => ({
    ...r,
    // Same labels as the member list.
    kinds: r.kinds.map((k) => (k === 'TEACHER' ? 'SUBJECT_TEACHER' : k)),
    children: r.kinds.includes('PARENT') ? r.children : [],
  }));
}

// UC-32: who can be added to the group.
export async function listCandidates(user, groupId) {
  const group = await manageableGroup(pool, user, groupId);
  const candidates = await candidateRows(pool, group);
  return { groupId: group.groupId, candidates: candidates.sort(byRankThenName) };
}

function parseUserIds(value) {
  if (!Array.isArray(value) || !value.length) throw badRequest('MSG_REQUIRED', 'Please choose at least one person.');
  if (value.length > 500) throw badRequest('MSG_REQUIRED', 'Too many people at once.');
  const ids = value.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw badRequest('MSG_GROUP_MEMBER_NOT_ELIGIBLE', 'Some people cannot join this group.');
  }
  if (new Set(ids).size !== ids.length) throw badRequest('MSG_GROUP_MEMBER_DUPLICATE', 'A person is listed twice.');
  return ids;
}

// UC-32 Add Group Member: people of the same class only, each into a group they belong in. Re-joining adds a new
// row (schema); the old row with its left_at stays.
export async function addMembers(user, groupId, userIds) {
  const ids = parseUserIds(userIds);
  return withTransaction(async (client) => {
    const group = await manageableGroup(client, user, groupId, { lock: true });
    const { rows: active } = await client.query(
      `SELECT user_id AS "userId" FROM group_members
       WHERE group_id = $1 AND left_at IS NULL AND user_id = ANY($2::bigint[])`,
      [group.groupId, ids],
    );
    if (active.length) {
      throw conflict('MSG_GROUP_MEMBER_EXISTS', 'Some people are already in the group.', {
        userIds: active.map((r) => r.userId),
      });
    }
    const allowed = new Set((await candidateRows(client, group)).map((c) => c.userId));
    const wrong = ids.filter((id) => !allowed.has(id));
    if (wrong.length) {
      throw badRequest('MSG_GROUP_MEMBER_NOT_ELIGIBLE', 'Some people cannot join this group.', { userIds: wrong });
    }
    await client.query(
      `INSERT INTO group_members (group_id, user_id) SELECT $1, x FROM unnest($2::bigint[]) AS x`,
      [group.groupId, ids],
    );
    return { groupId: group.groupId, added: ids.length };
  });
}

// UC-33 Remove Group Member: sets left_at (business-rules §6, the row is kept for chat history and read receipts).
// The homeroom teacher cannot be removed: they moderate the class groups (business-rules §5).
// ASSUMPTION (agreed 27/10): the homeroom teacher removes students and parents only; teachers are removed by the
// School Manager, who also makes the teaching assignments.
export async function removeMember(user, groupId, memberUserId) {
  const targetId = Number(memberUserId);
  if (!Number.isSafeInteger(targetId) || targetId <= 0) {
    throw notFound('MSG_GROUP_MEMBER_NOT_FOUND', 'This person is not in the group.');
  }
  return withTransaction(async (client) => {
    const group = await manageableGroup(client, user, groupId, { lock: true });
    const target = (await memberRows(client, group.groupId)).find((m) => m.userId === targetId);
    if (!target) throw notFound('MSG_GROUP_MEMBER_NOT_FOUND', 'This person is not in the group.');
    if (target.kinds.includes('HOMEROOM')) {
      throw conflict('MSG_GROUP_MEMBER_HOMEROOM', 'The homeroom teacher cannot be removed from the class groups.');
    }
    const teacher = target.kinds.some((k) => ['SUBJECT_TEACHER', 'TEACHER'].includes(k));
    if (teacher && user.activeRole !== 'SCHOOL_MANAGER') {
      throw forbidden('MSG_GROUP_MEMBER_TEACHER', 'Only the School Manager can remove a teacher from the group.');
    }
    await client.query(
      'UPDATE group_members SET left_at = NOW() WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL',
      [group.groupId, targetId],
    );
    // FE-06 (Messaging) should drop the user's socket from room `group:<id>` once it keeps group rooms.
    return { groupId: group.groupId, userId: targetId };
  });
}

// UC-34 Set Student Nickname: the homeroom teacher names a studying student of their class; the nickname is stored
// on the enrollment, so it shows in all three class groups and nowhere else. An empty value clears it.
export async function setNickname(user, groupId, studentUserId, value) {
  if (value !== null && value !== undefined && typeof value !== 'string') {
    throw badRequest('MSG_NICKNAME_INVALID', 'The nickname must be text.');
  }
  const nickname = (value ?? '').trim().replace(/\s+/g, ' ');
  if (/[\r\n\t]/.test(value ?? '')) throw badRequest('MSG_NICKNAME_INVALID', 'The nickname must be on one line.');
  if (nickname.length > NICKNAME_MAX) {
    throw badRequest('MSG_NICKNAME_TOO_LONG', `A nickname has at most ${NICKNAME_MAX} characters.`, { max: NICKNAME_MAX });
  }
  const targetId = Number(studentUserId);
  return withTransaction(async (client) => {
    const group = await findGroupForUser(client, user, groupId);
    if (group.classId === null) throw forbidden();
    if (group.readOnly) throw conflict('MSG_GROUP_READ_ONLY', 'The school year has ended; the group is read only.');
    // UC-34 names the homeroom teacher only; the School Manager cannot set nicknames.
    if (user.activeRole !== 'TEACHER' || !group.isHomeroom) throw forbidden();
    const { rows } = await client.query(
      `UPDATE class_enrollments e SET nickname = NULLIF($3, '')
       FROM students s
       WHERE s.student_id = e.student_id AND s.user_id = $2 AND e.class_id = $1 AND e.status = 'STUDYING'
       RETURNING e.nickname`,
      [group.classId, Number.isSafeInteger(targetId) ? targetId : 0, nickname],
    );
    if (!rows.length) throw notFound('MSG_NICKNAME_NOT_STUDENT', 'Only a studying student of the class has a nickname.');
    return { userId: targetId, nickname: rows[0].nickname };
  });
}
