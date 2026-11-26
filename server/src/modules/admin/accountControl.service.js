import ExcelJS from 'exceljs';
import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, forbidden, notFound } from '../../utils/AppError.js';
import { logActivity } from '../../utils/activityLog.js';
import { hashPassword } from '../../utils/password.js';
import { open as openSecret } from '../../utils/secretBox.js';
import { generateTemporaryPassword } from '../../utils/tempPassword.js';
import { containsPattern, VI_TRANSLATE } from '../../utils/search.js';
import { isValidUsername } from '../../utils/username.js';
import { findDuplicates, readAccountInput, ROLE_CODES } from './accounts.service.js';
import { applyDepartment, listDepartments, needsDepartments } from './departments.js';
import { workbookBuffer, XLSX_MIME } from '../../utils/excel.js';
import { COL, TEMPLATES } from './accountImport.service.js';
import { joinSchoolGroup, needsSchoolGroup } from './schoolGroup.js';
import { isSchoolManager, onlySchoolRoles, SCHOOL_ROLES } from './scope.js';

// FE-13 System Administration (owner: Linh) – account list and control:
// UC-97 View Account List, UC-98 Export Account List, UC-99 Update Account (login identifiers + imported fields),
// UC-100 Reset Password, UC-101 Lock / Unlock Account.

const PAGE_SIZE = 20;
const EXPORT_LIMIT = 10000;
const STATUSES = ['ACTIVE', 'LOCKED'];

// Accent-insensitive search: shared utils/search.js (business-rules §16).

// ---------------------------------------------------------------- UC-97 / UC-98 list

function readFilters(query = {}) {
  const search = containsPattern(query.search);
  const role = ROLE_CODES.includes(query.role) ? query.role : null;
  const status = STATUSES.includes(query.status) ? query.status : null;
  const classId = /^\d{1,15}$/.test(String(query.classId ?? '')) ? Number(query.classId) : null;
  return { search: search || null, role, status, classId };
}

// The current school year: the one containing today, otherwise the latest one.
// ASSUMPTION: "current" is decided by the school_years dates; FE-04 may add an explicit current year later.
const CURRENT_YEAR_SQL = `(SELECT school_year_id FROM school_years
                           ORDER BY (CURRENT_DATE BETWEEN start_date AND end_date) DESC, start_date DESC LIMIT 1)`;

// Classes of the current school year, for the class filter of SCR-59.
export async function listClassOptions() {
  const { rows } = await pool.query(
    `SELECT c.class_id AS id, c.class_name AS name, g.grade_level_name AS "gradeLevel"
     FROM classes c JOIN grade_levels g ON g.grade_level_id = c.grade_level_id
     WHERE c.deleted_at IS NULL AND c.school_year_id = ${CURRENT_YEAR_SQL}
     ORDER BY g.grade_level_name, c.class_name`,
  );
  return { items: rows };
}

// One SQL for the list and the export. $1 search, $2 role, $3 status, $4 / $5 letters for translate(), $6 limit, $7 offset,
// $8 class. A class matches its students (still STUDYING), their parents (student_parents) and its homeroom teacher.
// "classNames" lists the same links for the current school year.
const LIST_SQL = `
  SELECT u.user_id AS id, u.username, u.full_name AS "fullName", u.email, u.phone, u.status,
         u.must_change_password AS "mustChangePassword",
         COALESCE(u.locked_until > NOW(), FALSE) AS "tempLocked",
         u.created_at AS "createdAt",
         COALESCE(ARRAY(SELECT r.role_code FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
                        WHERE ur.user_id = u.user_id ORDER BY r.role_id), '{}') AS roles,
         COALESCE(s.student_code, t.teacher_code) AS code, s.student_code AS "studentCode", t.teacher_code AS "teacherCode",
         u.address, s.dob, s.gender, t.department, p.occupation,
         (SELECT string_agg(DISTINCT c.class_name, ', ' ORDER BY c.class_name)
          FROM classes c
          WHERE c.deleted_at IS NULL AND c.school_year_id = ${CURRENT_YEAR_SQL}
            AND (c.homeroom_teacher_id = t.teacher_id
                 OR EXISTS (SELECT 1 FROM class_enrollments e
                            WHERE e.class_id = c.class_id AND e.status = 'STUDYING'
                              AND (e.student_id = s.student_id
                                   OR e.student_id IN (SELECT sp.student_id FROM student_parents sp
                                                       WHERE sp.parent_id = p.parent_id))))) AS "classNames",
         -- A parent's children with their class of the current school year (export of parent accounts).
         (SELECT string_agg(cu.full_name || COALESCE(' – ' || (
                   SELECT c.class_name FROM class_enrollments e JOIN classes c ON c.class_id = e.class_id
                   WHERE e.student_id = sp.student_id AND e.status = 'STUDYING' AND c.deleted_at IS NULL
                     AND c.school_year_id = ${CURRENT_YEAR_SQL}
                   LIMIT 1), ''), '; ' ORDER BY cu.full_name)
          FROM student_parents sp JOIN students cs ON cs.student_id = sp.student_id
          JOIN users cu ON cu.user_id = cs.user_id
          WHERE sp.parent_id = p.parent_id) AS children,
         COUNT(*) OVER() AS total
  FROM users u
  LEFT JOIN students s ON s.user_id = u.user_id
  LEFT JOIN teachers t ON t.user_id = u.user_id
  LEFT JOIN parents p ON p.user_id = u.user_id
  WHERE ($1::text IS NULL
         OR lower(translate(u.full_name, $4, $5)) LIKE $1
         OR u.username LIKE $1
         OR LOWER(COALESCE(u.email, '')) LIKE $1
         OR COALESCE(u.phone, '') LIKE $1
         OR LOWER(COALESCE(s.student_code, t.teacher_code, '')) LIKE $1)
    AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
                                     WHERE ur.user_id = u.user_id AND r.role_code = $2))
    AND ($3::text IS NULL OR u.status = $3)
    AND ($8::bigint IS NULL
         OR EXISTS (SELECT 1 FROM classes c WHERE c.class_id = $8 AND c.homeroom_teacher_id = t.teacher_id)
         OR EXISTS (SELECT 1 FROM class_enrollments e
                    WHERE e.class_id = $8 AND e.status = 'STUDYING'
                      AND (e.student_id = s.student_id
                           OR e.student_id IN (SELECT sp.student_id FROM student_parents sp WHERE sp.parent_id = p.parent_id))))
  ORDER BY u.created_at DESC, u.user_id DESC
  LIMIT $6 OFFSET $7`;

async function queryAccounts(filters, limit, offset) {
  const { rows } = await pool.query(LIST_SQL, [
    filters.search,
    filters.role,
    filters.status,
    VI_TRANSLATE.from,
    VI_TRANSLATE.to,
    limit,
    offset,
    filters.classId,
  ]);
  return rows;
}

// UC-97 View Account List: search by name / username / email / phone / code, filter by role, status and class.
export async function listAccounts(query) {
  const filters = readFilters(query);
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const rows = await queryAccounts(filters, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  return {
    items: rows.map(({ total, ...r }) => r),
    total: rows[0]?.total ?? 0,
    page,
    pageSize: PAGE_SIZE,
  };
}

const ROLE_TEXT = {
  SYSTEM_ADMIN: 'Quản trị hệ thống',
  SCHOOL_MANAGER: 'Quản lý nhà trường',
  TEACHER: 'Giáo viên',
  STUDENT: 'Học sinh',
  PARENT: 'Phụ huynh',
};

const GENDER_TEXT = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };
const dmy = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');

// UC-98 Export Account List: every matching account (not only one page). No passwords – they are only hashes.
// With a role (the account pages, 23/11/2026) the file has only that type's columns: first the columns of its import
// template, same headers and order (so the file can be filled in and imported again), then the class (students),
// the children (parents), username, status, temporary password and creation date. Without a role: every column.
// A School Manager exports student, teacher or parent accounts only (scope.js).
const ROLE_FILE = { STUDENT: 'hoc-sinh', TEACHER: 'giao-vien', PARENT: 'phu-huynh', SCHOOL_MANAGER: 'quan-ly', SYSTEM_ADMIN: 'quan-tri' };
const ACCOUNT_COLUMNS = [
  { header: 'Tên đăng nhập', key: 'username', width: 18 },
  { header: 'Trạng thái', key: 'status', width: 14 },
  { header: 'Phải đổi mật khẩu', key: 'mustChange', width: 18 },
  { header: 'Ngày tạo', key: 'createdAt', width: 12 },
];
const EXTRA_COLUMNS = {
  STUDENT: [{ header: 'Lớp', key: 'classNames', width: 12 }],
  PARENT: [{ header: 'Con (lớp)', key: 'children', width: 40 }],
};
const ALL_COLUMNS = [
  { header: 'Tên đăng nhập', key: 'username', width: 18 },
  { header: 'Họ và tên', key: 'fullName', width: 28 },
  { header: 'Vai trò', key: 'roles', width: 26 },
  { header: 'Mã HS/GV', key: 'code', width: 14 },
  { header: 'Lớp', key: 'classNames', width: 14 },
  { header: 'Ngày sinh', key: 'dob', width: 12 },
  { header: 'Giới tính', key: 'gender', width: 10 },
  { header: 'Tổ chuyên môn', key: 'department', width: 20 },
  { header: 'Nghề nghiệp', key: 'occupation', width: 20 },
  { header: 'Email', key: 'email', width: 30 },
  { header: 'Số điện thoại', key: 'phone', width: 16, style: { numFmt: '@' } },
  { header: 'Địa chỉ', key: 'address', width: 40 },
  { header: 'Trạng thái', key: 'status', width: 14 },
  { header: 'Phải đổi mật khẩu', key: 'mustChange', width: 18 },
  { header: 'Ngày tạo', key: 'createdAt', width: 12 },
];

function columnsFor(role) {
  if (!role) return ALL_COLUMNS;
  // System Admin accounts have no template: same columns as School Manager accounts.
  const template = TEMPLATES[role] ?? TEMPLATES.SCHOOL_MANAGER;
  const own = template.columns.map((c) => ({
    header: COL[c].header,
    key: c,
    width: COL[c].width,
    ...(COL[c].text ? { style: { numFmt: '@' } } : {}),
  }));
  return [...own, ...(EXTRA_COLUMNS[role] ?? []), ...ACCOUNT_COLUMNS];
}

export async function exportAccounts(query, actor = null) {
  const filters = readFilters(query);
  if (isSchoolManager(actor) && !SCHOOL_ROLES.includes(filters.role)) throw forbidden();
  const rows = await queryAccounts(filters, EXPORT_LIMIT, 0);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Tai khoan');
  ws.columns = [{ header: 'STT', key: 'no', width: 6 }, ...columnsFor(filters.role)];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  rows.forEach((r, i) =>
    ws.addRow({
      no: i + 1,
      username: r.username,
      fullName: r.fullName,
      roles: r.roles.map((c) => ROLE_TEXT[c] ?? c).join(', '),
      code: r.code ?? '',
      studentCode: r.studentCode ?? '',
      teacherCode: r.teacherCode ?? '',
      classNames: r.classNames ?? '',
      children: r.children ?? '',
      dob: dmy(r.dob),
      gender: GENDER_TEXT[r.gender] ?? '',
      department: r.department ?? '',
      occupation: r.occupation ?? '',
      email: r.email ?? '',
      phone: r.phone ?? '',
      address: r.address ?? '',
      status: r.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khoá',
      mustChange: r.mustChangePassword ? 'Có' : 'Không',
      createdAt: dmy(r.createdAt),
    }),
  );
  const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).replaceAll('-', '');
  return {
    fileName: filters.role ? `tai-khoan-${ROLE_FILE[filters.role]}-${date}.xlsx` : `educonnect-accounts-${date}.xlsx`,
    contentType: XLSX_MIME,
    buffer: await workbookBuffer(wb),
  };
}

// ---------------------------------------------------------------- detail (SCR-60)

function readId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound('NOT_FOUND', 'Account not found.');
  return id;
}

// Account with its roles; 404 when it does not exist.
async function loadAccount(db, id) {
  const { rows } = await db.query(
    `SELECT u.user_id AS id, u.username, u.full_name AS "fullName", u.email, u.phone, u.avatar_url AS "avatarUrl",
            u.address, u.status, u.must_change_password AS "mustChangePassword", u.failed_login_count AS "failedLoginCount",
            CASE WHEN u.locked_until > NOW() THEN u.locked_until END AS "lockedUntil",
            COALESCE(u.locked_until > NOW(), FALSE) AS "tempLocked",
            u.created_at AS "createdAt", u.updated_at AS "updatedAt",
            COALESCE(ARRAY(SELECT r.role_code FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
                           WHERE ur.user_id = u.user_id ORDER BY r.role_id), '{}') AS roles,
            (SELECT json_build_object('id', q.request_id, 'reason', q.reason, 'createdAt', q.created_at)
             FROM password_reset_requests q WHERE q.user_id = u.user_id AND q.status = 'PENDING') AS "pendingResetRequest"
     FROM users u WHERE u.user_id = $1`,
    [id],
  );
  if (!rows.length) throw notFound('NOT_FOUND', 'Account not found.');
  return rows[0];
}

// School Manager (23/11/2026): student, teacher and parent accounts only, for the email / phone edit.
export async function getAccount(idParam, actor = null) {
  const id = readId(idParam);
  const account = await loadAccount(pool, id);
  assertScope(actor, account);
  const [student, teacher, parent, lastLogin] = await Promise.all([
    pool.query('SELECT student_code AS code, dob, gender FROM students WHERE user_id = $1', [id]),
    pool.query('SELECT teacher_code AS code, department FROM teachers WHERE user_id = $1', [id]),
    pool.query('SELECT occupation FROM parents WHERE user_id = $1', [id]),
    pool.query(
      `SELECT MAX(created_at) AS at FROM activity_logs WHERE user_id = $1 AND action = 'LOGIN_SUCCESS'`,
      [id],
    ),
  ]);
  return {
    ...account,
    student: student.rows[0] ?? null,
    teacher: teacher.rows[0] ?? null,
    parent: parent.rows[0] ?? null,
    lastLoginAt: lastLogin.rows[0]?.at ?? null,
  };
}

// ---------------------------------------------------------------- UC-99 Update Account (SCR-62)
// System Admin edits the username and the fields an import file carries (UC-96 templates): full name, email, phone,
// address, and per role the student code / date of birth / gender, the teacher code / department, the parent's
// occupation. Nothing else: class, parent links, subjects and assignments stay with the School Manager (decided
// 22/11/2026 with the supervisor). Same checks as UC-95 (readAccountInput) plus the username rule.
// School Manager (23/11/2026, supervisor's request, option a): email and phone of student, teacher and parent
// accounts only; every other field keeps its value (the rest of the profile is edited on FE-02 / FE-03 / FE-14).

const throwFieldErrors = (fields) => {
  throw badRequest('MSG_ACCOUNT_INVALID', 'Some fields are missing or invalid.', { fields });
};
const same = (a, b) => (a ?? null) === (b ?? null);
const isoDate = (value) => (value ? String(value).slice(0, 10) : null);

// The current values in the shape of the request body (used for the fields a School Manager may not change).
function bodyOf(a) {
  return {
    username: a.username,
    fullName: a.fullName,
    email: a.email,
    phone: a.phone,
    address: a.address,
    student: a.student && { studentCode: a.student.code, dob: isoDate(a.student.dob), gender: a.student.gender },
    teacher: a.teacher && { teacherCode: a.teacher.code, departmentId: null, department: a.teacher.department },
    parent: a.parent && { occupation: a.parent.occupation },
  };
}

export async function updateAccount({ idParam, body: sent = {}, actor = null }) {
  const id = readId(idParam);
  const before = await getAccount(id, actor);
  const body = isSchoolManager(actor) ? { ...bodyOf(before), email: sent.email, phone: sent.phone } : sent;

  // Roles never change here: readAccountInput reads only the profile parts of the account's own roles.
  // The account's own codes stay valid even in the older 4-digit format (business-rules §3, 27/11/2026).
  const keep = { studentCode: before.student?.code, teacherCode: before.teacher?.code };
  const { input, errors } = readAccountInput({ ...body, roles: before.roles }, { keep });
  delete errors.roles;
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  if (!username) errors.username = 'REQUIRED';
  else if (!isValidUsername(username) || username.includes('@')) errors.username = 'INVALID';
  // A department name kept as it is (maybe no longer in FE-03's list) is not checked again.
  const keepsDepartment =
    input.teacher && input.teacher.departmentId == null && same(input.teacher.department, before.teacher?.department);
  if (keepsDepartment) delete input.teacher.departmentId;
  else if (needsDepartments(input)) applyDepartment(input, errors, await listDepartments());
  if (Object.keys(errors).length) throwFieldErrors(errors);

  const { student: s, teacher: t, parent: p } = input;
  const unchanged =
    username === before.username &&
    same(input.fullName, before.fullName) &&
    same(input.email, before.email?.toLowerCase()) &&
    same(input.phone, before.phone) &&
    same(input.address, before.address) &&
    (!s || (same(s.studentCode, before.student?.code) && same(s.dob, isoDate(before.student?.dob)) && same(s.gender, before.student?.gender))) &&
    (!t || (same(t.teacherCode, before.teacher?.code) && same(t.department, before.teacher?.department))) &&
    (!p || same(p.occupation, before.parent?.occupation));
  if (unchanged) throw badRequest('MSG_NOTHING_CHANGED', 'Nothing was changed.');

  const duplicates = await findDuplicates(pool, input, id);
  const { rows } = await pool.query('SELECT EXISTS (SELECT 1 FROM users WHERE username = $1 AND user_id <> $2) AS used', [
    username,
    id,
  ]);
  if (rows[0].used) duplicates.username = 'DUPLICATE';
  if (Object.keys(duplicates).length) throwFieldErrors(duplicates);

  try {
    await withTransaction(async (db) => {
      await db.query('UPDATE users SET username = $1, full_name = $2, email = $3, phone = $4, address = $5 WHERE user_id = $6', [
        username,
        input.fullName,
        input.email,
        input.phone,
        input.address,
        id,
      ]);
      if (s) {
        await db.query('UPDATE students SET student_code = $1, dob = $2, gender = $3 WHERE user_id = $4', [
          s.studentCode,
          s.dob,
          s.gender,
          id,
        ]);
      }
      if (t) await db.query('UPDATE teachers SET teacher_code = $1, department = $2 WHERE user_id = $3', [t.teacherCode, t.department, id]);
      if (p) await db.query('UPDATE parents SET occupation = $1 WHERE user_id = $2', [p.occupation, id]);
    });
  } catch (err) {
    if (err.code === '23505') {
      // Taken by another account in the meantime.
      const taken = await findDuplicates(pool, input, id);
      if (/username/.test(err.constraint ?? '')) taken.username = 'DUPLICATE';
      if (Object.keys(taken).length) throwFieldErrors(taken);
    }
    throw err;
  }
  return getAccount(id);
}

// ---------------------------------------------------------------- UC-100 / UC-101 (System Admin and School Manager)

// School Manager acts only on accounts without the System Admin or School Manager role (permissions note 1).
// `actor` null = an internal call (no check).
function assertScope(actor, account) {
  if (!actor || actor.activeRole === 'SYSTEM_ADMIN') return;
  if (!(isSchoolManager(actor) && onlySchoolRoles(account.roles))) throw forbidden();
}

const stateError = (message) => new AppError(409, 'MSG_ACCOUNT_STATE', message);

// UC-100 Reset Password: random temporary password shown once; clears the temporary sign-in lock and unused OTPs.
export async function resetPassword({ idParam, actor, ip }) {
  const id = readId(idParam);
  const account = await loadAccount(pool, id);
  assertScope(actor, account);

  const temporaryPassword = generateTemporaryPassword({ username: account.username, phone: account.phone });
  const hash = await hashPassword(temporaryPassword);
  let requestClosed = false;
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET password_hash = $1, must_change_password = TRUE, failed_login_count = 0, locked_until = NULL
       WHERE user_id = $2`,
      [hash, id],
    );
    await client.query(
      `UPDATE password_reset_otps SET expires_at = NOW() WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [id],
    );
    // business-rules §3 (27/10): resetting answers the account's pending password reset request (marked DONE); the
    // one-time password issued with the request no longer works, so its stored copy is cleared.
    const { rowCount } = await client.query(
      `UPDATE password_reset_requests SET status = 'DONE', handled_by = $2, handled_at = NOW(), temp_password_enc = NULL
       WHERE user_id = $1 AND status = 'PENDING'`,
      [id, actor.userId],
    );
    requestClosed = rowCount > 0;
  });
  await logActivity({
    userId: actor.userId,
    action: 'PASSWORD_RESET',
    targetType: 'USER',
    targetId: id,
    detail: { by: actor.activeRole, username: account.username, ...(requestClosed ? { fromRequest: true } : {}) },
    ip,
  });
  return {
    account: { id, username: account.username, fullName: account.fullName, status: account.status, pendingResetRequest: null },
    temporaryPassword,
    requestClosed,
  };
}

// UC-101 Lock: the user can no longer sign in; nothing is deleted. A locked teacher is announced to every School
// Manager so they reassign homeroom and teaching (business-rules §3).
export async function lockAccount({ idParam, actor, reason, ip }) {
  const id = readId(idParam);
  const account = await loadAccount(pool, id);
  assertScope(actor, account);
  if (id === actor.userId) throw forbidden('MSG_CANNOT_LOCK_SELF', 'You cannot lock your own account.');
  if (account.status === 'LOCKED') throw stateError('The account is already locked.');
  const why = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 255) : null;

  await withTransaction(async (client) => {
    await client.query(`UPDATE users SET status = 'LOCKED' WHERE user_id = $1`, [id]);
    if (account.roles.includes('TEACHER')) {
      const { rows } = await client.query(
        `INSERT INTO notifications (type, title, detail, is_personal, target_type, target_id, created_by)
         VALUES ('SYSTEM', $1, $2, TRUE, 'USER', $3, $4) RETURNING notification_id`,
        [
          `Tài khoản giáo viên ${account.fullName} đã bị khoá`,
          'Vui lòng phân công lại giáo viên chủ nhiệm và giáo viên bộ môn cho các lớp của giáo viên này.',
          id,
          actor.userId,
        ],
      );
      await client.query(
        // FE-09 (Quoc, 18/11/2026): shown under the SCHOOL_MANAGER role (notification_recipients.role_code).
        `INSERT INTO notification_recipients (notification_id, user_id, role_code)
         SELECT $1, u.user_id, 'SCHOOL_MANAGER' FROM users u
         JOIN user_roles ur ON ur.user_id = u.user_id JOIN roles r ON r.role_id = ur.role_id
         WHERE r.role_code = 'SCHOOL_MANAGER' AND u.status = 'ACTIVE'`,
        [rows[0].notification_id],
      );
    }
  });
  await logActivity({
    userId: actor.userId,
    action: 'ACCOUNT_LOCK',
    targetType: 'USER',
    targetId: id,
    detail: { by: actor.activeRole, username: account.username, reason: why },
    ip,
  });
  return loadAccount(pool, id);
}

// UC-101 Unlock: ACTIVE again; also clears any temporary sign-in lock.
export async function unlockAccount({ idParam, actor, ip }) {
  const id = readId(idParam);
  const account = await loadAccount(pool, id);
  assertScope(actor, account);
  if (account.status !== 'LOCKED') throw stateError('The account is not locked.');
  await pool.query(
    `UPDATE users SET status = 'ACTIVE', failed_login_count = 0, locked_until = NULL WHERE user_id = $1`,
    [id],
  );
  await logActivity({
    userId: actor.userId,
    action: 'ACCOUNT_UNLOCK',
    targetType: 'USER',
    targetId: id,
    detail: { by: actor.activeRole, username: account.username, type: 'ACCOUNT' },
    ip,
  });
  return loadAccount(pool, id);
}

// UC-101 alternative 1b: clear the automatic lock after too many wrong passwords.
export async function clearTemporaryLock({ idParam, actor, ip }) {
  const id = readId(idParam);
  const account = await loadAccount(pool, id);
  assertScope(actor, account);
  if (!account.tempLocked) throw stateError('The account has no temporary sign-in lock.');
  await pool.query('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE user_id = $1', [id]);
  await logActivity({
    userId: actor.userId,
    action: 'ACCOUNT_UNLOCK',
    targetType: 'USER',
    targetId: id,
    detail: { by: actor.activeRole, username: account.username, type: 'TEMPORARY' },
    ip,
  });
  return loadAccount(pool, id);
}

// Account status for the reset / lock buttons on School Manager screens (FE-02, FE-03, FE-14 detail pages).
export async function getSecurityState({ idParam, actor }) {
  const account = await loadAccount(pool, readId(idParam));
  assertScope(actor, account);
  const { id, username, fullName, phone, status, tempLocked, lockedUntil, mustChangePassword, roles, pendingResetRequest } =
    account;
  return { id, username, fullName, phone, status, tempLocked, lockedUntil, mustChangePassword, roles, pendingResetRequest };
}

// ---------------------------------------------------------------- add a role (24/11/2026, option 2)
// An account is created or imported with the one role of its page; a combinable role is added afterwards from the
// account detail (System Admin) or the teacher / parent detail page (School Manager). Roles are only added, never
// removed (user_roles has no soft delete). Business rules §1: Student and System Admin stand alone; other roles combine.
// System Admin adds Teacher, Parent or School Manager; School Manager adds Teacher or Parent to a teacher / parent
// account (scope.js). The role profile is created in the same transaction: a teacher code (+ department), a parent
// occupation and a phone number (required for a parent, typed here when the account has none).

export const ADDABLE_ROLES = ['TEACHER', 'PARENT', 'SCHOOL_MANAGER'];

// Roles the actor may add to an account with `roles` (empty: none). Shared with the client rule in profileKinds.js.
export function addableRoles(roles, actor) {
  if (roles.some((r) => r === 'STUDENT' || r === 'SYSTEM_ADMIN')) return [];
  const allowed = isSchoolManager(actor) ? ['TEACHER', 'PARENT'] : ADDABLE_ROLES;
  return allowed.filter((r) => !roles.includes(r));
}

export async function addRole({ idParam, body = {}, actor, ip }) {
  const id = readId(idParam);
  const account = await loadAccount(pool, id);
  assertScope(actor, account);
  const role = body.role;
  if (!ADDABLE_ROLES.includes(role)) throw badRequest('MSG_ACCOUNT_INVALID', 'Some fields are missing or invalid.', { fields: { role: 'INVALID' } });
  if (isSchoolManager(actor) && role === 'SCHOOL_MANAGER') throw forbidden();
  const fail = (fields) => {
    throw badRequest('MSG_ACCOUNT_INVALID', 'Some fields are missing or invalid.', { fields });
  };
  if (account.roles.includes(role)) fail({ role: 'ALREADY_ASSIGNED' });
  if (!addableRoles(account.roles, actor).includes(role)) fail({ role: 'EXCLUSIVE' });

  // Same field rules as UC-95 for the new role's profile; the phone is the account's unless it has none.
  const newPhone = !account.phone && role === 'PARENT';
  const { input, errors } = readAccountInput({
    fullName: account.fullName,
    roles: [role],
    phone: newPhone ? body.phone : account.phone,
    teacher: body.teacher,
    parent: body.parent,
  });
  if (!newPhone) delete errors.phone;
  if (needsDepartments(input)) applyDepartment(input, errors, await listDepartments());
  if (Object.keys(errors).length) fail(errors);
  const duplicates = await findDuplicates(pool, { email: null, phone: newPhone ? input.phone : null, teacher: input.teacher }, id);
  if (Object.keys(duplicates).length) fail(duplicates);

  try {
    await withTransaction(async (client) => {
      // FOR UPDATE: two admins adding a role to the same account at once are applied one after the other.
      const { rows } = await client.query(
        `SELECT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
                        WHERE ur.user_id = u.user_id AND r.role_code = $2) AS has
         FROM users u WHERE u.user_id = $1 FOR UPDATE`,
        [id, role],
      );
      if (rows[0].has) fail({ role: 'ALREADY_ASSIGNED' });
      await client.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, role_id FROM roles WHERE role_code = $2', [id, role]);
      if (input.teacher) {
        await client.query('INSERT INTO teachers (user_id, teacher_code, department) VALUES ($1, $2, $3)', [
          id, input.teacher.teacherCode, input.teacher.department,
        ]);
      }
      if (input.parent) await client.query('INSERT INTO parents (user_id, occupation) VALUES ($1, $2)', [id, input.parent.occupation]);
      if (newPhone) await client.query('UPDATE users SET phone = $2, updated_at = NOW() WHERE user_id = $1', [id, input.phone]);
      // Teachers and School Managers are in the school teacher group (business-rules §4), as at creation.
      if (needsSchoolGroup([role])) await joinSchoolGroup(client, [id]);
    });
  } catch (err) {
    if (err.code === '23505') {
      const taken = await findDuplicates(pool, { email: null, phone: newPhone ? input.phone : null, teacher: input.teacher }, id);
      if (Object.keys(taken).length) fail(taken);
    }
    throw err;
  }

  await logActivity({
    userId: actor.userId,
    action: 'ROLE_CHANGE',
    targetType: 'USER',
    targetId: id,
    detail: { added: role, roles: [...account.roles, role] },
    ip,
  });
  return getAccount(String(id), actor);
}

// ---------------------------------------------------------------- password reset requests (business-rules §3, 27/10)
// Users who cannot use the OTP email send a request from the Forgot Password screen (FE-01). The system issues a
// one-time password at once (resetRequests.js). System Admin sees every request, School Manager those of student /
// parent / teacher accounts; they read the password and hand it over. The request is DONE when the user signs in
// (or an admin resets the password from the account page). No accept / reject step (31/10/2026).

const REQUEST_STATUSES = ['PENDING', 'DONE'];

// School Manager sees only requests of accounts without the System Admin / School Manager role.
const SM_SCOPE_SQL = `NOT EXISTS (SELECT 1 FROM user_roles ur2 JOIN roles r2 ON r2.role_id = ur2.role_id
                                  WHERE ur2.user_id = u.user_id AND r2.role_code IN ('SYSTEM_ADMIN', 'SCHOOL_MANAGER'))`;

export async function listResetRequests({ query = {}, actor }) {
  const status = REQUEST_STATUSES.includes(query.status) ? query.status : 'PENDING';
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const { rows } = await pool.query(
    `SELECT q.request_id AS id, q.reason, q.status, q.created_at AS "createdAt", q.handled_at AS "handledAt",
            q.temp_password_enc AS "sealed", q.delivery,
            u.user_id AS "userId", u.username, u.full_name AS "fullName", u.email, u.phone, u.status AS "accountStatus",
            COALESCE(ARRAY(SELECT r.role_code FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
                           WHERE ur.user_id = u.user_id ORDER BY r.role_id), '{}') AS roles,
            COALESCE(s.student_code, t.teacher_code) AS code,
            h.full_name AS "handledByName",
            COUNT(*) OVER() AS total
     FROM password_reset_requests q
     JOIN users u ON u.user_id = q.user_id
     LEFT JOIN students s ON s.user_id = u.user_id
     LEFT JOIN teachers t ON t.user_id = u.user_id
     LEFT JOIN users h ON h.user_id = q.handled_by
     WHERE q.status = $1 AND ($2::boolean OR ${SM_SCOPE_SQL})
     ORDER BY CASE WHEN q.status = 'PENDING' AND q.delivery = 'SCHOOL' THEN 0 ELSE 1 END,
              CASE WHEN q.status = 'PENDING' THEN q.created_at END ASC, q.handled_at DESC NULLS LAST, q.request_id DESC
     LIMIT $3 OFFSET $4`,
    [status, actor.activeRole === 'SYSTEM_ADMIN', PAGE_SIZE, (page - 1) * PAGE_SIZE],
  );
  const { rows: count } = await pool.query(
    `SELECT COUNT(*) AS n FROM password_reset_requests q JOIN users u ON u.user_id = q.user_id
     WHERE q.status = 'PENDING' AND q.delivery = 'SCHOOL' AND ($1::boolean OR ${SM_SCOPE_SQL})`,
    [actor.activeRole === 'SYSTEM_ADMIN'],
  );
  return {
    // temporaryPassword: only while PENDING; null if it cannot be read (e.g. JWT_SECRET changed).
    items: rows.map(({ total, sealed, ...r }) => ({ ...r, temporaryPassword: r.status === 'PENDING' ? openSecret(sealed) : null })),
    total: rows[0]?.total ?? 0,
    pendingCount: count[0].n, // only the passwords still to hand over (delivery SCHOOL); emailed ones need no action
    status,
    page,
    pageSize: PAGE_SIZE,
  };
}
