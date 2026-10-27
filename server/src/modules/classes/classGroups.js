// FE-04 shared class-group logic (owner: Khanh). Used by UC-27 Import Class List and UC-28 Create Class Group, and
// meant to be called by other features after they change who belongs to a class: UC-19 homeroom teacher and UC-18
// teaching assignments (FE-03), UC-10 transfer / UC-11 promotion and parent links (FE-02).
// Every function takes a transaction client so it runs inside the caller's withTransaction.

// The three groups of a class (business-rules §4), named as in the seed: "10A1", "10A1 – Học sinh", "10A1 – Phụ huynh".
const CLASS_GROUPS = [
  { type: 'GENERAL', suffix: '' },
  { type: 'STUDENT', suffix: ' – Học sinh' },
  { type: 'PARENT', suffix: ' – Phụ huynh' },
];

// Creates whichever of the three groups the class does not have yet. Returns the number created.
export async function ensureClassGroups(client, { classId, className, createdBy }) {
  const { rowCount } = await client.query(
    `INSERT INTO groups (class_id, group_name, group_type, created_by)
     SELECT $1, $2 || x.suffix, x.type, $3
     FROM unnest($4::text[], $5::text[]) AS x(type, suffix)
     WHERE NOT EXISTS (SELECT 1 FROM groups g
                       WHERE g.class_id = $1 AND g.group_type = x.type AND g.deleted_at IS NULL)`,
    [classId, className, createdBy, CLASS_GROUPS.map((g) => g.type), CLASS_GROUPS.map((g) => g.suffix)],
  );
  return rowCount;
}

// Adds everyone who belongs in the class groups and is not an active member yet (same rules as the seed):
//   GENERAL = homeroom teacher + subject teachers + studying students + their parents (feed + chat)
//   STUDENT = homeroom teacher + studying students (chat)
//   PARENT  = homeroom teacher + parents of studying students (chat)
// Only adds: people who left are removed by the use case that removes them (left_at, business-rules §6).
// Returns [{ groupId, userId }] of the new memberships.
export async function addClassGroupMembers(client, classId) {
  const { rows } = await client.query(
    `WITH g AS (
       SELECT group_id, group_type FROM groups
       WHERE class_id = $1 AND deleted_at IS NULL AND group_type IN ('GENERAL', 'STUDENT', 'PARENT')
     ),
     people AS (
       SELECT t.user_id, 'HOMEROOM' AS kind
       FROM classes c JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
       WHERE c.class_id = $1
       UNION
       SELECT t.user_id, 'TEACHER'
       FROM teaching_assignments ta JOIN teachers t ON t.teacher_id = ta.teacher_id
       WHERE ta.class_id = $1 AND ta.deleted_at IS NULL
       UNION
       SELECT s.user_id, 'STUDENT'
       FROM class_enrollments e JOIN students s ON s.student_id = e.student_id
       WHERE e.class_id = $1 AND e.status = 'STUDYING'
       UNION
       SELECT p.user_id, 'PARENT'
       FROM class_enrollments e
       JOIN student_parents sp ON sp.student_id = e.student_id
       JOIN parents p ON p.parent_id = sp.parent_id
       WHERE e.class_id = $1 AND e.status = 'STUDYING'
     ),
     wanted AS (
       SELECT DISTINCT g.group_id, p.user_id
       FROM g JOIN people p
         ON g.group_type = 'GENERAL'
         OR (g.group_type = 'STUDENT' AND p.kind IN ('HOMEROOM', 'STUDENT'))
         OR (g.group_type = 'PARENT' AND p.kind IN ('HOMEROOM', 'PARENT'))
     )
     INSERT INTO group_members (group_id, user_id)
     SELECT w.group_id, w.user_id FROM wanted w
     WHERE NOT EXISTS (SELECT 1 FROM group_members m
                       WHERE m.group_id = w.group_id AND m.user_id = w.user_id AND m.left_at IS NULL)
     RETURNING group_id AS "groupId", user_id AS "userId"`,
    [classId],
  );
  return rows;
}
