import { pool, withTransaction } from '../../config/db.js';
import { badRequest } from '../../utils/AppError.js';
import { logActivity } from '../../utils/activityLog.js';
import { hashPassword } from '../../utils/password.js';
import { normalizePhone, PHONE_RE } from '../../utils/phone.js';
import { generateTemporaryPassword } from '../../utils/tempPassword.js';
import { nextFreeUsername } from '../../utils/username.js';
import { applyDepartment, listDepartments, needsDepartments } from './departments.js';
import { joinSchoolGroup, needsSchoolGroup } from './schoolGroup.js';
import { isSchoolManager, onlySchoolRoles } from './scope.js';

// FE-13 System Administration – accounts (owner: Linh).

export const ROLE_CODES = ['SYSTEM_ADMIN', 'SCHOOL_MANAGER', 'TEACHER', 'STUDENT', 'PARENT'];
const EXCLUSIVE_ROLES = ['SYSTEM_ADMIN', 'STUDENT']; // business-rules §1: no other role next to these
const GENDERS = ['MALE', 'FEMALE', 'OTHER'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Business rules §3: student code = "HS" + 6 digits (HS000123), teacher code = "GV" + 6 digits (GV000042)
// (FE-13 owner, 27/11/2026; 4 digits from 01/11/2026). Typed lower case is accepted and upper-cased.
// Checked when an account is created, imported, edited or given a role. The 4-digit codes already in the data stay
// valid: an account keeps its code when it is edited (readAccountInput `keep`); only a new or changed code needs
// 6 digits.
const STUDENT_CODE_RE = /^HS\d{6}$/;
const TEACHER_CODE_RE = /^GV\d{6}$/;
const code = (value) => text(value).replace(/\s+/g, '').toUpperCase();

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const optional = (value) => text(value) || null;

// Normalises the request body and collects field errors as { field: 'REQUIRED' | 'INVALID' | 'TOO_LONG' | … }.
// `keep` = { studentCode, teacherCode } the account already has (UC-99 edit): sent back unchanged it is accepted even
// in the older 4-digit format.
export function readAccountInput(body = {}, { keep = {} } = {}) {
  const validCode = (value, re, kept) => re.test(value) || (Boolean(kept) && value === code(kept));
  const errors = {};
  const maxLength = (field, value, max) => {
    if (value && value.length > max) errors[field] = 'TOO_LONG';
  };

  const fullName = text(body.fullName).replace(/\s+/g, ' ');
  if (!fullName) errors.fullName = 'REQUIRED';
  maxLength('fullName', fullName, 150);

  const roles = Array.isArray(body.roles) ? [...new Set(body.roles)] : [];
  if (!roles.length) errors.roles = 'REQUIRED';
  else if (roles.some((r) => !ROLE_CODES.includes(r))) errors.roles = 'INVALID';
  else if (roles.length > 1 && roles.some((r) => EXCLUSIVE_ROLES.includes(r))) errors.roles = 'EXCLUSIVE';

  const email = optional(body.email)?.toLowerCase() ?? null;
  if (email && !EMAIL_RE.test(email)) errors.email = 'INVALID';
  maxLength('email', email, 150);

  const phone = body.phone == null || !text(String(body.phone)) ? null : normalizePhone(body.phone);
  if (phone && !PHONE_RE.test(phone)) errors.phone = 'INVALID';
  if (!phone && roles.includes('PARENT')) errors.phone = 'REQUIRED_FOR_PARENT';

  // Address: users.address for every role (business-rules §3, moved from parents on 28/10/2026).
  const address = optional(body.address);
  maxLength('address', address, 500);

  const input = { fullName, roles, email, phone, address, student: null, teacher: null, parent: null };

  if (roles.includes('STUDENT')) {
    const s = body.student ?? {};
    const student = {
      studentCode: code(s.studentCode),
      dob: optional(s.dob),
      gender: optional(s.gender),
    };
    if (!student.studentCode) errors.studentCode = 'REQUIRED';
    else if (!validCode(student.studentCode, STUDENT_CODE_RE, keep.studentCode)) errors.studentCode = 'INVALID';
    if (student.dob && (!DATE_RE.test(student.dob) || Number.isNaN(Date.parse(student.dob)))) errors.dob = 'INVALID';
    if (student.gender && !GENDERS.includes(student.gender)) errors.gender = 'INVALID';
    input.student = student;
  }
  if (roles.includes('TEACHER')) {
    const t = body.teacher ?? {};
    // Department: an id of FE-03's list (create form) or a name (import file); checked against the list by
    // applyDepartment (departments.js), which needs the database.
    const departmentId = t.departmentId == null || t.departmentId === '' ? null : String(t.departmentId);
    const teacher = { teacherCode: code(t.teacherCode), department: optional(t.department), departmentId };
    if (!teacher.teacherCode) errors.teacherCode = 'REQUIRED';
    else if (!validCode(teacher.teacherCode, TEACHER_CODE_RE, keep.teacherCode)) errors.teacherCode = 'INVALID';
    if (departmentId != null && !/^\d{1,15}$/.test(departmentId)) errors.department = 'NOT_IN_LIST';
    maxLength('department', teacher.department, 100);
    input.teacher = teacher;
  }
  if (roles.includes('PARENT')) {
    const p = body.parent ?? {};
    const parent = { occupation: optional(p.occupation) };
    maxLength('occupation', parent.occupation, 100);
    input.parent = parent;
  }
  return { input, errors };
}

function throwFieldErrors(fields) {
  throw badRequest('MSG_ACCOUNT_INVALID', 'Some fields are missing or invalid.', { fields });
}

// Email, phone, student code and teacher code must not belong to another account (BR-01).
export async function findDuplicates(db, { email, phone, student, teacher }, exceptUserId = null) {
  const fields = {};
  const { rows } = await db.query(
    `SELECT
       EXISTS (SELECT 1 FROM users WHERE $1::text IS NOT NULL AND LOWER(email) = $1 AND user_id IS DISTINCT FROM $5) AS email,
       EXISTS (SELECT 1 FROM users WHERE $2::text IS NOT NULL AND phone = $2 AND user_id IS DISTINCT FROM $5) AS phone,
       EXISTS (SELECT 1 FROM students WHERE $3::text IS NOT NULL AND student_code = $3 AND user_id IS DISTINCT FROM $5) AS "studentCode",
       EXISTS (SELECT 1 FROM teachers WHERE $4::text IS NOT NULL AND teacher_code = $4 AND user_id IS DISTINCT FROM $5) AS "teacherCode"`,
    [email, phone, student?.studentCode ?? null, teacher?.teacherCode ?? null, exceptUserId],
  );
  for (const [field, used] of Object.entries(rows[0])) if (used) fields[field] = 'DUPLICATE';
  return fields;
}

// Generated sign-in details for one account: the username (unless already chosen), a temporary password and its hash.
export async function prepareCredentials(db, input, username = null) {
  const name = username ?? (await nextFreeUsername(db, input));
  const temporaryPassword = generateTemporaryPassword({ username: name, phone: input.phone });
  return { username: name, temporaryPassword, passwordHash: await hashPassword(temporaryPassword) };
}

// Inserts one account (user, roles, role profiles). `db` must be a transaction client. `credentials` comes from
// prepareCredentials (UC-96 prepares them before the transaction); without it they are generated here.
// Returns { id, username, temporaryPassword }.
export async function insertAccount(db, input, credentials = null) {
  const { username, temporaryPassword, passwordHash } = credentials ?? (await prepareCredentials(db, input));
  const { rows } = await db.query(
    `INSERT INTO users (username, email, phone, password_hash, full_name, address, status, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', TRUE) RETURNING user_id`,
    [username, input.email, input.phone, passwordHash, input.fullName, input.address],
  );
  const userId = rows[0].user_id;
  await db.query(
    `INSERT INTO user_roles (user_id, role_id) SELECT $1, role_id FROM roles WHERE role_code = ANY($2::text[])`,
    [userId, input.roles],
  );
  if (input.student) {
    await db.query('INSERT INTO students (user_id, student_code, dob, gender) VALUES ($1, $2, $3, $4)', [
      userId,
      input.student.studentCode,
      input.student.dob,
      input.student.gender,
    ]);
  }
  if (input.teacher) {
    await db.query('INSERT INTO teachers (user_id, teacher_code, department) VALUES ($1, $2, $3)', [
      userId,
      input.teacher.teacherCode,
      input.teacher.department,
    ]);
  }
  if (input.parent) {
    await db.query('INSERT INTO parents (user_id, occupation) VALUES ($1, $2)', [userId, input.parent.occupation]);
  }
  // Teachers and School Managers join the school's teacher group ("Giáo viên toàn trường").
  if (needsSchoolGroup(input.roles)) await joinSchoolGroup(db, [userId]);
  return { id: userId, username, temporaryPassword };
}

// UC-95 Create Account: one account for any role; the temporary password is returned once and never stored as text.
// School Manager (23/11/2026): student, teacher and parent accounts only (scope.js).
export async function createAccount({ body, actor = null, actorId, ip }) {
  const { input, errors } = readAccountInput(body);
  // 24/11/2026 (option 2): an account is created with the one role of its page, like an import row; a combinable
  // role is added afterwards from the account detail (accountControl.addRole).
  if (!errors.roles && input.roles.length > 1) errors.roles = 'ONE_ROLE';
  if (!errors.roles && isSchoolManager(actor) && !onlySchoolRoles(input.roles)) errors.roles = 'SCHOOL_ROLES_ONLY';
  // Business rules §3 (agreed 01/11/2026): System Admin accounts are not created from
  // the UI; the few IT admins are created with `npm run seed:admin`. UC-96 import never offered this role.
  if ((!errors.roles || errors.roles === 'EXCLUSIVE') && input.roles.includes('SYSTEM_ADMIN')) {
    errors.roles = 'SYSTEM_ADMIN_NOT_ALLOWED';
  }
  if (needsDepartments(input)) applyDepartment(input, errors, await listDepartments());
  if (Object.keys(errors).length) throwFieldErrors(errors);

  const duplicates = await findDuplicates(pool, input);
  if (Object.keys(duplicates).length) throwFieldErrors(duplicates);

  let created;
  for (let attempt = 1; ; attempt += 1) {
    try {
      created = await withTransaction((client) => insertAccount(client, input));
      break;
    } catch (err) {
      // Two admins creating the same username at the same moment: pick the next free one and try again.
      if (err.code === '23505' && err.constraint === 'users_username_key' && attempt < 3) continue;
      if (err.code === '23505') {
        const taken = await findDuplicates(pool, input); // email / phone / code taken in the meantime
        if (Object.keys(taken).length) throwFieldErrors(taken);
      }
      throw err;
    }
  }

  await logActivity({
    userId: actorId,
    action: 'ACCOUNT_CREATE',
    targetType: 'USER',
    targetId: created.id,
    detail: { username: created.username, roles: input.roles },
    ip,
  });

  return {
    account: { id: created.id, username: created.username, fullName: input.fullName, roles: input.roles },
    temporaryPassword: created.temporaryPassword,
  };
}
