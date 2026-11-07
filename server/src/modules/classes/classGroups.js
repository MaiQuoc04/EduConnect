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
//   HOMEROOM = the homeroom teacher, TEACHER = a subject teacher (a current or future teaching assignment),
//   STUDENT = a studying student, PARENT = a parent of a studying student.
export const classPeopleSql = (classId) => `
  SELECT t.user_id, 'HOMEROOM' AS kind
  FROM classes c JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
  WHERE c.class_id = ${classId}
  UNION
  SELECT t.user_id, 'TEACHER'
  FROM teaching_assignments ta JOIN teachers t ON t.teacher_id = ta.teacher_id
  WHERE ta.class_id = ${classId} AND ta.deleted_at IS NULL AND ta.end_date >= CURRENT_DATE
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

// Business-rules §4 "Class group membership follows the class": keeps the teachers of a class's groups in line with
// the class as it is now. UC-19 Assign Homeroom Teacher and UC-18 Teaching Assignment (FE-03) call it for every class
// they change, inside their transaction and after saving:   await syncClassTeachers(conn, classId);
//   * who must be where (classPeopleSql + GROUP_RULE_SQL): the homeroom teacher in the three groups, a subject teacher
//     (current or future assignment) in GENERAL, a teacher who is also a parent of a studying student in GENERAL and
//     PARENT – so the previous homeroom teacher leaves STUDENT and PARENT and keeps GENERAL while still teaching there;
//   * teachers who must be in a group and are not are added, or get their old row back (left_at cleared – they see
//     the whole history of the feed and the chat again); no duplicate rows;
//   * a teacher in a class group for no reason any more leaves it (left_at, row kept), and leaves the class's teams
//     when the class no longer explains them at all;
//   * only teachers are touched: students and parents follow transfer / promotion (FE-02), so someone removed with
//     UC-33 is not brought back; nothing happens for a class of an ended school year; calling it again changes nothing.
// The moderator needs no update: it is always read from classes.homeroom_teacher_id.
// Business-rules §4 (agreed 03/11/2026): a teacher removed with UC-33 while still assigned comes back at
// the next sync – membership follows the class; to take a teacher out, end their assignment.
// Returns { added, left } as [{ groupId, userId }].
export async function syncClassTeachers(client, classId) {
  const { rows } = await client.query(
    `SELECT CURRENT_DATE > sy.end_date AS "ended"
     FROM classes c JOIN school_years sy ON sy.school_year_id = c.school_year_id
     WHERE c.class_id = $1 AND c.deleted_at IS NULL`,
    [classId],
  );
  if (!rows.length || rows[0].ended) return { added: [], left: [] };

  const ctes = `
    g AS (SELECT group_id, group_type FROM groups
          WHERE class_id = $1 AND deleted_at IS NULL AND group_type = ANY($2::text[])),
    people AS (${classPeopleSql('$1')}),
    explained AS (SELECT DISTINCT g.group_id, p.user_id FROM g JOIN people p ON ${GROUP_RULE_SQL}),
    wanted AS (SELECT DISTINCT g.group_id, p.user_id FROM g JOIN people p ON ${GROUP_RULE_SQL}
               WHERE p.kind IN ('HOMEROOM', 'TEACHER'))`;
  const params = [classId, CLASS_GROUP_TYPES];

  const { rows: back } = await client.query(
    `WITH ${ctes}
     UPDATE group_members m SET left_at = NULL
     FROM wanted w
     WHERE m.group_id = w.group_id AND m.user_id = w.user_id AND m.left_at IS NOT NULL
       -- only their latest row, and only when no row is active (older data may hold several rows per person)
       AND m.member_id = (SELECT MAX(x.member_id) FROM group_members x WHERE x.group_id = m.group_id AND x.user_id = m.user_id)
     RETURNING m.group_id AS "groupId", m.user_id AS "userId"`,
    params,
  );
  const { rows: fresh } = await client.query(
    `WITH ${ctes}
     INSERT INTO group_members (group_id, user_id)
     SELECT w.group_id, w.user_id FROM wanted w
     WHERE NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = w.group_id AND m.user_id = w.user_id)
     RETURNING group_id AS "groupId", user_id AS "userId"`,
    params,
  );
  const { rows: leftGroups } = await client.query(
    `WITH ${ctes}
     UPDATE group_members m SET left_at = NOW()
     FROM g
     WHERE m.group_id = g.group_id AND m.left_at IS NULL
       AND EXISTS (SELECT 1 FROM teachers t WHERE t.user_id = m.user_id)
       AND NOT EXISTS (SELECT 1 FROM explained x WHERE x.group_id = m.group_id AND x.user_id = m.user_id)
     RETURNING m.group_id AS "groupId", m.user_id AS "userId"`,
    params,
  );
  const { rows: leftTeams } = await client.query(
    `UPDATE group_members m SET left_at = NOW()
     FROM groups g
     WHERE g.class_id = $1 AND g.group_type = 'TEAM_CHAT' AND g.deleted_at IS NULL
       AND m.group_id = g.group_id AND m.left_at IS NULL
       AND EXISTS (SELECT 1 FROM teachers t WHERE t.user_id = m.user_id)
       AND NOT EXISTS (SELECT 1 FROM (${classPeopleSql('$1')}) p WHERE p.user_id = m.user_id)
     RETURNING m.group_id AS "groupId", m.user_id AS "userId"`,
    [classId],
  );
  // A team nobody is left in is closed, as when its last member leaves (business-rules §4 "Teams in detail").
  if (leftTeams.length) {
    await client.query(
      `UPDATE groups SET deleted_at = NOW()
       WHERE group_id = ANY($1::bigint[]) AND deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.group_id AND left_at IS NULL)`,
      [leftTeams.map((t) => t.groupId)],
    );
  }
  return { added: [...back, ...fresh], left: [...leftGroups, ...leftTeams] };
}
