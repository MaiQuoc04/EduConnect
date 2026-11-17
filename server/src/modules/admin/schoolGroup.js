// Business rules §4: one TEACHER_SCHOOL group ("Giáo viên toàn trường", feed + chat) for the whole school, with every
// teacher and School Manager. FE-13 adds new Teacher / School Manager accounts to it when they are created (UC-95) or
// imported (UC-96), in the same transaction. The group itself is created and managed by the School Manager (FE-05);
// if it does not exist yet nothing is added. Owner: Linh (FE-13), 17/11/2026.

export const SCHOOL_GROUP_ROLES = ['TEACHER', 'SCHOOL_MANAGER'];

export const needsSchoolGroup = (roles) => roles.some((role) => SCHOOL_GROUP_ROLES.includes(role));

// Adds the users to every active TEACHER_SCHOOL group they are not an active member of. `client` must be a transaction
// client. New accounts were never members, so a plain row is added (no left row to restore). Returns the rows added.
export async function joinSchoolGroup(client, userIds) {
  if (!userIds.length) return 0;
  const { rowCount } = await client.query(
    `INSERT INTO group_members (group_id, user_id)
     SELECT g.group_id, u.user_id
     FROM groups g CROSS JOIN unnest($1::bigint[]) AS u(user_id)
     WHERE g.group_type = 'TEACHER_SCHOOL' AND g.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM group_members m
                       WHERE m.group_id = g.group_id AND m.user_id = u.user_id AND m.left_at IS NULL)`,
    [userIds],
  );
  return rowCount;
}
