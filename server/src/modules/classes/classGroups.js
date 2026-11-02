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

// Everyone a class explains, with why (same rules as the seed). `classId` is a SQL placeholder such as '$1'.
//   HOMEROOM = the homeroom teacher, TEACHER = a subject teacher (teaching_assignments),
//   STUDENT = a studying student, PARENT = a parent of a studying student.
export const classPeopleSql = (classId) => `
  SELECT t.user_id, 'HOMEROOM' AS kind
  FROM classes c JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
  WHERE c.class_id = ${classId}
  UNION
  SELECT t.user_id, 'TEACHER'
  FROM teaching_assignments ta JOIN teachers t ON t.teacher_id = ta.teacher_id
  WHERE ta.class_id = ${classId} AND ta.deleted_at IS NULL
  UNION
  SELECT s.user_id, 'STUDENT'
  FROM class_enrollments e JOIN students s ON s.student_id = e.student_id
  WHERE e.class_id = ${classId} AND e.status = 'STUDYING'
  UNION
  SELECT p.user_id, 'PARENT'
  FROM class_enrollments e
  JOIN student_parents sp ON sp.student_id = e.student_id
  JOIN parents p ON p.parent_id = sp.parent_id
  WHERE e.class_id = ${classId} AND e.status = 'STUDYING'`;

// Who belongs in which group – join condition on the group alias `g` and the person alias `p`:
//   GENERAL = homeroom teacher + subject teachers + studying students + their parents (feed + chat)
//   STUDENT = homeroom teacher + studying students (chat)
//   PARENT  = homeroom teacher + parents of studying students (chat)
export const GROUP_RULE_SQL = `(
  g.group_type = 'GENERAL'
  OR (g.group_type = 'STUDENT' AND p.kind IN ('HOMEROOM', 'STUDENT'))
  OR (g.group_type = 'PARENT' AND p.kind IN ('HOMEROOM', 'PARENT')))`;

// Adds everyone who belongs in the class groups and has never been in that group. Someone who left a group
// (removed by UC-33, or transferred: left_at set) is not brought back here – only by UC-32 Add Group Member.
// Returns [{ groupId, userId }] of the new memberships.
export async function addClassGroupMembers(client, classId) {
  const { rows } = await client.query(
    `WITH g AS (
       SELECT group_id, group_type FROM groups
       WHERE class_id = $1 AND deleted_at IS NULL AND group_type IN ('GENERAL', 'STUDENT', 'PARENT')
     ),
     people AS (${classPeopleSql('$1')}),
     wanted AS (
       SELECT DISTINCT g.group_id, p.user_id
       FROM g JOIN people p ON ${GROUP_RULE_SQL}
     )
     INSERT INTO group_members (group_id, user_id)
     SELECT w.group_id, w.user_id FROM wanted w
     WHERE NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = w.group_id AND m.user_id = w.user_id)
     RETURNING group_id AS "groupId", user_id AS "userId"`,
    [classId],
  );
  return rows;
}

const CLASS_GROUP_TYPES = ['GENERAL', 'STUDENT', 'PARENT'];

// UC-19 Assign Homeroom Teacher (FE-03) calls this for each changed class, inside its transaction and after
// classes.homeroom_teacher_id is updated (agreed 02/11, business-rules §4):
//   * the moderator of the class groups is always the current homeroom teacher, read from classes – nothing to move;
//   * the new homeroom teacher becomes an active member of the three class groups (added, or brought back when they
//     left before) and so sees the whole feed and chat history and the posts waiting for approval;
//   * the previous homeroom teacher leaves the three class groups (left_at, rows kept), even if they still teach a
//     subject in the class – the homeroom teacher or the School Manager can add them back (UC-32); they also leave the
//     class's teams unless they still teach the class.
// Classes of an ended school year are read only and are skipped. previousTeacherId / the current homeroom are
// teachers.teacher_id values (null = none). Returns { added, left } as [{ groupId, userId }].
export async function syncHomeroomChange(client, { classId, previousTeacherId }) {
  const { rows } = await client.query(
    `SELECT CURRENT_DATE > sy.end_date AS "ended",
            (SELECT user_id FROM teachers WHERE teacher_id = c.homeroom_teacher_id) AS "currentUserId",
            (SELECT user_id FROM teachers WHERE teacher_id = $2) AS "previousUserId"
     FROM classes c JOIN school_years sy ON sy.school_year_id = c.school_year_id
     WHERE c.class_id = $1 AND c.deleted_at IS NULL`,
    [classId, previousTeacherId ?? null],
  );
  const cls = rows[0];
  if (!cls || cls.ended || cls.currentUserId === cls.previousUserId) return { added: [], left: [] };

  let left = [];
  if (cls.previousUserId) {
    ({ rows: left } = await client.query(
      `UPDATE group_members m SET left_at = NOW()
       FROM groups g
       WHERE m.group_id = g.group_id AND g.class_id = $1 AND g.deleted_at IS NULL
         AND m.user_id = $2 AND m.left_at IS NULL
         AND (g.group_type = ANY($3::text[])
              OR (g.group_type = 'TEAM_CHAT' AND NOT EXISTS (
                    SELECT 1 FROM (${classPeopleSql('$1')}) p WHERE p.user_id = $2)))
       RETURNING m.group_id AS "groupId", m.user_id AS "userId"`,
      [classId, cls.previousUserId, CLASS_GROUP_TYPES],
    ));
  }

  let added = [];
  if (cls.currentUserId) {
    const { rows: back } = await client.query(
      `UPDATE group_members m SET left_at = NULL
       FROM groups g
       WHERE m.group_id = g.group_id AND g.class_id = $1 AND g.deleted_at IS NULL AND g.group_type = ANY($3::text[])
         AND m.user_id = $2 AND m.left_at IS NOT NULL
       RETURNING m.group_id AS "groupId", m.user_id AS "userId"`,
      [classId, cls.currentUserId, CLASS_GROUP_TYPES],
    );
    const { rows: fresh } = await client.query(
      `INSERT INTO group_members (group_id, user_id)
       SELECT g.group_id, $2 FROM groups g
       WHERE g.class_id = $1 AND g.deleted_at IS NULL AND g.group_type = ANY($3::text[])
         AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.group_id AND m.user_id = $2)
       RETURNING group_id AS "groupId", user_id AS "userId"`,
      [classId, cls.currentUserId, CLASS_GROUP_TYPES],
    );
    added = [...back, ...fresh];
  }
  return { added, left };
}
