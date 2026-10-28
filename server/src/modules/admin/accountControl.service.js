import ExcelJS from 'exceljs';
import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, forbidden, notFound } from '../../utils/AppError.js';
import { logActivity } from '../../utils/activityLog.js';
import { hashPassword } from '../../utils/password.js';
import { generateTemporaryPassword } from '../../utils/tempPassword.js';
import { isValidUsername, removeAccents } from '../../utils/username.js';
import { ROLE_CODES } from './accounts.service.js';

// FE-13 System Administration (owner: Linh) – account list and control:
// UC-94 View Account List, UC-95 Export Account List, UC-96 Update Login Identifiers,
// UC-97 Reset Password, UC-98 Lock / Unlock Account.

const PAGE_SIZE = 20;
const EXPORT_LIMIT = 10000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^0\d{9}$/; // same ASSUMPTION as UC-92
const STATUSES = ['ACTIVE', 'LOCKED'];
const SCHOOL_ROLES = ['TEACHER', 'STUDENT', 'PARENT']; // what School Manager may reset / lock (permissions note 1)

// Accent-insensitive search without the unaccent extension: translate() folds Vietnamese letters.
const VN_LETTERS = 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ';
const VN_FOLDED = removeAccents(VN_LETTERS);

// ---------------------------------------------------------------- UC-94 / UC-95 list

function readFilters(query = {}) {
  const search = typeof query.search === 'string' ? removeAccents(query.search.trim().toLowerCase()).slice(0, 100) : '';
  const role = ROLE_CODES.includes(query.role) ? query.role : null;
  const status = STATUSES.includes(query.status) ? query.status : null;
  return { search: search || null, role, status };
}

// One SQL for the list and the export. $1 search, $2 role, $3 status, $4 / $5 letters for translate(), $6 limit, $7 offset.
const LIST_SQL = `
  SELECT u.user_id AS id, u.username, u.full_name AS "fullName", u.email, u.phone, u.status,
         u.must_change_password AS "mustChangePassword",
         COALESCE(u.locked_until > NOW(), FALSE) AS "tempLocked",
         u.created_at AS "createdAt",
         COALESCE(ARRAY(SELECT r.role_code FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
                        WHERE ur.user_id = u.user_id ORDER BY r.role_id), '{}') AS roles,
         COALESCE(s.student_code, t.teacher_code) AS code,
         COUNT(*) OVER() AS total
  FROM users u
  LEFT JOIN students s ON s.user_id = u.user_id
  LEFT JOIN teachers t ON t.user_id = u.user_id
  WHERE ($1::text IS NULL
         OR translate(LOWER(u.full_name), $4, $5) LIKE '%' || $1 || '%'
         OR u.username LIKE '%' || $1 || '%'
         OR LOWER(COALESCE(u.email, '')) LIKE '%' || $1 || '%'
         OR COALESCE(u.phone, '') LIKE '%' || $1 || '%'
         OR LOWER(COALESCE(s.student_code, t.teacher_code, '')) LIKE '%' || $1 || '%')
    AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
                                     WHERE ur.user_id = u.user_id AND r.role_code = $2))
    AND ($3::text IS NULL OR u.status = $3)
  ORDER BY u.created_at DESC, u.user_id DESC
  LIMIT $6 OFFSET $7`;

async function queryAccounts(filters, limit, offset) {
  const { rows } = await pool.query(LIST_SQL, [
    filters.search,
    filters.role,
    filters.status,
    VN_LETTERS,
    VN_FOLDED,
    limit,
    offset,
  ]);
  return rows;
}

// UC-94 View Account List: search by name / username / email / phone / code, filter by role and status.
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

// UC-95 Export Account List: every matching account (not only one page). No passwords – they are only hashes.
export async function exportAccounts(query) {
  const rows = await queryAccounts(readFilters(query), EXPORT_LIMIT, 0);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Tai khoan');
  ws.columns = [
    { header: 'STT', key: 'no', width: 6 },
    { header: 'Tên đăng nhập', key: 'username', width: 18 },
    { header: 'Họ và tên', key: 'fullName', width: 28 },
    { header: 'Vai trò', key: 'roles', width: 26 },
    { header: 'Mã HS/GV', key: 'code', width: 14 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Số điện thoại', key: 'phone', width: 16, style: { numFmt: '@' } },
    { header: 'Trạng thái', key: 'status', width: 14 },
    { header: 'Phải đổi mật khẩu', key: 'mustChange', width: 18 },
    { header: 'Ngày tạo', key: 'createdAt', width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  rows.forEach((r, i) =>
    ws.addRow({
      no: i + 1,
      username: r.username,
      fullName: r.fullName,
      roles: r.roles.map((c) => ROLE_TEXT[c] ?? c).join(', '),
      code: r.code ?? '',
      email: r.email ?? '',
      phone: r.phone ?? '',
      status: r.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khoá',
      mustChange: r.mustChangePassword ? 'Có' : 'Không',
      createdAt: String(r.createdAt).slice(0, 10).split('-').reverse().join('/'),
    }),
  );
  const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).replaceAll('-', '');
  return {
    fileName: `educonnect-accounts-${date}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
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
            u.status, u.must_change_password AS "mustChangePassword", u.failed_login_count AS "failedLoginCount",
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

export async function getAccount(idParam) {
  const id = readId(idParam);
  const account = await loadAccount(pool, id);
  const [student, teacher, parent, lastLogin] = await Promise.all([
    pool.query('SELECT student_code AS code, dob, gender FROM students WHERE user_id = $1', [id]),
    pool.query('SELECT teacher_code AS code, department FROM teachers WHERE user_id = $1', [id]),
    pool.query('SELECT occupation, address FROM parents WHERE user_id = $1', [id]),
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

// ---------------------------------------------------------------- UC-96 Update Login Identifiers

export async function updateIdentifiers({ idParam, body = {} }) {
  const id = readId(idParam);
  const account = await loadAccount(pool, id);

  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : null;
  const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.replace(/[\s.-]/g, '') : null;

  const fields = {};
  if (!username) fields.username = 'REQUIRED';
  else if (!isValidUsername(username) || username.includes('@')) fields.username = 'INVALID';
  if (email && (!EMAIL_RE.test(email) || email.length > 150)) fields.email = 'INVALID';
  if (phone && !PHONE_RE.test(phone)) fields.phone = 'INVALID';
  if (!phone && account.roles.includes('PARENT')) fields.phone = 'REQUIRED_FOR_PARENT';
  if (Object.keys(fields).length) throw badRequest('MSG_ACCOUNT_INVALID', 'Some fields are missing or invalid.', { fields });

  if (username === account.username && email === (account.email?.toLowerCase() ?? null) && phone === account.phone) {
    throw badRequest('MSG_NOTHING_CHANGED', 'Nothing was changed.');
  }

  const { rows } = await pool.query(
    `SELECT
       EXISTS (SELECT 1 FROM users WHERE username = $1 AND user_id <> $4) AS username,
       EXISTS (SELECT 1 FROM users WHERE $2::text IS NOT NULL AND LOWER(email) = $2 AND user_id <> $4) AS email,
       EXISTS (SELECT 1 FROM users WHERE $3::text IS NOT NULL AND phone = $3 AND user_id <> $4) AS phone`,
    [username, email, phone, id],
  );
  for (const [field, used] of Object.entries(rows[0])) if (used) fields[field] = 'DUPLICATE';
  if (Object.keys(fields).length) throw badRequest('MSG_ACCOUNT_INVALID', 'Some fields are missing or invalid.', { fields });

  try {
    await pool.query('UPDATE users SET username = $1, email = $2, phone = $3 WHERE user_id = $4', [
      username,
      email,
      phone,
      id,
    ]);
  } catch (err) {
    if (err.code === '23505') {
      const field = /username/.test(err.constraint) ? 'username' : /email/.test(err.constraint) ? 'email' : 'phone';
      throw badRequest('MSG_ACCOUNT_INVALID', 'Some fields are missing or invalid.', { fields: { [field]: 'DUPLICATE' } });
    }
    throw err;
  }
  return getAccount(id);
}

// ---------------------------------------------------------------- UC-97 / UC-98 (System Admin and School Manager)

// School Manager acts only on accounts without the System Admin or School Manager role (permissions note 1).
function assertScope(actor, account) {
  if (actor.activeRole === 'SYSTEM_ADMIN') return;
  const inScope =
    actor.activeRole === 'SCHOOL_MANAGER' &&
    account.roles.length > 0 &&
    account.roles.every((r) => SCHOOL_ROLES.includes(r));
  if (!inScope) throw forbidden();
}

const stateError = (message) => new AppError(409, 'MSG_ACCOUNT_STATE', message);

// UC-97 Reset Password: random temporary password shown once; clears the temporary sign-in lock and unused OTPs.
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
    // business-rules §3 (27/10): resetting answers the account's pending password reset request (marked DONE).
    const { rowCount } = await client.query(
      `UPDATE password_reset_requests SET status = 'DONE', handled_by = $2, handled_at = NOW()
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

// UC-98 Lock: the user can no longer sign in; nothing is deleted. A locked teacher is announced to every School
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
        `INSERT INTO notification_recipients (notification_id, user_id)
         SELECT $1, u.user_id FROM users u
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

// UC-98 Unlock: ACTIVE again; also clears any temporary sign-in lock.
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

// UC-98 alternative 1b: clear the automatic lock after too many wrong passwords.
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
  const { id, username, fullName, status, tempLocked, lockedUntil, mustChangePassword, roles, pendingResetRequest } = account;
  return { id, username, fullName, status, tempLocked, lockedUntil, mustChangePassword, roles, pendingResetRequest };
}

// ---------------------------------------------------------------- password reset requests (business-rules §3, 27/10)
// Users who cannot use the OTP email send a request from the Forgot Password screen (FE-01). System Admin handles
// every request, School Manager those of student / parent / teacher accounts. Handling = UC-97 Reset Password
// (marks the request DONE, see resetPassword) or reject. Sending / rejecting is not logged; the reset is.

const REQUEST_STATUSES = ['PENDING', 'DONE', 'REJECTED'];

// School Manager sees only requests of accounts without the System Admin / School Manager role.
const SM_SCOPE_SQL = `NOT EXISTS (SELECT 1 FROM user_roles ur2 JOIN roles r2 ON r2.role_id = ur2.role_id
                                  WHERE ur2.user_id = u.user_id AND r2.role_code IN ('SYSTEM_ADMIN', 'SCHOOL_MANAGER'))`;

export async function listResetRequests({ query = {}, actor }) {
  const status = REQUEST_STATUSES.includes(query.status) ? query.status : 'PENDING';
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const { rows } = await pool.query(
    `SELECT q.request_id AS id, q.reason, q.status, q.created_at AS "createdAt", q.handled_at AS "handledAt",
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
     ORDER BY CASE WHEN q.status = 'PENDING' THEN q.created_at END ASC, q.handled_at DESC NULLS LAST, q.request_id DESC
     LIMIT $3 OFFSET $4`,
    [status, actor.activeRole === 'SYSTEM_ADMIN', PAGE_SIZE, (page - 1) * PAGE_SIZE],
  );
  const { rows: count } = await pool.query(
    `SELECT COUNT(*) AS n FROM password_reset_requests q JOIN users u ON u.user_id = q.user_id
     WHERE q.status = 'PENDING' AND ($1::boolean OR ${SM_SCOPE_SQL})`,
    [actor.activeRole === 'SYSTEM_ADMIN'],
  );
  return {
    items: rows.map(({ total, ...r }) => r),
    total: rows[0]?.total ?? 0,
    pendingCount: count[0].n,
    status,
    page,
    pageSize: PAGE_SIZE,
  };
}

// Reject: e.g. the identity could not be confirmed. The account itself is not changed.
export async function rejectResetRequest({ idParam, actor }) {
  const id = Number(idParam);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound('NOT_FOUND', 'Request not found.');
  const { rows } = await pool.query('SELECT user_id, status FROM password_reset_requests WHERE request_id = $1', [id]);
  if (!rows.length) throw notFound('NOT_FOUND', 'Request not found.');
  assertScope(actor, await loadAccount(pool, rows[0].user_id));
  const { rowCount } = await pool.query(
    `UPDATE password_reset_requests SET status = 'REJECTED', handled_by = $2, handled_at = NOW()
     WHERE request_id = $1 AND status = 'PENDING'`,
    [id, actor.userId],
  );
  if (!rowCount) throw new AppError(409, 'MSG_REQUEST_HANDLED', 'This request has already been handled.');
  return { id, status: 'REJECTED' };
}
