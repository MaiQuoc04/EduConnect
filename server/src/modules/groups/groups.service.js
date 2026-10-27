import { pool } from '../../config/db.js';
import { notFound } from '../../utils/AppError.js';
import { findGroupForUser, groupScopeSql } from './groupAccess.js';

// FE-04 Class & Group Management – groups (owner: Khanh). UC-29 View Group List (SCR-22 / "Nhóm của tôi"),
// UC-30 View Group Detail (SCR-23 header), UC-31 View Group Members (SCR-24). Read only.

const GROUP_ORDER = `CASE g.group_type WHEN 'GENERAL' THEN 1 WHEN 'STUDENT' THEN 2 WHEN 'PARENT' THEN 3 ELSE 4 END`;
const MEMBER_COUNT = `(SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.group_id AND m.left_at IS NULL)`;
// Teams of a class (UC-35) as JSON; `g` = the team, `tc` = its creator.
const TEAM_JSON = `json_build_object('groupId', g.group_id, 'groupName', g.group_name, 'groupType', g.group_type,
                                    'memberCount', ${MEMBER_COUNT}, 'createdByName', tc.full_name)`;
const YEAR_COLUMNS = `sy.school_year_id AS "schoolYearId", sy.year_name AS "yearName", CURRENT_DATE > sy.end_date AS "ended"`;

// Contact details (email, phone) and student codes are for teachers and the School Manager only (permissions note 2).
const seesContacts = (user) => ['TEACHER', 'SCHOOL_MANAGER'].includes(user.activeRole);

// The school years in which the user has a visible class group, newest first (School Manager: every year).
async function visibleYears(user) {
  const manager = user.activeRole === 'SCHOOL_MANAGER';
  const { rows } = await pool.query(
    manager
      ? `SELECT ${YEAR_COLUMNS}, sy.start_date <= CURRENT_DATE AS "started" FROM school_years sy ORDER BY sy.start_date DESC`
      : `SELECT DISTINCT ${YEAR_COLUMNS}, sy.start_date <= CURRENT_DATE AS "started", sy.start_date
         FROM groups g
         JOIN classes c ON c.class_id = g.class_id
         JOIN school_years sy ON sy.school_year_id = c.school_year_id
         WHERE ${groupScopeSql('$1', '$2')}
         ORDER BY sy.start_date DESC`,
    manager ? [] : [user.userId, user.activeRole],
  );
  return rows.map(({ schoolYearId, yearName, ended, started }) => ({ schoolYearId, yearName, ended, started }));
}

// UC-29 View Group List. The groups (and teams, UC-35) the user can see in one school year, grouped by class (a parent with two
// children in two classes gets two cards), plus the school-wide teacher group when visible. Default year: the
// current one (started, newest), else the newest the user has groups in.
export async function listMyGroups(user, { schoolYearId }) {
  const years = await visibleYears(user);
  let schoolYear;
  if (schoolYearId !== undefined && schoolYearId !== '') {
    schoolYear = years.find((y) => String(y.schoolYearId) === String(schoolYearId));
    if (!schoolYear) throw notFound('NOT_FOUND', 'School year not found.');
  } else {
    schoolYear = years.find((y) => y.started) ?? years[years.length - 1] ?? null;
  }

  const params = [user.userId, user.activeRole];
  const { rows: teacherGroups } = await pool.query(
    `SELECT g.group_id AS "groupId", g.group_name AS "groupName", g.group_type AS "groupType",
            ${MEMBER_COUNT} AS "memberCount"
     FROM groups g
     WHERE g.group_type = 'TEACHER_SCHOOL' AND ${groupScopeSql('$1', '$2')}
     ORDER BY g.group_id
     LIMIT 1`,
    params,
  );

  let classes = [];
  if (schoolYear) {
    const { rows } = await pool.query(
      `SELECT c.class_id AS "classId", c.class_name AS "className", gl.grade_level_name AS "gradeLevel",
              u.full_name AS "homeroomName", u.status AS "homeroomStatus",
              COALESCE(json_agg(json_build_object('groupId', g.group_id, 'groupName', g.group_name,
                                                  'groupType', g.group_type, 'memberCount', ${MEMBER_COUNT})
                                ORDER BY ${GROUP_ORDER}) FILTER (WHERE g.group_type <> 'TEAM_CHAT'), '[]') AS "groups",
              COALESCE(json_agg(${TEAM_JSON} ORDER BY g.created_at, g.group_id)
                         FILTER (WHERE g.group_type = 'TEAM_CHAT'), '[]') AS "teams"
       FROM groups g
       LEFT JOIN users tc ON tc.user_id = g.created_by
       JOIN classes c ON c.class_id = g.class_id
       JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
       LEFT JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
       LEFT JOIN users u ON u.user_id = t.user_id
       WHERE c.school_year_id = $3 AND ${groupScopeSql('$1', '$2')}
       GROUP BY c.class_id, gl.grade_level_name, u.full_name, u.status
       ORDER BY gl.grade_level_name, c.class_name`,
      [...params, schoolYear.schoolYearId],
    );
    classes = rows;
  }

  const strip = (y) => y && { schoolYearId: y.schoolYearId, yearName: y.yearName, ended: y.ended };
  return {
    schoolYears: years.map(strip),
    schoolYear: strip(schoolYear),
    teacherGroup: teacherGroups[0] ?? null,
    classes,
  };
}

// Active members of a group with what makes them members. group_members has no role column, so the reason is
// worked out from the class: homeroom teacher, subject teacher (teaching_assignments), studying student, parent of a
// studying student; in the teacher group: School Manager or teacher.
export async function memberRows(db, groupId) {
  const { rows } = await db.query(
    `SELECT u.user_id AS "userId", u.full_name AS "fullName", u.avatar_url AS "avatarUrl", u.status,
            u.email, u.phone, m.joined_at AS "joinedAt", g.class_id AS "classId",
            st.student_code AS "studentCode", e.nickname, e.enrollment_id IS NOT NULL AS "isStudent",
            COALESCE(t.teacher_id = c.homeroom_teacher_id, FALSE) AS "isHomeroom",
            t.teacher_id IS NOT NULL AS "isTeacher",
            EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
                    WHERE ur.user_id = u.user_id AND r.role_code = 'SCHOOL_MANAGER') AS "isManager",
            COALESCE((SELECT array_agg(DISTINCT s.subject_name ORDER BY s.subject_name)
                      FROM teaching_assignments ta JOIN subjects s ON s.subject_id = ta.subject_id
                      WHERE ta.class_id = g.class_id AND ta.teacher_id = t.teacher_id AND ta.deleted_at IS NULL),
                     '{}') AS "subjects",
            COALESCE((SELECT json_agg(json_build_object('fullName', cu.full_name,
                                                        'relationship', sp.relationship_type)
                                      ORDER BY cu.full_name)
                      FROM parents p
                      JOIN student_parents sp ON sp.parent_id = p.parent_id
                      JOIN class_enrollments ce ON ce.student_id = sp.student_id
                                               AND ce.class_id = g.class_id AND ce.status = 'STUDYING'
                      JOIN students cs ON cs.student_id = sp.student_id
                      JOIN users cu ON cu.user_id = cs.user_id
                      WHERE p.user_id = u.user_id), '[]'::json) AS "children"
     FROM group_members m
     JOIN groups g ON g.group_id = m.group_id
     JOIN users u ON u.user_id = m.user_id
     LEFT JOIN classes c ON c.class_id = g.class_id
     LEFT JOIN teachers t ON t.user_id = u.user_id
     LEFT JOIN students st ON st.user_id = u.user_id
     LEFT JOIN class_enrollments e ON e.student_id = st.student_id AND e.class_id = g.class_id
                                  AND e.status = 'STUDYING'
     WHERE m.group_id = $1 AND m.left_at IS NULL`,
    [groupId],
  );
  return rows.map((r) => {
    const kinds = [];
    if (r.classId === null) {
      if (r.isManager) kinds.push('MANAGER');
      if (r.isTeacher) kinds.push('TEACHER');
    } else {
      if (r.isHomeroom) kinds.push('HOMEROOM');
      if (r.subjects.length) kinds.push('SUBJECT_TEACHER');
      if (r.isStudent) kinds.push('STUDENT');
      if (r.children.length) kinds.push('PARENT');
      // Still a member but no longer explained by the class (e.g. assignment ended, not removed yet).
      if (!kinds.length && r.isTeacher) kinds.push('TEACHER');
    }
    if (!kinds.length) kinds.push('OTHER');
    return { ...r, kinds };
  });
}

const RANK = { HOMEROOM: 0, MANAGER: 1, SUBJECT_TEACHER: 2, TEACHER: 2, STUDENT: 3, PARENT: 4, OTHER: 5 };
const TEACHER_KINDS = ['HOMEROOM', 'SUBJECT_TEACHER', 'TEACHER', 'MANAGER'];
// Vietnamese lists sort by given name (the last word), then by the full name.
const givenName = (name) => name.trim().split(/\s+/).pop();
export const byRankThenName = (a, b) =>
  Math.min(...a.kinds.map((k) => RANK[k])) - Math.min(...b.kinds.map((k) => RANK[k])) ||
  givenName(a.fullName).localeCompare(givenName(b.fullName), 'vi') ||
  a.fullName.localeCompare(b.fullName, 'vi');

function countKinds(members) {
  return {
    total: members.length,
    teachers: members.filter((m) => m.kinds.some((k) => TEACHER_KINDS.includes(k))).length,
    students: members.filter((m) => m.kinds.includes('STUDENT')).length,
    parents: members.filter((m) => m.kinds.includes('PARENT')).length,
  };
}

// UC-30 View Group Detail: the group, its class and school year, homeroom teacher, member counts, the user's
// rights, the class's other groups the user can open and the class's teams they are in (UC-35).
export async function getGroup(user, groupId) {
  const group = await findGroupForUser(pool, user, groupId);
  const [members, info] = await Promise.all([
    memberRows(pool, group.groupId),
    group.classId === null
      ? null
      : pool.query(
          `SELECT c.class_id AS "classId", c.class_name AS "className", gl.grade_level_name AS "gradeLevel",
                  ct.track_name AS "trackName", ${YEAR_COLUMNS},
                  u.full_name AS "homeroomName", u.status AS "homeroomStatus",
                  (SELECT COALESCE(json_agg(json_build_object('groupId', g.group_id, 'groupName', g.group_name,
                                                              'groupType', g.group_type) ORDER BY ${GROUP_ORDER}),
                                   '[]'::json)
                   FROM groups g WHERE g.class_id = c.class_id AND g.group_type <> 'TEAM_CHAT'
                     AND ${groupScopeSql('$2', '$3')}) AS "classGroups",
                  (SELECT COALESCE(json_agg(${TEAM_JSON} ORDER BY g.created_at, g.group_id), '[]'::json)
                   FROM groups g LEFT JOIN users tc ON tc.user_id = g.created_by
                   WHERE g.class_id = c.class_id AND g.group_type = 'TEAM_CHAT'
                     AND ${groupScopeSql('$2', '$3')}) AS "teams"
           FROM classes c
           JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
           JOIN class_tracks ct ON ct.track_id = c.track_id
           JOIN school_years sy ON sy.school_year_id = c.school_year_id
           LEFT JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
           LEFT JOIN users u ON u.user_id = t.user_id
           WHERE c.class_id = $1`,
          [group.classId, user.userId, user.activeRole],
        ),
  ]);
  const row = info?.rows[0];
  return {
    groupId: group.groupId,
    groupName: group.groupName,
    groupType: group.groupType,
    requireApproval: group.requireApproval,
    createdAt: group.createdAt,
    class: row
      ? { classId: row.classId, className: row.className, gradeLevel: row.gradeLevel, trackName: row.trackName }
      : null,
    schoolYear: row ? { schoolYearId: row.schoolYearId, yearName: row.yearName, ended: row.ended } : null,
    homeroom: row?.homeroomName ? { fullName: row.homeroomName, status: row.homeroomStatus } : null,
    classGroups: row?.classGroups ?? [],
    teams: row?.teams ?? [],
    createdByName: group.groupType === 'TEAM_CHAT' ? group.createdByName : null,
    counts: countKinds(members),
    readOnly: group.readOnly,
    canSeeContent: group.canSeeContent,
    canManageMembers: group.canManageMembers,
    canSetNickname: group.canSetNickname,
    canLeave: group.canLeave,
  };
}

// UC-31 View Group Members. Everyone who can open the group sees names, roles and account status; email, phone
// and student code only for teachers and the School Manager (permissions note 2).
// ASSUMPTION (chosen by Khanh 27/10, still needs lead OK): a student's nickname (UC-34) is shown to whoever can open
// the class's groups – the class's own members and the School Manager – since business-rules §4 only says "shown
// only inside that class". Never shown in the teacher group or outside the class.
export async function listMembers(user, groupId) {
  const group = await findGroupForUser(pool, user, groupId);
  const members = await memberRows(pool, group.groupId);
  const contacts = seesContacts(user);
  const list = members.sort(byRankThenName).map((m) => ({
    userId: m.userId,
    fullName: m.fullName,
    avatarUrl: m.avatarUrl,
    status: m.status,
    kinds: m.kinds,
    nickname: m.isStudent ? m.nickname : null,
    subjects: m.subjects,
    children: m.children,
    joinedAt: m.joinedAt,
    ...(contacts ? { studentCode: m.isStudent ? m.studentCode : null, email: m.email, phone: m.phone } : {}),
  }));
  return {
    groupId: group.groupId,
    groupName: group.groupName,
    groupType: group.groupType,
    readOnly: group.readOnly,
    canManageMembers: group.canManageMembers,
    canSetNickname: group.canSetNickname,
    showContacts: contacts,
    counts: countKinds(members),
    members: list,
  };
}
