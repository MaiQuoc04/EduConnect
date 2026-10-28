// npm run seed:generate:small – writes database/educonnect_seed_small_v0.3.sql (sample data, PostgreSQL).
// Reference data (school year, subjects, class types, time slots) + 3 accounts per role (15 accounts, each with
// one role) + 2 classes. Every person is written out below; only the bcrypt salt changes between runs.
// Import once, right after the schema, into a database that has no sample data yet.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const OUT = fileURLToPath(new URL('../../database/educonnect_seed_small_v0.3.sql', import.meta.url));
const PASSWORD = 'Educonnect@2026';
const EMAIL_DOMAIN = 'educonnect.test'; // reserved TLD: never reaches a real inbox
const YEAR = { name: '2026-2027', start: '2026-09-05', end: '2027-05-31' };
const SEMESTERS = [
  { no: 1, start: '2026-09-05', end: '2027-01-16' },
  { no: 2, start: '2027-01-18', end: '2027-05-31' },
];
const JOINED_AT = '2026-09-05 07:00:00';

const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

// ---------- reference data ----------
const GRADE_LEVELS = ['10', '11', '12'];

// General education programme 2018 (CT GDPT 2018), upper secondary.
const SUBJECTS = [
  ['TOAN', 'Toán'],
  ['VAN', 'Ngữ văn'],
  ['ANH', 'Tiếng Anh'],
  ['SU', 'Lịch sử'],
  ['GDTC', 'Giáo dục thể chất'],
  ['QPAN', 'Giáo dục quốc phòng và an ninh'],
  ['HDTN', 'Hoạt động trải nghiệm, hướng nghiệp'],
  ['LY', 'Vật lí'],
  ['HOA', 'Hoá học'],
  ['SINH', 'Sinh học'],
  ['DIA', 'Địa lí'],
  ['KTPL', 'Giáo dục kinh tế và pháp luật'],
  ['TIN', 'Tin học'],
  ['CN', 'Công nghệ'],
];
const COMPULSORY = { TOAN: 3, VAN: 3, ANH: 3, SU: 2, GDTC: 2, QPAN: 1, HDTN: 3 };

// ASSUMPTION: focus subjects of a class type get weight 2.00 and one extra period (learning topics); others 1.00.
const TRACKS = [
  { name: 'Khối A', description: 'Tự nhiên – trọng tâm Toán, Vật lí, Hoá học', electives: ['LY', 'HOA', 'SINH', 'TIN'], focus: ['TOAN', 'LY', 'HOA'] },
  { name: 'Khối B', description: 'Tự nhiên – trọng tâm Toán, Hoá học, Sinh học', electives: ['HOA', 'SINH', 'LY', 'DIA'], focus: ['TOAN', 'HOA', 'SINH'] },
  { name: 'Khối C', description: 'Xã hội – trọng tâm Ngữ văn, Lịch sử, Địa lí', electives: ['DIA', 'KTPL', 'TIN', 'CN'], focus: ['VAN', 'SU', 'DIA'] },
  { name: 'Khối D', description: 'Ngôn ngữ – trọng tâm Toán, Ngữ văn, Tiếng Anh', electives: ['LY', 'DIA', 'KTPL', 'TIN'], focus: ['TOAN', 'VAN', 'ANH'] },
];
function trackSubjects(track) {
  const periods = { ...COMPULSORY };
  for (const s of track.electives) periods[s] = 2;
  for (const s of track.focus) periods[s] += 1;
  return Object.entries(periods).map(([code, p]) => ({ code, periods: p, weight: track.focus.includes(code) ? '2.00' : '1.00' }));
}

// 45-minute periods: 5 in the morning, 5 in the afternoon.
const TIME_SLOTS = [
  ['07:00', '07:45'], ['07:50', '08:35'], ['08:50', '09:35'], ['09:40', '10:25'], ['10:30', '11:15'],
  ['13:30', '14:15'], ['14:20', '15:05'], ['15:20', '16:05'], ['16:10', '16:55'], ['17:00', '17:45'],
];

// ---------- people: 3 per role ----------
// Usernames follow business rules §3 (first name + initials of family and middle names, no accents).
const user = (username, fullName, phone, { email = true, status = 'ACTIVE', mustChange = false } = {}) => ({
  username, fullName, email: email ? `${username}@${EMAIL_DOMAIN}` : null, phone, status, mustChange,
});

const admins = [
  user('huynq', 'Nguyễn Quốc Huy', '0905000001'),
  user('ductm', 'Trần Minh Đức', '0905000002'),
  user('honglt', 'Lê Thị Hồng', '0905000003'),
];

const managers = [
  user('binhnv', 'Nguyễn Văn Bình', '0905000011'), // principal
  user('haltt', 'Lê Thị Thu Hà', '0905000012'),
  user('vinhpq', 'Phạm Quang Vinh', '0905000013'),
];

// ASSUMPTION: with only 3 teachers, each one teaches several subjects so every subject of both classes has a teacher.
const teachers = [
  { user: user('lannt', 'Nguyễn Thị Lan', '0905000021'), code: 'GV001', department: 'Tổ Toán – Khoa học tự nhiên',
    subjects: ['TOAN', 'LY', 'HOA', 'SINH', 'TIN', 'CN', 'HDTN'] },
  { user: user('longhv', 'Hoàng Văn Long', '0905000022'), code: 'GV002', department: 'Tổ Ngữ văn – Khoa học xã hội',
    subjects: ['VAN', 'SU', 'DIA', 'KTPL', 'HDTN'] },
  { user: user('maitt', 'Trần Thị Mai', '0905000023'), code: 'GV003', department: 'Tổ Ngoại ngữ – Thể chất',
    subjects: ['ANH', 'GDTC', 'QPAN'] },
];
const teacher = (username) => teachers.find((t) => t.user.username === username);

// [class, grade, track, homeroom teacher]
const CLASSES = [
  { name: '10A1', grade: '10', track: TRACKS[0], homeroom: teacher('lannt') },
  { name: '11D1', grade: '11', track: TRACKS[3], homeroom: teacher('longhv') },
];

const students = [
  { user: user('baopg', 'Phạm Gia Bảo', null), code: 'HS260001', dob: '2011-03-14', gender: 'MALE', cls: CLASSES[0], nickname: 'Bin' },
  { user: user('khanglm', 'Lê Minh Khang', null, { email: false }), code: 'HS260002', dob: '2011-07-02', gender: 'MALE', cls: CLASSES[0], nickname: null },
  { user: user('tramlnb', 'Lê Ngọc Bảo Trâm', '0905000033', { mustChange: true }), code: 'HS250001', dob: '2010-11-25', gender: 'FEMALE', cls: CLASSES[1], nickname: null },
];
const student = (username) => students.find((s) => s.user.username === username);

const ADDRESS = 'phường Hải Châu, TP. Đà Nẵng';
const parents = [
  { user: user('toanpv', 'Phạm Văn Toàn', '0905000041'), occupation: 'Kỹ sư', address: `12 Lê Lợi, ${ADDRESS}`,
    children: [['baopg', 'FATHER']] },
  { user: user('hanttn', 'Trần Thị Ngọc Hân', '0905000042'), occupation: 'Kế toán', address: `45 Hùng Vương, ${ADDRESS}`,
    children: [['khanglm', 'MOTHER'], ['tramlnb', 'MOTHER']] }, // two children in two classes
  { user: user('oanhntk', 'Nguyễn Thị Kim Oanh', '0905000043', { email: false, status: 'LOCKED' }), occupation: 'Nội trợ',
    address: `12 Lê Lợi, ${ADDRESS}`, children: [['baopg', 'MOTHER']] },
];

const users = [...admins, ...managers, ...teachers.map((t) => t.user), ...students.map((s) => s.user), ...parents.map((p) => p.user)];
for (const u of users) {
  if (PASSWORD.toLowerCase().includes(u.username) || (u.phone && PASSWORD.includes(u.phone))) {
    throw new Error(`Password must not contain username/phone of ${u.username}`);
  }
}

// Teaching assignments: HDTN goes to the homeroom teacher, every other subject to the teacher who teaches it.
const assignments = CLASSES.flatMap((c) =>
  trackSubjects(c.track).map(({ code }) => {
    const t = code === 'HDTN' ? c.homeroom : teachers.find((x) => x.subjects.includes(code));
    if (!t) throw new Error(`No teacher for ${code} in ${c.name}`);
    return { cls: c, subject: code, teacher: t };
  }),
);

// ---------- SQL ----------
const hash = bcrypt.hashSync(PASSWORD, 10);
const L = [];
const values = (rows) => rows.map((r) => `  (${r.map(q).join(', ')})`).join(',\n');
const usernamesOf = (list) => list.map((u) => q(u.username)).join(', ');
// PostgreSQL has no session variables: rows created earlier are found again by their unique names.
const SY = `(SELECT school_year_id FROM school_years WHERE year_name = ${q(YEAR.name)})`;
const classId = (c) => `(SELECT class_id FROM classes WHERE class_name = ${q(c.name)} AND school_year_id = ${SY})`;
const pad = (s) => s.padEnd(9);

L.push(`-- EduConnect SMALL seed data v0.3 (PostgreSQL) – generated by server/scripts/generate-seed-small.js
-- (do not edit by hand; edit the script). 3 accounts per role, 2 classes.
-- Import once into a database created from educonnect_schema_v0.3.sql (Supabase > SQL Editor > paste > Run).
-- Import only into a database without sample data: it creates the school year, subjects, classes… again.
-- Everything runs in one transaction: if it fails half-way nothing is saved.
--
-- Every account uses the password: ${PASSWORD}
-- Sign in with the username, email or phone. Emails use @${EMAIL_DOMAIN} (not real inboxes).
--
-- SYSTEM_ADMIN    ${admins.map((u) => pad(u.username)).join(' ')}
-- SCHOOL_MANAGER  ${managers.map((u) => pad(u.username)).join(' ')} (${managers[0].username} = principal)
-- TEACHER         ${pad('lannt')} homeroom 10A1 – Toán, KHTN, Tin, Công nghệ
--                 ${pad('longhv')} homeroom 11D1 – Ngữ văn, Sử, Địa, KTPL
--                 ${pad('maitt')} no homeroom – Tiếng Anh, GDTC, QPAN in both classes
-- STUDENT         ${pad('baopg')} 10A1 (nickname "Bin"), ${pad('khanglm')} 10A1 (no email),
--                 ${pad('tramlnb')} 11D1, must_change_password = TRUE
-- PARENT          ${pad('toanpv')} father of baopg
--                 ${pad('hanttn')} mother of khanglm (10A1) and tramlnb (11D1) – two children
--                 ${pad('oanhntk')} mother of baopg, account LOCKED
--
-- ASSUMPTIONS (confirm with the team):
--   * Each account has exactly one role (no SM + Teacher or Teacher + Parent combinations here).
--   * Each teacher teaches several subjects so that every subject of both classes has a teacher.
--   * student_code = HS + entry year (2 digits) + 4-digit number; teacher_code = GV + 3 digits.
--   * Class type weights: focus subjects 2.00, others 1.00; focus subjects get one extra period per week.
--   * The homeroom teacher teaches HDTN of their class.
--   * Group members: GENERAL = homeroom + subject teachers + students + parents; STUDENT = homeroom + students;
--     PARENT = homeroom + parents; TEACHER_SCHOOL = all teachers + all School Managers.

BEGIN;
`);

L.push(`-- School year and semesters (FE-04)
INSERT INTO school_years (year_name, start_date, end_date) VALUES (${q(YEAR.name)}, ${q(YEAR.start)}, ${q(YEAR.end)});
INSERT INTO semesters (school_year_id, semester_no, start_date, end_date, status) VALUES
${SEMESTERS.map((s) => `  (${SY}, ${s.no}, ${q(s.start)}, ${q(s.end)}, 'OPEN')`).join(',\n')};

INSERT INTO grade_levels (grade_level_name) VALUES ${GRADE_LEVELS.map((g) => `(${q(g)})`).join(', ')};

INSERT INTO subjects (subject_code, subject_name) VALUES
${SUBJECTS.map(([c, n]) => `  (${q(c)}, ${q(n)})`).join(',\n')};

INSERT INTO class_tracks (track_name, description) VALUES
${TRACKS.map((t) => `  (${q(t.name)}, ${q(t.description)})`).join(',\n')};

INSERT INTO track_subjects (track_id, subject_id, school_year_id, weight, periods_per_week)
SELECT t.track_id, s.subject_id, ${SY}, v.weight::numeric, v.periods
FROM (VALUES
${values(TRACKS.flatMap((t) => trackSubjects(t).map((ts) => [t.name, ts.code, ts.weight, ts.periods])))}
) AS v(track_name, subject_code, weight, periods)
JOIN class_tracks t ON t.track_name = v.track_name
JOIN subjects s ON s.subject_code = v.subject_code;

INSERT INTO time_slots (period_number, start_time, end_time) VALUES
${TIME_SLOTS.map(([a, b], i) => `  (${i + 1}, '${a}:00', '${b}:00')`).join(',\n')};
`);

const roleInsert = (role, list) => `INSERT INTO user_roles (user_id, role_id)
SELECT u.user_id, r.role_id FROM users u JOIN roles r ON r.role_code = '${role}'
WHERE u.username IN (${usernamesOf(list)});`;

L.push(`-- Accounts (password: ${PASSWORD})
INSERT INTO users (username, email, phone, password_hash, full_name, status, must_change_password) VALUES
${users.map((u) => `  (${[u.username, u.email, u.phone, hash].map(q).join(', ')}, ${q(u.fullName)}, ${q(u.status)}, ${u.mustChange ? 'TRUE' : 'FALSE'})`).join(',\n')};

${roleInsert('SYSTEM_ADMIN', admins)}
${roleInsert('SCHOOL_MANAGER', managers)}
${roleInsert('TEACHER', teachers.map((t) => t.user))}
${roleInsert('STUDENT', students.map((s) => s.user))}
${roleInsert('PARENT', parents.map((p) => p.user))}

INSERT INTO teachers (user_id, teacher_code, department)
SELECT u.user_id, v.code, v.department
FROM (VALUES
${values(teachers.map((t) => [t.user.username, t.code, t.department]))}
) AS v(username, code, department)
JOIN users u ON u.username = v.username;

INSERT INTO students (user_id, student_code, dob, gender)
SELECT u.user_id, v.code, v.dob::date, v.gender
FROM (VALUES
${values(students.map((s) => [s.user.username, s.code, s.dob, s.gender]))}
) AS v(username, code, dob, gender)
JOIN users u ON u.username = v.username;

INSERT INTO parents (user_id, occupation, address)
SELECT u.user_id, v.occupation, v.address
FROM (VALUES
${values(parents.map((p) => [p.user.username, p.occupation, p.address]))}
) AS v(username, occupation, address)
JOIN users u ON u.username = v.username;

INSERT INTO student_parents (student_id, parent_id, relationship_type)
SELECT s.student_id, p.parent_id, v.relationship
FROM (VALUES
${values(parents.flatMap((p) => p.children.map(([child, rel]) => [student(child).code, p.user.username, rel])))}
) AS v(student_code, parent_username, relationship)
JOIN students s ON s.student_code = v.student_code
JOIN users pu ON pu.username = v.parent_username
JOIN parents p ON p.user_id = pu.user_id;

INSERT INTO teacher_subjects (teacher_id, subject_id)
SELECT t.teacher_id, s.subject_id
FROM (VALUES
${values(teachers.flatMap((t) => t.subjects.map((s) => [t.code, s])))}
) AS v(teacher_code, subject_code)
JOIN teachers t ON t.teacher_code = v.teacher_code
JOIN subjects s ON s.subject_code = v.subject_code;
`);

L.push(`-- Classes of ${YEAR.name} with homeroom teachers
${CLASSES.map(
  (c) => `INSERT INTO classes (class_name, grade_level_id, school_year_id, track_id, homeroom_teacher_id) VALUES (${q(c.name)},
  (SELECT grade_level_id FROM grade_levels WHERE grade_level_name = ${q(c.grade)}), ${SY},
  (SELECT track_id FROM class_tracks WHERE track_name = ${q(c.track.name)}),
  (SELECT teacher_id FROM teachers WHERE teacher_code = ${q(c.homeroom.code)}));`,
).join('\n')}

INSERT INTO class_enrollments (student_id, class_id, nickname, status, enrolled_at)
SELECT s.student_id, c.class_id, v.nickname, 'STUDYING', v.enrolled_at::timestamptz
FROM (VALUES
${values(students.map((s) => [s.code, s.cls.name, s.nickname, JOINED_AT]))}
) AS v(student_code, class_name, nickname, enrolled_at)
JOIN students s ON s.student_code = v.student_code
JOIN classes c ON c.class_name = v.class_name AND c.school_year_id = ${SY};

INSERT INTO teaching_assignments (class_id, subject_id, teacher_id, start_date, end_date)
SELECT c.class_id, s.subject_id, t.teacher_id, ${q(YEAR.start)}::date, ${q(YEAR.end)}::date
FROM (VALUES
${values(assignments.map((a) => [a.cls.name, a.subject, a.teacher.code]))}
) AS v(class_name, subject_code, teacher_code)
JOIN classes c ON c.class_name = v.class_name AND c.school_year_id = ${SY}
JOIN subjects s ON s.subject_code = v.subject_code
JOIN teachers t ON t.teacher_code = v.teacher_code;
`);

// Groups: GENERAL = homeroom + subject teachers + students + parents; STUDENT = homeroom + students;
// PARENT = homeroom + parents; TEACHER_SCHOOL = all teachers + all School Managers.
const memberRows = []; // [group name, username]
const addMembers = (group, list) => {
  for (const u of new Set(list)) memberRows.push([group, u.username]);
};
const creator = `(SELECT user_id FROM users WHERE username = ${q(managers[0].username)})`;
const groupSql = [];
for (const c of CLASSES) {
  const classStudents = students.filter((s) => s.cls === c);
  const classParents = parents.filter((p) => p.children.some(([child]) => student(child).cls === c)).map((p) => p.user);
  const subjectTeachers = assignments.filter((a) => a.cls === c).map((a) => a.teacher.user);
  for (const [type, name] of [['GENERAL', c.name], ['STUDENT', `${c.name} – Học sinh`], ['PARENT', `${c.name} – Phụ huynh`]]) {
    groupSql.push(`INSERT INTO groups (class_id, group_name, group_type, created_by, created_at) VALUES (${classId(c)}, ${q(name)}, '${type}', ${creator}, ${q(JOINED_AT)});`);
    addMembers(name, [
      c.homeroom.user,
      ...(type === 'GENERAL' ? subjectTeachers : []),
      ...(type !== 'PARENT' ? classStudents.map((s) => s.user) : []),
      ...(type !== 'STUDENT' ? classParents : []),
    ]);
  }
}
groupSql.push(`INSERT INTO groups (class_id, group_name, group_type, created_by, created_at) VALUES (NULL, 'Giáo viên toàn trường', 'TEACHER_SCHOOL', ${creator}, ${q(JOINED_AT)});`);
addMembers('Giáo viên toàn trường', [...managers, ...teachers.map((t) => t.user)]);

L.push(`-- Class groups (created with the class, UC-27) and the school-wide teacher group
${groupSql.join('\n')}

INSERT INTO group_members (group_id, user_id, joined_at)
SELECT g.group_id, u.user_id, ${q(JOINED_AT)}::timestamptz
FROM (VALUES
${values(memberRows)}
) AS v(group_name, username)
JOIN groups g ON g.group_name = v.group_name
JOIN users u ON u.username = v.username;

COMMIT;
`);

writeFileSync(OUT, L.join('\n'));
console.log(`Wrote ${OUT}: ${users.length} accounts (3 per role), ${CLASSES.length} classes, ${assignments.length} assignments, ${memberRows.length} group members.`);
