// npm run seed:generate – writes database/educonnect_seed_v0.2.sql (sample data for the shared DB, It1).
// Deterministic: the same script always produces the same file. Import it once, right after the schema.
// Covers: school year + semesters, grade levels, subjects, class types (+ weights), time slots, classes,
// SM / teacher / student / parent accounts, parent links, enrollments, teacher subjects, teaching assignments,
// class groups (GENERAL / STUDENT / PARENT) and the teacher group. No posts, timetable, grades or attendance.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const OUT = fileURLToPath(new URL('../../database/educonnect_seed_v0.2.sql', import.meta.url));
const PASSWORD = 'Educonnect@2026';
const EMAIL_DOMAIN = 'educonnect.test'; // reserved TLD: never reaches a real inbox
const YEAR = { name: '2026-2027', start: '2026-09-05', end: '2027-05-31' };
const SEMESTERS = [
  { no: 1, start: '2026-09-05', end: '2027-01-16' },
  { no: 2, start: '2027-01-18', end: '2027-05-31' },
];
const JOINED_AT = '2026-09-05 07:00:00';
const STUDENTS_PER_CLASS = 8;

// ---------- helpers ----------
let seed = 20261021;
function rand() {
  // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pad = (n, w) => String(n).padStart(w, '0');
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

const takenUsernames = new Set(['admin']);
// Business rules §3: first name + initials of family and middle names, no accents; add 1, 2… if taken.
function makeUsername(fullName) {
  const parts = fullName.split(' ');
  const base = plain(parts.at(-1)) + parts.slice(0, -1).map((p) => plain(p)[0]).join('');
  let name = base;
  for (let i = 1; takenUsernames.has(name); i++) name = base + i;
  takenUsernames.add(name);
  return name;
}

const takenPhones = new Set();
function makePhone() {
  let p;
  do p = pick(['09', '03', '08']) + pad(Math.floor(rand() * 1e8), 8);
  while (takenPhones.has(p));
  takenPhones.add(p);
  return p;
}

function randomDate(year) {
  const d = new Date(Date.UTC(year, 0, 1) + Math.floor(rand() * 365) * 86400000);
  return d.toISOString().slice(0, 10);
}

const FAMILY = ['Nguyễn', 'Nguyễn', 'Nguyễn', 'Trần', 'Trần', 'Lê', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const MIDDLE = {
  MALE: ['Văn', 'Minh', 'Đức', 'Quang', 'Hữu', 'Thành', 'Gia', 'Hoàng', 'Tuấn', 'Quốc', 'Anh'],
  FEMALE: ['Thị', 'Ngọc', 'Thu', 'Thanh', 'Minh', 'Phương', 'Khánh', 'Bảo', 'Thị Thu', 'Ngọc Bảo'],
};
const GIVEN = {
  MALE: ['An', 'Bảo', 'Cường', 'Dũng', 'Duy', 'Hải', 'Hiếu', 'Hùng', 'Huy', 'Khang', 'Khoa', 'Kiên', 'Long', 'Minh', 'Nam', 'Nghĩa', 'Phát', 'Phong', 'Phúc', 'Quân', 'Sơn', 'Tài', 'Thắng', 'Thịnh', 'Trung', 'Tuấn', 'Vinh', 'Việt'],
  FEMALE: ['Anh', 'Châu', 'Chi', 'Diệp', 'Giang', 'Hà', 'Hân', 'Hằng', 'Hoa', 'Hương', 'Lan', 'Linh', 'Mai', 'My', 'Ngân', 'Nhi', 'Nhung', 'Phương', 'Quỳnh', 'Thảo', 'Trang', 'Trâm', 'Uyên', 'Vy', 'Yến'],
};
const personName = (gender, family = pick(FAMILY)) => `${family} ${pick(MIDDLE[gender])} ${pick(GIVEN[gender])}`;
const OCCUPATIONS = ['Kỹ sư', 'Giáo viên', 'Kinh doanh', 'Bác sĩ', 'Công nhân', 'Nhân viên văn phòng', 'Nội trợ', 'Kế toán', 'Lái xe', 'Công chức'];
const STREETS = ['Nguyễn Văn Linh', 'Trần Hưng Đạo', 'Lê Lợi', 'Hai Bà Trưng', 'Phan Chu Trinh', 'Lý Thường Kiệt', 'Hùng Vương', 'Điện Biên Phủ'];
const address = () => `${1 + Math.floor(rand() * 200)} ${pick(STREETS)}, phường Hải Châu, TP. Đà Nẵng`;

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

// ---------- people ----------
const users = []; // { username, fullName, email, phone, status, mustChange }
function addUser(fullName, { email = true, phone = true, status = 'ACTIVE', mustChange = false } = {}) {
  const username = makeUsername(fullName);
  const u = { username, fullName, email: email ? `${username}@${EMAIL_DOMAIN}` : null, phone: phone ? makePhone() : null, status, mustChange };
  users.push(u);
  return u;
}

const managers = [addUser('Nguyễn Văn Bình'), addUser('Lê Thị Thu Hà')]; // Hà is also a teacher (SM + Teacher)

// [full name, department, subjects]
const TEACHER_LIST = [
  ['Phạm Minh Tuấn', 'Tổ Toán – Tin', ['TOAN', 'TIN']],
  ['Nguyễn Thị Lan', 'Tổ Toán – Tin', ['TOAN']],
  ['Đỗ Văn Khoa', 'Tổ Toán – Tin', ['TIN', 'CN']],
  ['Trần Thị Mai', 'Tổ Ngữ văn', ['VAN']],
  ['Lê Hoàng Nam', 'Tổ Ngữ văn', ['VAN']],
  ['Vũ Thị Hương', 'Tổ Ngoại ngữ', ['ANH']],
  ['Bùi Thanh Hải', 'Tổ Ngoại ngữ', ['ANH']],
  ['Hoàng Văn Long', 'Tổ Khoa học tự nhiên', ['LY', 'CN']],
  ['Ngô Thị Thu Trang', 'Tổ Khoa học tự nhiên', ['LY']],
  ['Đặng Quốc Việt', 'Tổ Khoa học tự nhiên', ['HOA']],
  ['Phan Thị Ngọc Anh', 'Tổ Khoa học tự nhiên', ['HOA', 'SINH']],
  ['Huỳnh Thị Yến', 'Tổ Khoa học tự nhiên', ['SINH']],
  ['Dương Văn Phúc', 'Tổ Khoa học xã hội', ['SU', 'KTPL']],
  ['Lý Thị Hằng', 'Tổ Khoa học xã hội', ['DIA', 'KTPL']],
  ['Võ Minh Kiên', 'Tổ Thể dục – Quốc phòng', ['GDTC', 'QPAN']],
  ['Hồ Đức Thắng', 'Tổ Thể dục – Quốc phòng', ['GDTC', 'QPAN']],
];
const teachers = TEACHER_LIST.map(([name, department, subjects], i) => ({
  user: addUser(name, { mustChange: i === TEACHER_LIST.length - 1 }), // last teacher: new account, must change password
  department,
  subjects: [...subjects],
}));
teachers.push({ user: managers[1], department: 'Tổ Toán – Tin', subjects: ['TOAN'] });
teachers.forEach((t, i) => (t.code = `GV${pad(i + 1, 3)}`));
const teacherByName = (name) => teachers.find((t) => t.user.fullName === name);

// [class, grade, track, homeroom teacher]
const CLASSES = [
  ['10A1', '10', 'Khối A', 'Nguyễn Thị Lan'],
  ['10D1', '10', 'Khối D', 'Trần Thị Mai'],
  ['11A1', '11', 'Khối A', 'Hoàng Văn Long'],
  ['11B1', '11', 'Khối B', 'Phan Thị Ngọc Anh'],
  ['12A1', '12', 'Khối A', 'Phạm Minh Tuấn'],
  ['12D1', '12', 'Khối D', 'Vũ Thị Hương'],
].map(([name, grade, track, homeroom]) => ({ name, grade, track: TRACKS.find((t) => t.name === track), homeroom: teacherByName(homeroom) }));
// The homeroom teacher teaches HDTN of their class.
for (const c of CLASSES) if (!c.homeroom.subjects.includes('HDTN')) c.homeroom.subjects.push('HDTN');

// Teaching assignments: for each subject, spread the classes over the teachers who can teach it.
const assignments = []; // { cls, subject, teacher }
const loadCount = new Map();
for (const c of CLASSES) {
  for (const { code } of trackSubjects(c.track)) {
    let teacher;
    if (code === 'HDTN') teacher = c.homeroom;
    else if (code === 'TOAN' && c.name === '12D1') teacher = teacherByName('Lê Thị Thu Hà');
    else {
      const able = teachers.filter((t) => t.subjects.includes(code) && t.user !== managers[1]);
      teacher = able.sort((a, b) => (loadCount.get(a) ?? 0) - (loadCount.get(b) ?? 0))[0];
    }
    loadCount.set(teacher, (loadCount.get(teacher) ?? 0) + 1);
    assignments.push({ cls: c, subject: code, teacher });
  }
}

// Students and parents.
const students = []; // { user, code, dob, gender, cls, parents: [{ parent, relationship }] }
const parents = []; // { user, occupation, address }
function addParent(fullName, opts = {}) {
  const p = { user: addUser(fullName, { email: rand() < 0.5, ...opts }), occupation: pick(OCCUPATIONS), address: address() };
  parents.push(p);
  return p;
}
const ENTRY_YEAR = { 10: 2026, 11: 2025, 12: 2024 };
const BIRTH_YEAR = { 10: 2011, 11: 2010, 12: 2009 };
let studentSeq = 0;
function addStudent(cls, fullName, gender, opts = {}) {
  const grade = Number(cls.grade);
  const s = {
    user: addUser(fullName, { email: rand() < 0.5, phone: grade === 12 && rand() < 0.5, ...opts }),
    code: `HS${String(ENTRY_YEAR[grade]).slice(2)}${pad(++studentSeq, 4)}`,
    dob: randomDate(BIRTH_YEAR[grade]),
    gender,
    cls,
    parents: [],
  };
  students.push(s);
  return s;
}

const cls = (name) => CLASSES.find((c) => c.name === name);
// Special cases first, so they get predictable usernames.
const tuan = teacherByName('Phạm Minh Tuấn');
const tuanAsParent = { user: tuan.user, occupation: 'Giáo viên', address: address() };
parents.push(tuanAsParent); // Teacher + Parent account
const bao = addStudent(cls('10A1'), 'Phạm Gia Bảo', 'MALE');
bao.parents.push({ parent: tuanAsParent, relationship: 'FATHER' });

const motherOfTwo = addParent('Trần Thị Ngọc Hân', { email: true });
const sib1 = addStudent(cls('10A1'), 'Lê Minh Khang', 'MALE');
const sib2 = addStudent(cls('12A1'), 'Lê Ngọc Bảo Trâm', 'FEMALE');
for (const s of [sib1, sib2]) s.parents.push({ parent: motherOfTwo, relationship: 'MOTHER' });
const fatherOfTwo = addParent('Lê Quang Vinh');
for (const s of [sib1, sib2]) s.parents.push({ parent: fatherOfTwo, relationship: 'FATHER' });

// Transferred in October from 10D1 to 10A1 (UC-10 example).
const transferred = addStudent(cls('10A1'), 'Võ Thị Quỳnh Như', 'FEMALE');
transferred.transferredFrom = { cls: cls('10D1'), at: '2026-10-05 08:00:00' };
transferred.parents.push({ parent: addParent('Nguyễn Thị Kim Oanh'), relationship: 'MOTHER' });

for (const c of CLASSES) {
  while (students.filter((s) => s.cls === c).length < STUDENTS_PER_CLASS) {
    const gender = rand() < 0.5 ? 'MALE' : 'FEMALE';
    const family = pick(FAMILY);
    const s = addStudent(c, personName(gender, family), gender);
    const r = rand();
    if (r < 0.9) s.parents.push({ parent: addParent(personName('MALE', family)), relationship: 'FATHER' });
    if (r > 0.25 && r < 0.95) s.parents.push({ parent: addParent(personName('FEMALE')), relationship: 'MOTHER' });
    if (r >= 0.95) s.parents.push({ parent: addParent(personName(rand() < 0.5 ? 'MALE' : 'FEMALE')), relationship: 'GUARDIAN' });
  }
}
// A locked parent account and a student who must change the password (new account).
parents.at(-1).user.status = 'LOCKED';
students.find((s) => s.cls.name === '11B1').user.mustChange = true;

// Nicknames set by the homeroom teacher of 10A1 (UC-34 example).
const nicknames = new Map([[bao, 'Bin'], [sib1, 'Ken']]);

for (const u of users) {
  if (PASSWORD.toLowerCase().includes(u.username) || (u.phone && PASSWORD.includes(u.phone))) {
    throw new Error(`Password must not contain username/phone of ${u.username}`);
  }
}

// ---------- SQL ----------
const hash = bcrypt.hashSync(PASSWORD, 10);
const L = [];
const values = (rows) => rows.map((r) => `  ROW(${r.map(q).join(', ')})`).join(',\n');
const usernamesOf = (list) => list.map((u) => q(u.username)).join(', ');
const classVar = (c) => `@c_${c.name}`;
const groupVar = (c, type) => `@g_${c.name}_${type}`;

L.push(`-- EduConnect seed data v0.2 – generated by server/scripts/generate-seed.js (do not edit by hand; edit the script).
-- Import once into a database created from educonnect_schema_v0.2.sql (needs MySQL 8.0.19+).
-- Everything runs in one transaction: if it fails half-way nothing is saved.
--
-- Every sample account uses the password: ${PASSWORD}
-- Sign in with the username, email or phone. Emails use @${EMAIL_DOMAIN} (not real inboxes).
-- System Admin is NOT created here: use \`npm run seed:admin\` (shared DB already has "admin").
--
-- Accounts worth knowing:
--   ${managers[0].username.padEnd(10)} School Manager (Hiệu trưởng ${managers[0].fullName})
--   ${managers[1].username.padEnd(10)} School Manager + Teacher (role switcher), teaches Toán 12D1
${CLASSES.map((c) => `--   ${c.homeroom.user.username.padEnd(10)} Teacher, homeroom of ${c.name}`).join('\n')}
--   ${tuan.user.username.padEnd(10)} also Parent of ${bao.user.username} (10A1) – Teacher + Parent
--   ${motherOfTwo.user.username.padEnd(10)} Parent with two children: ${sib1.user.username} (10A1), ${sib2.user.username} (12A1)
--   ${transferred.user.username.padEnd(10)} Student transferred from 10D1 to 10A1 on 05/10/2026
--   ${teachers[TEACHER_LIST.length - 1].user.username.padEnd(10)} Teacher with must_change_password = TRUE
--   ${students.find((s) => s.user.mustChange).user.username.padEnd(10)} Student with must_change_password = TRUE
--   ${parents.at(-1).user.username.padEnd(10)} Parent account LOCKED
--
-- ASSUMPTIONS (confirm with the team):
--   * Sample accounts have must_change_password = FALSE (except the two above) so developers can sign in directly.
--   * student_code = HS + entry year (2 digits) + 4-digit number; teacher_code = GV + 3 digits.
--   * Class type weights: focus subjects 2.00, others 1.00; focus subjects get one extra period per week.
--   * The homeroom teacher teaches HDTN of their class.
--   * Group members: GENERAL = homeroom + subject teachers + students + parents; STUDENT = homeroom + students;
--     PARENT = homeroom + parents; TEACHER_SCHOOL = all teachers + all School Managers.
--
-- Totals: ${users.length} accounts (${managers.length} SM, ${teachers.length} teachers incl. 1 SM, ${students.length} students, ${parents.length} parents incl. 1 teacher), ${CLASSES.length} classes.

SET NAMES utf8mb4;
USE educonnect;
START TRANSACTION;
`);

L.push(`-- School year and semesters (FE-04)
INSERT INTO school_years (year_name, start_date, end_date) VALUES (${q(YEAR.name)}, ${q(YEAR.start)}, ${q(YEAR.end)});
SET @sy = LAST_INSERT_ID();
INSERT INTO semesters (school_year_id, semester_no, start_date, end_date, status) VALUES
${SEMESTERS.map((s) => `  (@sy, ${s.no}, ${q(s.start)}, ${q(s.end)}, 'OPEN')`).join(',\n')};

INSERT INTO grade_levels (grade_level_name) VALUES ${GRADE_LEVELS.map((g) => `(${q(g)})`).join(', ')};

INSERT INTO subjects (subject_code, subject_name) VALUES
${SUBJECTS.map(([c, n]) => `  (${q(c)}, ${q(n)})`).join(',\n')};

INSERT INTO class_tracks (track_name, description) VALUES
${TRACKS.map((t) => `  (${q(t.name)}, ${q(t.description)})`).join(',\n')};

INSERT INTO track_subjects (track_id, subject_id, school_year_id, weight, periods_per_week)
SELECT t.track_id, s.subject_id, @sy, v.weight, v.periods
FROM (VALUES
${values(TRACKS.flatMap((t) => trackSubjects(t).map((ts) => [t.name, ts.code, ts.weight, ts.periods])))}
) AS v(track_name, subject_code, weight, periods)
JOIN class_tracks t ON t.track_name = v.track_name
JOIN subjects s ON s.subject_code = v.subject_code;

INSERT INTO time_slots (period_number, start_time, end_time) VALUES
${TIME_SLOTS.map(([a, b], i) => `  (${i + 1}, '${a}:00', '${b}:00')`).join(',\n')};
`);

L.push(`-- Accounts (password: ${PASSWORD})
SET @pw = ${q(hash)};
INSERT INTO users (username, email, phone, password_hash, full_name, status, must_change_password) VALUES
${users.map((u) => `  (${[u.username, u.email, u.phone].map(q).join(', ')}, @pw, ${q(u.fullName)}, ${q(u.status)}, ${u.mustChange ? 'TRUE' : 'FALSE'})`).join(',\n')};

INSERT INTO user_roles (user_id, role_id)
SELECT u.user_id, r.role_id FROM users u JOIN roles r ON r.role_code = 'SCHOOL_MANAGER'
WHERE u.username IN (${usernamesOf(managers)});
INSERT INTO user_roles (user_id, role_id)
SELECT u.user_id, r.role_id FROM users u JOIN roles r ON r.role_code = 'TEACHER'
WHERE u.username IN (${usernamesOf(teachers.map((t) => t.user))});
INSERT INTO user_roles (user_id, role_id)
SELECT u.user_id, r.role_id FROM users u JOIN roles r ON r.role_code = 'STUDENT'
WHERE u.username IN (${usernamesOf(students.map((s) => s.user))});
INSERT INTO user_roles (user_id, role_id)
SELECT u.user_id, r.role_id FROM users u JOIN roles r ON r.role_code = 'PARENT'
WHERE u.username IN (${usernamesOf(parents.map((p) => p.user))});

INSERT INTO teachers (user_id, teacher_code, department)
SELECT u.user_id, v.code, v.department
FROM (VALUES
${values(teachers.map((t) => [t.user.username, t.code, t.department]))}
) AS v(username, code, department)
JOIN users u ON u.username = v.username;

INSERT INTO students (user_id, student_code, dob, gender)
SELECT u.user_id, v.code, v.dob, v.gender
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
${values(students.flatMap((s) => s.parents.map((sp) => [s.code, sp.parent.user.username, sp.relationship])))}
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
  (SELECT grade_level_id FROM grade_levels WHERE grade_level_name = ${q(c.grade)}), @sy,
  (SELECT track_id FROM class_tracks WHERE track_name = ${q(c.track.name)}),
  (SELECT teacher_id FROM teachers WHERE teacher_code = ${q(c.homeroom.code)}));
SET ${classVar(c)} = LAST_INSERT_ID();`,
).join('\n')}

INSERT INTO class_enrollments (student_id, class_id, nickname, status, enrolled_at, left_at)
SELECT s.student_id, c.class_id, v.nickname, v.status, v.enrolled_at, v.left_at
FROM (VALUES
${values(
  students.flatMap((s) => {
    const rows = [];
    if (s.transferredFrom) rows.push([s.code, s.transferredFrom.cls.name, null, 'TRANSFERRED', JOINED_AT, s.transferredFrom.at]);
    rows.push([s.code, s.cls.name, nicknames.get(s) ?? null, 'STUDYING', s.transferredFrom?.at ?? JOINED_AT, null]);
    return rows;
  }),
)}
) AS v(student_code, class_name, nickname, status, enrolled_at, left_at)
JOIN students s ON s.student_code = v.student_code
JOIN classes c ON c.class_name = v.class_name AND c.school_year_id = @sy;

INSERT INTO teaching_assignments (class_id, subject_id, teacher_id, start_date, end_date)
SELECT c.class_id, s.subject_id, t.teacher_id, ${q(YEAR.start)}, ${q(YEAR.end)}
FROM (VALUES
${values(assignments.map((a) => [a.cls.name, a.subject, a.teacher.code]))}
) AS v(class_name, subject_code, teacher_code)
JOIN classes c ON c.class_name = v.class_name AND c.school_year_id = @sy
JOIN subjects s ON s.subject_code = v.subject_code
JOIN teachers t ON t.teacher_code = v.teacher_code;
`);

// Group membership rows: { groupVar, username, joined, left }
const memberRows = [];
const addMembers = (gv, list, joined = JOINED_AT, left = null) => {
  const seen = new Set(memberRows.filter((m) => m.gv === gv && !m.left).map((m) => m.username));
  for (const u of list) if (!seen.has(u.username)) { seen.add(u.username); memberRows.push({ gv, username: u.username, joined, left }); }
};
const creator = `(SELECT user_id FROM users WHERE username = ${q(managers[0].username)})`;
const groupSql = [];
for (const c of CLASSES) {
  const now = students.filter((s) => s.cls === c);
  const before = students.filter((s) => s.transferredFrom?.cls === c);
  const parentUsers = (list) => list.flatMap((s) => s.parents.map((p) => p.parent.user));
  const subjectTeachers = assignments.filter((a) => a.cls === c).map((a) => a.teacher.user);
  for (const [type, name] of [['GENERAL', c.name], ['STUDENT', `${c.name} – Học sinh`], ['PARENT', `${c.name} – Phụ huynh`]]) {
    groupSql.push(`INSERT INTO \`groups\` (class_id, group_name, group_type, created_by, created_at) VALUES (${classVar(c)}, ${q(name)}, '${type}', ${creator}, ${q(JOINED_AT)});
SET ${groupVar(c, type)} = LAST_INSERT_ID();`);
    const gv = groupVar(c, type);
    const withStudents = type !== 'PARENT';
    const withParents = type !== 'STUDENT';
    addMembers(gv, [c.homeroom.user, ...(type === 'GENERAL' ? subjectTeachers : [])]);
    // Students / parents who left this class (transfer) keep their row with left_at.
    for (const s of before) {
      const list = [...(withStudents ? [s.user] : []), ...(withParents ? parentUsers([s]) : [])];
      addMembers(gv, list, JOINED_AT, s.transferredFrom.at);
    }
    for (const s of now) {
      const joined = s.transferredFrom?.at ?? JOINED_AT;
      addMembers(gv, [...(withStudents ? [s.user] : []), ...(withParents ? parentUsers([s]) : [])], joined);
    }
  }
}
groupSql.push(`INSERT INTO \`groups\` (class_id, group_name, group_type, created_by, created_at) VALUES (NULL, 'Giáo viên toàn trường', 'TEACHER_SCHOOL', ${creator}, ${q(JOINED_AT)});
SET @g_TEACHERS = LAST_INSERT_ID();`);
addMembers('@g_TEACHERS', [...managers, ...teachers.map((t) => t.user)]);

L.push(`-- Class groups (created with the class, UC-27) and the school-wide teacher group
${groupSql.join('\n')}

INSERT INTO group_members (group_id, user_id, joined_at, left_at)
SELECT v.group_id, u.user_id, v.joined_at, v.left_at
FROM (VALUES
${memberRows.map((m) => `  ROW(${m.gv}, ${q(m.username)}, ${q(m.joined)}, ${q(m.left)})`).join(',\n')}
) AS v(group_id, username, joined_at, left_at)
JOIN users u ON u.username = v.username;

COMMIT;
`);

writeFileSync(OUT, L.join('\n'));
console.log(`Wrote ${OUT}: ${users.length} accounts, ${students.length} students, ${parents.length} parents, ${teachers.length} teachers, ${assignments.length} assignments, ${memberRows.length} group members.`);
