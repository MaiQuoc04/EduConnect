import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, forbidden } from '../../utils/AppError.js';
import { VI_TRANSLATE, containsPattern } from '../../utils/search.js';
import { classPeopleSql } from '../classes/classGroups.js';
import { byRankThenName } from '../groups/groups.service.js';

// FE-06 Messaging (owner: Khanh). UC-49 Send Private Message: find someone one may write to and open the 1-1 chat
// with them. A 1-1 chat is a group of type DIRECT with its two members and direct_key "<smallerId>_<largerId>"
// (unique, so a pair never has two chats – business-rules §6). Messages, read receipts and the real-time events are
// the UC-47 code; the conversation list is UC-48.
//
// Who one may write to (business-rules §6 "only with people in one's own classes (SM: within the teacher group)",
// by the ACTIVE role):
//   * Teacher / Student / Parent: everyone of the classes of a school year that has not ended which they belong to
//     through the active role (homeroom and subject teachers, studying students, their parents) – the same
//     class people as FE-04 classGroups.js;
//   * School Manager: the members of the school-wide teacher group;
//   * ASSUMPTION (plan Q9, Khanh 04/11, to be confirmed by the lead): a teacher may also write to the members of the
//     teacher group (other teachers, School Managers), so they can answer a School Manager;
//   * ASSUMPTION (Q2): locked accounts cannot get a new chat and cannot be written to; their old chat stays readable.
//   * ASSUMPTION (Q1): when the two are no longer in reach (transfer, promotion, assignment ended), the old chat
//     stays readable but nobody can send in it.
//   * ASSUMPTION (Q10): a 1-1 chat shows under every role of its two members (it is personal); sending is checked
//     with the active role. ASSUMPTION (Q6): full names only, never the class nickname.
// Phone and email of contacts only for teachers and the School Manager (permissions note 2).

const conflict = (code, message, details) => new AppError(409, code, message, details);
const CONTACT_LIMIT = 50;

// Class membership kinds (classGroups.js) that put the active role in a class.
const KINDS_BY_ROLE = {
  TEACHER: ['HOMEROOM', 'TEACHER'],
  STUDENT: ['STUDENT'],
  PARENT: ['PARENT'],
  SCHOOL_MANAGER: [],
};

export const seesContacts = (user) => ['TEACHER', 'SCHOOL_MANAGER'].includes(user.activeRole);

// CTEs "reach" (user_id, class_id, kind) = everyone the user ($1, role $2, class kinds $3) may write to.
// class_id is NULL for the teacher group. Includes the user and locked accounts – callers filter them out.
const REACH_CTES = `
  my_classes AS (
    SELECT cl.class_id, cl.class_name
    FROM classes cl JOIN school_years sy ON sy.school_year_id = cl.school_year_id
    WHERE cl.deleted_at IS NULL AND CURRENT_DATE <= sy.end_date
      AND EXISTS (SELECT 1 FROM (${classPeopleSql('cl.class_id')}) mp
                  WHERE mp.user_id = $1 AND mp.kind = ANY($3::text[]))
  ),
  class_reach AS (
    SELECT mc.class_id, p.user_id, CASE p.kind WHEN 'TEACHER' THEN 'SUBJECT_TEACHER' ELSE p.kind END AS kind
    FROM my_classes mc CROSS JOIN LATERAL (${classPeopleSql('mc.class_id')}) p
  ),
  teacher_reach AS (
    SELECT NULL::bigint AS class_id, tm.user_id,
           CASE WHEN EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
                             WHERE ur.user_id = tm.user_id AND r.role_code = 'SCHOOL_MANAGER')
                THEN 'MANAGER' ELSE 'TEACHER' END AS kind
    FROM groups tg JOIN group_members tm ON tm.group_id = tg.group_id AND tm.left_at IS NULL
    WHERE tg.group_type = 'TEACHER_SCHOOL' AND tg.deleted_at IS NULL AND $2 IN ('TEACHER', 'SCHOOL_MANAGER')
      AND EXISTS (SELECT 1 FROM group_members me
                  WHERE me.group_id = tg.group_id AND me.user_id = $1 AND me.left_at IS NULL)
  ),
  reach AS (SELECT * FROM class_reach UNION SELECT * FROM teacher_reach)`;

const reachParams = (user) => [user.userId, user.activeRole, KINDS_BY_ROLE[user.activeRole] ?? []];

// People in reach with their labels: kinds, the shared classes, children (for parents: their studying children in
// the shared classes), the existing 1-1 chat, and contacts when the role may see them.
//   filters: { search, classId, userIds, activeOnly }
async function findContacts(db, user, { search = null, classId = null, userIds = null, activeOnly = true } = {}) {
  const { rows } = await db.query(
    `WITH ${REACH_CTES},
     people AS (
       SELECT r.user_id, array_agg(DISTINCT r.kind) AS kinds,
              array_remove(array_agg(DISTINCT r.class_id), NULL) AS class_ids
       FROM reach r
       WHERE r.user_id <> $1 AND ($5::bigint IS NULL OR r.class_id = $5)
       GROUP BY r.user_id
     )
     SELECT u.user_id AS "userId", u.full_name AS "fullName", u.avatar_url AS "avatarUrl", u.status,
            p.kinds,
            CASE WHEN $8 THEN u.email END AS email, CASE WHEN $8 THEN u.phone END AS phone,
            COALESCE((SELECT json_agg(json_build_object('classId', mc.class_id, 'className', mc.class_name)
                                      ORDER BY mc.class_name)
                      FROM my_classes mc WHERE mc.class_id = ANY(p.class_ids)), '[]'::json) AS classes,
            COALESCE((SELECT json_agg(DISTINCT jsonb_build_object('fullName', cu.full_name,
                                                                  'relationship', sp.relationship_type))
                      FROM parents pa
                      JOIN student_parents sp ON sp.parent_id = pa.parent_id
                      JOIN class_enrollments ce ON ce.student_id = sp.student_id AND ce.status = 'STUDYING'
                                               AND ce.class_id = ANY(p.class_ids)
                      JOIN students cs ON cs.student_id = sp.student_id
                      JOIN users cu ON cu.user_id = cs.user_id
                      WHERE pa.user_id = u.user_id AND 'PARENT' = ANY(p.kinds)), '[]'::json) AS children,
            (SELECT g.group_id FROM groups g
             WHERE g.group_type = 'DIRECT' AND g.deleted_at IS NULL
               AND g.direct_key = LEAST($1, u.user_id) || '_' || GREATEST($1, u.user_id)) AS "directGroupId"
     FROM people p
     JOIN users u ON u.user_id = p.user_id
     WHERE ($4::text IS NULL OR lower(translate(u.full_name, $6, $7)) LIKE $4)
       AND ($9::bigint[] IS NULL OR u.user_id = ANY($9::bigint[]))
       AND (NOT $10 OR u.status = 'ACTIVE')`,
    [
      ...reachParams(user),
      search,
      classId,
      VI_TRANSLATE.from,
      VI_TRANSLATE.to,
      seesContacts(user),
      userIds,
      activeOnly,
    ],
  );
  return rows;
}

// Whether the user (active role) may write to otherId now: { allowed, locked }.
export async function directAllowed(db, user, otherId) {
  const [contact] = await findContacts(db, user, { userIds: [otherId], activeOnly: false });
  if (!contact) return { allowed: false, locked: false, contact: null };
  const locked = contact.status !== 'ACTIVE';
  return { allowed: !locked, locked, contact };
}

// Of these users, the ones the user (active role) may write to now (active accounts in reach), with their existing
// 1-1 chat: Map userId -> directGroupId | null. Used by the "Nhắn tin" button of the group member list (UC-31).
export async function messageableUsers(db, user, userIds) {
  if (!userIds.length) return new Map();
  const rows = await findContacts(db, user, { userIds });
  return new Map(rows.map((r) => [r.userId, r.directGroupId ?? null]));
}

// The other member of a 1-1 chat, with labels when still in reach (else the plain account).
export async function directPeer(db, user, groupId) {
  const { rows } = await db.query(
    `SELECT u.user_id AS "userId", u.full_name AS "fullName", u.avatar_url AS "avatarUrl", u.status
     FROM group_members gm JOIN users u ON u.user_id = gm.user_id
     WHERE gm.group_id = $1 AND gm.user_id <> $2
     ORDER BY gm.member_id LIMIT 1`,
    [groupId, user.userId],
  );
  const peer = rows[0];
  if (!peer) return null;
  const check = await directAllowed(db, user, peer.userId);
  const info = check.contact ?? { ...peer, kinds: [], classes: [], children: [] };
  return { ...info, canSend: check.allowed, locked: peer.status !== 'ACTIVE' };
}

function parseId(value, code, message) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw badRequest(code, message);
  return id;
}

// UC-49: people the user may write to, best matches first (teachers, then students, then parents; by given name).
export async function listContacts(user, query) {
  const search = containsPattern(query?.q);
  const classId =
    query?.classId === undefined || query.classId === ''
      ? null
      : parseId(query.classId, 'MSG_INVALID_INPUT', 'classId must be a class id.');
  const rows = await findContacts(pool, user, { search, classId });
  const sorted = rows.sort(byRankThenName);
  return { total: sorted.length, limit: CONTACT_LIMIT, contacts: sorted.slice(0, CONTACT_LIMIT) };
}

// UC-49: open the 1-1 chat with someone – the existing one (even if no longer in reach: it stays readable), or a
// new one when the user may write to them. Safe to call twice at once: direct_key is unique.
export async function openDirect(user, body) {
  const otherId = parseId(body?.userId, 'MSG_DIRECT_NOT_ALLOWED', 'Please choose someone to write to.');
  if (otherId === user.userId) throw badRequest('MSG_DIRECT_SELF', 'You cannot write to yourself.');
  const key = `${Math.min(user.userId, otherId)}_${Math.max(user.userId, otherId)}`;

  const existing = async (db) =>
    (
      await db.query(
        `SELECT g.group_id AS "groupId" FROM groups g
         JOIN group_members gm ON gm.group_id = g.group_id AND gm.user_id = $2 AND gm.left_at IS NULL
         WHERE g.direct_key = $1 AND g.group_type = 'DIRECT' AND g.deleted_at IS NULL`,
        [key, user.userId],
      )
    ).rows[0];

  const found = await existing(pool);
  if (found) return { groupId: found.groupId, created: false };

  const check = await directAllowed(pool, user, otherId);
  if (check.locked) throw conflict('MSG_DIRECT_LOCKED', 'This account is locked.');
  if (!check.allowed) throw forbidden('MSG_DIRECT_NOT_ALLOWED', 'You can only write to people of your classes.');

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO groups (class_id, group_name, group_type, direct_key, require_approval, created_by)
       VALUES (NULL, NULL, 'DIRECT', $1, FALSE, $2)
       ON CONFLICT (direct_key) DO NOTHING
       RETURNING group_id AS "groupId"`,
      [key, user.userId],
    );
    if (!rows.length) {
      // The other person opened it at the same moment.
      const again = await existing(client);
      if (again) return { groupId: again.groupId, created: false };
      throw forbidden('MSG_DIRECT_NOT_ALLOWED', 'This chat cannot be opened.');
    }
    const { groupId } = rows[0];
    await client.query(`INSERT INTO group_members (group_id, user_id) VALUES ($1, $2), ($1, $3)`, [
      groupId,
      user.userId,
      otherId,
    ]);
    return { groupId, created: true };
  });
}
