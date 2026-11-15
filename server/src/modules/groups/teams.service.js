import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, forbidden } from '../../utils/AppError.js';
import { classPeopleSql } from '../classes/classGroups.js';
import { findGroupForUser } from './groupAccess.js';
import { byRankThenName } from './groups.service.js';
import { EVENTS, insertSystemLine, publish } from './teamEvents.js';

// FE-04 Class & Group Management – teams (owner: Khanh). UC-35 Create Team Chat: a chat-only group (TEAM_CHAT) with
// people of one class, created by a teacher, student or parent (business-rules §4; never SM or SA). The chat itself
// is FE-06. Members are fixed at creation (nobody adds people); a member can leave.
// Teacher team (lead OK 05/11/2026): no class, created by a teacher from the teachers of the teacher group.
// Leader and system lines (lead OK 15/11/2026, business-rules §4): the creator is the team leader; the leader can hand
// it over at any time and must hand it over before leaving while others remain; any member can rename the team. Each
// of these writes a system line in the team chat (teamEvents.js), sent in real time after COMMIT.

const conflict = (code, message, details) => new AppError(409, code, message, details);

// ASSUMPTION (agreed 27/10): a team has the creator plus 2–49 others (a pair already has a 1-1 chat), a name of
// 2–100 characters (not unique), and locked accounts cannot be picked (they cannot sign in).
const MIN_OTHERS = 2;
const MAX_MEMBERS = 50;
const NAME_MIN = 2;
const NAME_MAX = 100;

// Which kinds of class membership (classGroups.js) let each active role create a team in that class.
const KINDS_BY_ROLE = {
  TEACHER: ['HOMEROOM', 'TEACHER'],
  STUDENT: ['STUDENT'],
  PARENT: ['PARENT'],
};

function kindsFor(user) {
  const kinds = KINDS_BY_ROLE[user.activeRole];
  if (!kinds) throw forbidden(); // School Manager (System Admin is already stopped by the router)
  return kinds;
}

// Classes of a school year that has not ended, which the user belongs to through the active role.
async function teamClasses(db, user, kinds, classId = null) {
  const { rows } = await db.query(
    `SELECT cl.class_id AS "classId", cl.class_name AS "className", gl.grade_level_name AS "gradeLevel",
            sy.year_name AS "yearName"
     FROM classes cl
     JOIN grade_levels gl ON gl.grade_level_id = cl.grade_level_id
     JOIN school_years sy ON sy.school_year_id = cl.school_year_id
     WHERE cl.deleted_at IS NULL AND CURRENT_DATE <= sy.end_date
       AND ($3::bigint IS NULL OR cl.class_id = $3)
       AND EXISTS (SELECT 1 FROM (${classPeopleSql('cl.class_id')}) p
                   WHERE p.user_id = $1 AND p.kind = ANY($2::text[]))
     ORDER BY sy.start_date DESC, gl.grade_level_name, cl.class_name`,
    [user.userId, kinds, classId],
  );
  return rows;
}

// Everyone of these classes except the user, with why they belong (same labels as the member list). Student codes
// only for teachers (permissions note 2).
async function classPeople(db, user, classIds) {
  const { rows } = await db.query(
    `WITH people AS (
       SELECT cl.class_id, p.user_id,
              array_agg(DISTINCT CASE p.kind WHEN 'TEACHER' THEN 'SUBJECT_TEACHER' ELSE p.kind END) AS kinds
       FROM classes cl
       CROSS JOIN LATERAL (${classPeopleSql('cl.class_id')}) p
       WHERE cl.class_id = ANY($1::bigint[]) AND p.user_id <> $2
       GROUP BY cl.class_id, p.user_id
     )
     SELECT pe.class_id AS "classId", u.user_id AS "userId", u.full_name AS "fullName", u.avatar_url AS "avatarUrl",
            u.status, pe.kinds,
            CASE WHEN $3 THEN (SELECT s.student_code FROM students s WHERE s.user_id = u.user_id) END AS "studentCode",
            COALESCE((SELECT json_agg(json_build_object('fullName', cu.full_name, 'relationship', sp.relationship_type)
                                      ORDER BY cu.full_name)
                      FROM parents pa
                      JOIN student_parents sp ON sp.parent_id = pa.parent_id
                      JOIN class_enrollments ce ON ce.student_id = sp.student_id
                                               AND ce.class_id = pe.class_id AND ce.status = 'STUDYING'
                      JOIN students cs ON cs.student_id = sp.student_id
                      JOIN users cu ON cu.user_id = cs.user_id
                      WHERE pa.user_id = u.user_id AND 'PARENT' = ANY(pe.kinds)), '[]'::json) AS "children"
     FROM people pe
     JOIN users u ON u.user_id = pe.user_id`,
    [classIds, user.userId, user.activeRole === 'TEACHER'],
  );
  return rows;
}

// Teachers of the school-wide group the user can pick for a teacher team, or null when the user cannot create one
// (active role Teacher and a member of the teacher group). School Managers are never picked (business-rules §4).
async function teacherTeamOptions(db, user) {
  if (user.activeRole !== 'TEACHER') return null;
  const { rows: groups } = await db.query(
    `SELECT g.group_id AS "groupId", g.group_name AS "groupName"
     FROM groups g JOIN group_members me ON me.group_id = g.group_id AND me.user_id = $1 AND me.left_at IS NULL
     WHERE g.group_type = 'TEACHER_SCHOOL' AND g.deleted_at IS NULL
     ORDER BY g.group_id LIMIT 1`,
    [user.userId],
  );
  if (!groups.length) return null;
  const { rows: people } = await db.query(
    `SELECT DISTINCT u.user_id AS "userId", u.full_name AS "fullName", u.avatar_url AS "avatarUrl", u.status,
            t.department, ARRAY['TEACHER']::text[] AS kinds, '[]'::jsonb AS children
     FROM group_members m
     JOIN teachers t ON t.user_id = m.user_id
     JOIN users u ON u.user_id = m.user_id
     WHERE m.group_id = $1 AND m.left_at IS NULL AND m.user_id <> $2`,
    [groups[0].groupId, user.userId],
  );
  return { ...groups[0], people: people.sort(byRankThenName) };
}

// One new team and its members, inside the caller's transaction. classId is null for a teacher team.
async function insertTeam(client, user, classId, teamName, memberIds) {
  const { rows } = await client.query(
    `INSERT INTO groups (class_id, group_name, group_type, require_approval, created_by, leader_id)
     VALUES ($1, $2, 'TEAM_CHAT', FALSE, $3, $3)
     RETURNING group_id AS "groupId"`,
    [classId, teamName, user.userId],
  );
  const { groupId } = rows[0];
  await client.query(`INSERT INTO group_members (group_id, user_id) SELECT $1, x FROM unnest($2::bigint[]) AS x`, [
    groupId,
    [user.userId, ...memberIds],
  ]);
  // "A đã tạo nhóm" opens the chat (written after the members, so everyone sees it: history starts at joining).
  await insertSystemLine(client, { groupId, actorId: user.userId, event: EVENTS.CREATED });
  return { groupId, groupName: teamName, memberCount: memberIds.length + 1 };
}

// UC-35 form data: the classes the user can create a team in, each with the people they can pick; for a teacher also
// the teachers they can pick for a teacher team (teacherGroup, null otherwise).
export async function teamOptions(user) {
  const kinds = kindsFor(user);
  const classes = await teamClasses(pool, user, kinds);
  const people = classes.length ? await classPeople(pool, user, classes.map((c) => c.classId)) : [];
  return {
    teacherGroup: await teacherTeamOptions(pool, user),
    limits: { minOthers: MIN_OTHERS, maxMembers: MAX_MEMBERS, nameMin: NAME_MIN, nameMax: NAME_MAX },
    classes: classes.map((c) => ({
      ...c,
      people: people
        .filter((p) => p.classId === c.classId)
        .map(({ classId: _classId, ...p }) => p)
        .sort(byRankThenName),
    })),
  };
}

function parseName(value) {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw badRequest('MSG_TEAM_NAME_REQUIRED', 'Please enter a team name.');
  }
  if (/[\r\n\t]/.test(value ?? '')) throw badRequest('MSG_TEAM_NAME_LENGTH', 'The team name must be on one line.');
  const name = (value ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw badRequest('MSG_TEAM_NAME_REQUIRED', 'Please enter a team name.');
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw badRequest('MSG_TEAM_NAME_LENGTH', `A team name has ${NAME_MIN}–${NAME_MAX} characters.`, {
      min: NAME_MIN,
      max: NAME_MAX,
    });
  }
  return name;
}

function parseMemberIds(value, userId) {
  if (!Array.isArray(value)) throw badRequest('MSG_TEAM_TOO_FEW', 'Please choose the team members.', { min: MIN_OTHERS });
  const ids = value.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw badRequest('MSG_TEAM_MEMBER_NOT_ELIGIBLE', 'Some people cannot join this team.');
  }
  if (new Set(ids).size !== ids.length) throw badRequest('MSG_GROUP_MEMBER_DUPLICATE', 'A person is listed twice.');
  if (ids.includes(userId)) {
    throw badRequest('MSG_TEAM_MEMBER_NOT_ELIGIBLE', 'You are added to your team automatically.', { userIds: [userId] });
  }
  if (ids.length < MIN_OTHERS) {
    throw badRequest('MSG_TEAM_TOO_FEW', `Please choose at least ${MIN_OTHERS} other people.`, { min: MIN_OTHERS });
  }
  if (ids.length + 1 > MAX_MEMBERS) {
    throw badRequest('MSG_TEAM_TOO_MANY', `A team has at most ${MAX_MEMBERS} members.`, { max: MAX_MEMBERS });
  }
  return ids;
}

// UC-35 Create Team Chat. The creator is always a member; the others must be people of the same class (teachers,
// students, parents) with an active account. input.source 'TEACHER_SCHOOL': a teacher team, see teacherTeamOptions.
export async function createTeam(user, input) {
  const kinds = kindsFor(user);
  const teamName = parseName(input.teamName);
  if (input.source === 'TEACHER_SCHOOL') {
    const memberIds = parseMemberIds(input.memberIds, user.userId);
    return withTransaction(async (client) => {
      const options = await teacherTeamOptions(client, user);
      if (!options) throw forbidden('MSG_TEAM_SCHOOL_NOT_ALLOWED', 'Only a teacher of the teacher group can do this.');
      const eligible = new Set(options.people.filter((p) => p.status === 'ACTIVE').map((p) => p.userId));
      const wrong = memberIds.filter((id) => !eligible.has(id));
      if (wrong.length) {
        throw badRequest('MSG_TEAM_MEMBER_NOT_ELIGIBLE', 'Some people cannot join this team.', { userIds: wrong });
      }
      return insertTeam(client, user, null, teamName, memberIds);
    });
  }
  const classId = Number(input.classId);
  if (!Number.isSafeInteger(classId) || classId <= 0) {
    throw badRequest('MSG_TEAM_CLASS_NOT_ALLOWED', 'Please choose one of your classes.');
  }
  const memberIds = parseMemberIds(input.memberIds, user.userId);

  return withTransaction(async (client) => {
    // Lock the class row so its teams and people are read consistently.
    const { rows: cls } = await client.query(
      `SELECT CURRENT_DATE > sy.end_date AS "ended"
       FROM classes c JOIN school_years sy ON sy.school_year_id = c.school_year_id
       WHERE c.class_id = $1 AND c.deleted_at IS NULL
       FOR SHARE OF c`,
      [classId],
    );
    const allowed = cls.length ? await teamClasses(client, user, kinds, classId) : [];
    if (!allowed.length) {
      if (cls[0]?.ended) throw conflict('MSG_SCHOOL_YEAR_ENDED', 'An ended school year cannot be changed.');
      throw forbidden('MSG_TEAM_CLASS_NOT_ALLOWED', 'You can only create a team in one of your classes.');
    }
    const eligible = new Set(
      (await classPeople(client, user, [classId])).filter((p) => p.status === 'ACTIVE').map((p) => p.userId),
    );
    const wrong = memberIds.filter((id) => !eligible.has(id));
    if (wrong.length) {
      throw badRequest('MSG_TEAM_MEMBER_NOT_ELIGIBLE', 'Some people cannot join this team.', { userIds: wrong });
    }
    return insertTeam(client, user, classId, teamName, memberIds);
  });
}

// A team the user is in, locked for a change (FOR UPDATE), with its leader. Class groups → 403; an ended year → 409.
async function openTeam(client, user, groupId) {
  const group = await findGroupForUser(client, user, groupId);
  if (group.groupType !== 'TEAM_CHAT') {
    throw forbidden('MSG_GROUP_CANNOT_LEAVE', 'Class groups cannot be changed this way; only teams can.');
  }
  if (group.readOnly) throw conflict('MSG_GROUP_READ_ONLY', 'The school year has ended; the group is read only.');
  const { rows } = await client.query(
    `SELECT leader_id AS "leaderId", group_name AS "groupName" FROM groups WHERE group_id = $1 FOR UPDATE`,
    [group.groupId],
  );
  const { rows: members } = await client.query(
    `SELECT user_id AS "userId" FROM group_members WHERE group_id = $1 AND left_at IS NULL`,
    [group.groupId],
  );
  const memberIds = members.map((m) => m.userId);
  if (!memberIds.includes(user.userId)) throw forbidden('MSG_GROUP_MEMBER_NOT_FOUND', 'You are not in this team.');
  return { ...group, ...rows[0], memberIds };
}

// The new leader must be another member still in the team (a locked account may be chosen: business-rules §4, Q4).
function checkNewLeader(team, user, value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0 || id === user.userId || !team.memberIds.includes(id)) {
    throw badRequest('MSG_TEAM_LEADER_INVALID', 'Please choose another member of the team.');
  }
  return id;
}

async function handOver(client, team, fromId, toId) {
  await client.query('UPDATE groups SET leader_id = $2 WHERE group_id = $1', [team.groupId, toId]);
  return insertSystemLine(client, { groupId: team.groupId, actorId: fromId, event: EVENTS.LEADER, targetUserId: toId });
}

/**
 * Leave a team (UC-35, business-rules §4 "Teams in detail"; leader rules agreed by the lead 15/11/2026). Only teams can
 * be left; the three class groups cannot (membership follows the class, UC-33 removes people). Not possible once the
 * school year has ended (read only).
 * - The leader leaving while others remain must name the new leader (newLeaderId): without it 409
 *   MSG_TEAM_LEADER_MUST_TRANSFER, someone not in the team 400 MSG_TEAM_LEADER_INVALID. The hand-over and the leaving
 *   are one transaction ("A đã chuyển quyền trưởng nhóm cho B", then "A đã rời nhóm").
 * - The last member leaving closes the team (soft delete); no line then, nobody is left to read it.
 * Sets left_at like UC-33, so the row stays for chat history.
 */
export async function leaveTeam(user, groupId, { newLeaderId } = {}) {
  const result = await withTransaction(async (client) => {
    const team = await openTeam(client, user, groupId);
    const others = team.memberIds.filter((id) => id !== user.userId);
    const messageIds = [];
    if (team.leaderId === user.userId && others.length) {
      if (newLeaderId === undefined || newLeaderId === null) {
        throw conflict('MSG_TEAM_LEADER_MUST_TRANSFER', 'Choose the new team leader before leaving.');
      }
      messageIds.push(await handOver(client, team, user.userId, checkNewLeader(team, user, newLeaderId)));
    }
    await client.query('UPDATE group_members SET left_at = NOW() WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL', [
      team.groupId,
      user.userId,
    ]);
    if (!others.length) {
      await client.query('UPDATE groups SET deleted_at = NOW() WHERE group_id = $1', [team.groupId]);
      return { groupId: team.groupId, teamClosed: true, messageIds };
    }
    messageIds.push(await insertSystemLine(client, { groupId: team.groupId, actorId: user.userId, event: EVENTS.LEFT }));
    return { groupId: team.groupId, teamClosed: false, messageIds };
  });
  publish({
    lines: [{ groupId: result.groupId, messageIds: result.messageIds }],
    changed: result.teamClosed ? [] : [{ groupId: result.groupId, change: 'member-left' }],
    removed: [{ groupId: result.groupId, userId: user.userId }],
    closed: result.teamClosed ? [result.groupId] : [],
  });
  return { groupId: result.groupId, teamClosed: result.teamClosed };
}

/** Hand the leadership over without leaving (business-rules §4, 15/11/2026): the leader only (403 otherwise). */
export async function transferLeader(user, groupId, newLeaderId) {
  const result = await withTransaction(async (client) => {
    const team = await openTeam(client, user, groupId);
    if (team.leaderId !== user.userId) throw forbidden('MSG_TEAM_NOT_LEADER', 'Only the team leader can do this.');
    const to = checkNewLeader(team, user, newLeaderId);
    return { groupId: team.groupId, leaderId: to, messageIds: [await handOver(client, team, user.userId, to)] };
  });
  publish({
    lines: [{ groupId: result.groupId, messageIds: result.messageIds }],
    changed: [{ groupId: result.groupId, change: 'leader' }],
  });
  return { groupId: result.groupId, leaderId: result.leaderId };
}

/** Rename a team (business-rules §4, 15/11/2026): any member, same name rules as UC-35. The same name → nothing written. */
export async function renameTeam(user, groupId, value) {
  const name = parseName(value);
  const result = await withTransaction(async (client) => {
    const team = await openTeam(client, user, groupId);
    if (team.groupName === name) return { groupId: team.groupId, groupName: name, messageIds: [] };
    await client.query('UPDATE groups SET group_name = $2 WHERE group_id = $1', [team.groupId, name]);
    const messageId = await insertSystemLine(client, {
      groupId: team.groupId,
      actorId: user.userId,
      event: EVENTS.RENAMED,
      content: name,
    });
    return { groupId: team.groupId, groupName: name, messageIds: [messageId] };
  });
  if (result.messageIds.length) {
    publish({
      lines: [{ groupId: result.groupId, messageIds: result.messageIds }],
      changed: [{ groupId: result.groupId, change: 'renamed' }],
    });
  }
  return { groupId: result.groupId, groupName: result.groupName };
}
