import { notFound } from '../../utils/AppError.js';

// FE-04 shared group access (owner: Khanh). Who may open which group, by the active role (permissions.md notes 3, 4).
// Meant to be reused by FE-05 Group Feed and FE-06 Messaging before they read or write a group's content:
//   const group = await findGroupForUser(pool, req.user, req.params.groupId);
//   if (!group.canSeeContent) throw forbidden();
// Covers the class groups (GENERAL / STUDENT / PARENT) and the school-wide TEACHER_SCHOOL group; teams and
// 1-1 chats (TEAM_CHAT / DIRECT) are not handled here.

export const VISIBLE_TYPES = ['GENERAL', 'STUDENT', 'PARENT', 'TEACHER_SCHOOL'];

// SQL condition on the group alias `g`: true when the user ($user) acting as $role may see the group.
// School Manager: every class group (lists and members only) and the teacher group. Others: groups they are an
// active member of (left_at IS NULL), limited to what the active role explains (same model as classGroups.js:
// subject teachers are in GENERAL only, the homeroom teacher in all three), so a teacher who is also a parent sees
// only their teaching groups while acting as a teacher.
export function groupScopeSql(user, role) {
  return `(
    g.deleted_at IS NULL
    AND g.group_type IN ('GENERAL', 'STUDENT', 'PARENT', 'TEACHER_SCHOOL')
    AND (g.class_id IS NULL OR EXISTS (SELECT 1 FROM classes sc WHERE sc.class_id = g.class_id AND sc.deleted_at IS NULL))
    AND (
      (${role} = 'SCHOOL_MANAGER')
      OR (
        EXISTS (SELECT 1 FROM group_members sm
                WHERE sm.group_id = g.group_id AND sm.user_id = ${user} AND sm.left_at IS NULL)
        AND (
          (${role} = 'TEACHER' AND (
             g.group_type = 'TEACHER_SCHOOL'
             OR EXISTS (SELECT 1 FROM classes sc JOIN teachers st ON st.teacher_id = sc.homeroom_teacher_id
                        WHERE sc.class_id = g.class_id AND st.user_id = ${user})
             OR (g.group_type = 'GENERAL' AND EXISTS (
                   SELECT 1 FROM teaching_assignments sa JOIN teachers st ON st.teacher_id = sa.teacher_id
                   WHERE sa.class_id = g.class_id AND sa.deleted_at IS NULL AND st.user_id = ${user}))))
          OR (${role} = 'STUDENT' AND g.group_type IN ('GENERAL', 'STUDENT') AND EXISTS (
                SELECT 1 FROM class_enrollments se JOIN students ss ON ss.student_id = se.student_id
                WHERE se.class_id = g.class_id AND ss.user_id = ${user}))
          OR (${role} = 'PARENT' AND g.group_type IN ('GENERAL', 'PARENT') AND EXISTS (
                SELECT 1 FROM class_enrollments se
                JOIN student_parents sp ON sp.student_id = se.student_id
                JOIN parents sx ON sx.parent_id = sp.parent_id
                WHERE se.class_id = g.class_id AND sx.user_id = ${user}))
        )
      )
    )
  )`;
}

// The group if the user may see it, with what they may do; otherwise 404 (the group's existence is not revealed).
//   readOnly         – the class belongs to an ended school year (business-rules §4: last year's groups are read only)
//   canSeeContent    – feed / chat; false for the School Manager in class groups (business-rules §2)
//   canManageMembers – UC-32, UC-33: School Manager or the class's homeroom teacher, class groups of an open year only
//   canSetNickname   – UC-34: the class's homeroom teacher only, open year
export async function findGroupForUser(db, user, groupId) {
  const id = Number(groupId);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound('MSG_GROUP_NOT_FOUND', 'Group not found.');
  const { rows } = await db.query(
    `SELECT g.group_id AS "groupId", g.group_name AS "groupName", g.group_type AS "groupType",
            g.require_approval AS "requireApproval", g.created_at AS "createdAt", g.class_id AS "classId",
            COALESCE(CURRENT_DATE > sy.end_date, FALSE) AS "readOnly",
            COALESCE(ht.user_id = $2, FALSE) AS "isHomeroom"
     FROM groups g
     LEFT JOIN classes c ON c.class_id = g.class_id
     LEFT JOIN school_years sy ON sy.school_year_id = c.school_year_id
     LEFT JOIN teachers ht ON ht.teacher_id = c.homeroom_teacher_id
     WHERE g.group_id = $1 AND ${groupScopeSql('$2', '$3')}`,
    [id, user.userId, user.activeRole],
  );
  if (!rows.length) throw notFound('MSG_GROUP_NOT_FOUND', 'Group not found.');
  const group = rows[0];
  const isClassGroup = group.classId !== null;
  const manager = user.activeRole === 'SCHOOL_MANAGER';
  return {
    ...group,
    canSeeContent: !(manager && isClassGroup),
    canManageMembers:
      isClassGroup && !group.readOnly && (manager || (user.activeRole === 'TEACHER' && group.isHomeroom)),
    canSetNickname: isClassGroup && !group.readOnly && user.activeRole === 'TEACHER' && group.isHomeroom,
  };
}
