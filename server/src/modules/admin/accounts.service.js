import { pool, withTransaction } from '../../config/db.js';
import { badRequest } from '../../utils/AppError.js';
import { logActivity } from '../../utils/activityLog.js';
import { hashPassword } from '../../utils/password.js';
import { generateTemporaryPassword } from '../../utils/tempPassword.js';
import { nextFreeUsername } from '../../utils/username.js';

// FE-13 System Administration – accounts (owner: Linh).

export const ROLE_CODES = ['SYSTEM_ADMIN', 'SCHOOL_MANAGER', 'TEACHER', 'STUDENT', 'PARENT'];
const EXCLUSIVE_ROLES = ['SYSTEM_ADMIN', 'STUDENT']; // business-rules §1: no other role next to these
const GENDERS = ['MALE', 'FEMALE', 'OTHER'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// ASSUMPTION: a Vietnamese phone number is 10 digits starting with 0 (spaces, dots and dashes are removed first).
const PHONE_RE = /^0\d{9}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const optional = (value) => text(value) || null;

// Normalises the request body and collects field errors as { field: 'REQUIRED' | 'INVALID' | 'TOO_LONG' | … }.
export function readAccountInput(body = {}) {
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

  const phone = optional(body.phone)?.replace(/[\s.-]/g, '') ?? null;
  if (phone && !PHONE_RE.test(phone)) errors.phone = 'INVALID';
  if (!phone && roles.includes('PARENT')) errors.phone = 'REQUIRED_FOR_PARENT';

  const input = { fullName, roles, email, phone, student: null, teacher: null, parent: null };

  if (roles.includes('STUDENT')) {
    const s = body.student ?? {};
    const student = {
      studentCode: text(s.studentCode),
      dob: optional(s.dob),
      gender: optional(s.gender),
    };
    if (!student.studentCode) errors.studentCode = 'REQUIRED';
    maxLength('studentCode', student.studentCode, 50);
    if (student.dob && (!DATE_RE.test(student.dob) || Number.isNaN(Date.parse(student.dob)))) errors.dob = 'INVALID';
    if (student.gender && !GENDERS.includes(student.gender)) errors.gender = 'INVALID';
    input.student = student;
  }
  if (roles.includes('TEACHER')) {
    const t = body.teacher ?? {};
    const teacher = { teacherCode: text(t.teacherCode), department: optional(t.department) };
    if (!teacher.teacherCode) errors.teacherCode = 'REQUIRED';
    maxLength('teacherCode', teacher.teacherCode, 50);
    maxLength('department', teacher.department, 100);
    input.teacher = teacher;
  }
  if (roles.includes('PARENT')) {
    const p = body.parent ?? {};
    const parent = { occupation: optional(p.occupation), address: optional(p.address) };
    maxLength('occupation', parent.occupation, 100);
    maxLength('address', parent.address, 500);
    input.parent = parent;
  }
  return { input, errors };
}

function throwFieldErrors(fields) {
  throw badRequest('MSG_ACCOUNT_INVALID', 'Some fields are missing or invalid.', { fields });
}

// Email, phone, student code and teacher code must not belong to another account (BR-01).
async function findDuplicates(db, { email, phone, student, teacher }, exceptUserId = null) {
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
  const name = username ?? (await nextFreeUsername(db, input.fullName));
  const temporaryPassword = generateTemporaryPassword({ username: name, phone: input.phone });
  return { username: name, temporaryPassword, passwordHash: await hashPassword(temporaryPassword) };
}

// Inserts one account (user, roles, role profiles). `db` must be a transaction client. `credentials` comes from
// prepareCredentials (UC-93 prepares them before the transaction); without it they are generated here.
// Returns { id, username, temporaryPassword }.
export async function insertAccount(db, input, credentials = null) {
  const { username, temporaryPassword, passwordHash } = credentials ?? (await prepareCredentials(db, input));
  const { rows } = await db.query(
    `INSERT INTO users (username, email, phone, password_hash, full_name, status, must_change_password)
     VALUES ($1, $2, $3, $4, $5, 'ACTIVE', TRUE) RETURNING user_id`,
    [username, input.email, input.phone, passwordHash, input.fullName],
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
    await db.query('INSERT INTO parents (user_id, occupation, address) VALUES ($1, $2, $3)', [
      userId,
      input.parent.occupation,
      input.parent.address,
    ]);
  }
  return { id: userId, username, temporaryPassword };
}

// UC-92 Create Account: one account for any role; the temporary password is returned once and never stored as text.
export async function createAccount({ body, actorId, ip }) {
  const { input, errors } = readAccountInput(body);
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
