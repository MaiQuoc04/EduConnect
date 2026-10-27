import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, forbidden, unauthorized } from '../../utils/AppError.js';
import { logActivity } from '../../utils/activityLog.js';
import { sendMail } from '../../utils/mailer.js';
import { assertNewPassword, hashPassword } from '../../utils/password.js';
import { getNumberSetting } from '../../utils/settings.js';
import { signAccessToken, signPurposeToken, verifyPurposeToken } from '../../utils/token.js';

const OTP_MAX_ATTEMPTS = 5; // business-rules §3: invalid after 5 wrong attempts
const RESET_TOKEN_TTL = '10m';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getRoles(userId) {
  const [rows] = await pool.query(
    `SELECT r.role_code FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
     WHERE ur.user_id = ? ORDER BY r.role_id`,
    [userId],
  );
  return rows.map((r) => r.role_code);
}

async function isUnderMaintenance() {
  const [rows] = await pool.query(
    `SELECT 1 FROM maintenance_announcements
     WHERE deleted_at IS NULL AND NOW() BETWEEN start_at AND end_at LIMIT 1`,
  );
  return rows.length > 0;
}

// UC-01 Sign In: email, phone number or username + password.
// Rules (Report 3 / ERD 1e, 7e, 7g): LOCKED accounts cannot sign in; after N wrong passwords the account is
// locked for 5, 10, 15… minutes (max 30); one correct sign-in resets the counter; during maintenance only
// System Admin can sign in. A temporary password (must_change_password) is carried in the token so the API
// only allows changing it (see requireAuth).
export async function signIn({ identifier, password, ip }) {
  if (!identifier || !password) throw badRequest('MSG_REQUIRED', 'Please enter your sign-in name and password.');

  const [users] = await pool.query(
    `SELECT user_id, username, full_name, avatar_url, password_hash, status, must_change_password, failed_login_count,
            (locked_until > NOW()) AS is_temp_locked,
            CEIL(EXTRACT(EPOCH FROM (locked_until - NOW())) / 60)::int AS lock_minutes_left
     FROM users WHERE username = ? OR email = ? OR phone = ? LIMIT 1`,
    [identifier, identifier, identifier],
  );
  const user = users[0];
  if (!user) {
    await logActivity({ action: 'LOGIN_FAILED', detail: { identifier }, ip });
    throw unauthorized('MSG_LOGIN_FAILED', 'Incorrect sign-in name or password.');
  }

  if (user.status === 'LOCKED') throw forbidden('MSG_ACCOUNT_LOCKED', 'Your account is locked. Please contact the school.');

  const roles = await getRoles(user.user_id);
  if (!roles.includes('SYSTEM_ADMIN') && (await isUnderMaintenance())) {
    throw new AppError(503, 'MSG_MAINTENANCE', 'The system is under maintenance. Please try again later.');
  }

  if (user.is_temp_locked) {
    throw new AppError(423, 'MSG_TEMP_LOCKED', `Too many wrong attempts. Try again in ${user.lock_minutes_left} minute(s).`, {
      minutesLeft: Number(user.lock_minutes_left),
    });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    const maxAttempts = await getNumberSetting('login.max_failed_attempts', 5);
    const step = await getNumberSetting('login.lock_minutes_step', 5);
    const maxMinutes = await getNumberSetting('login.lock_minutes_max', 30);
    const failed = user.failed_login_count + 1;
    const lockMinutes = failed % maxAttempts === 0 ? Math.min(step * (failed / maxAttempts), maxMinutes) : 0;
    await pool.query(
      `UPDATE users SET failed_login_count = ?,
              locked_until = CASE WHEN ? > 0 THEN NOW() + (? * INTERVAL '1 minute') ELSE locked_until END
       WHERE user_id = ?`,
      [failed, lockMinutes, lockMinutes, user.user_id],
    );
    await logActivity({ userId: user.user_id, action: 'LOGIN_FAILED', detail: { failed }, ip });
    throw unauthorized('MSG_LOGIN_FAILED', 'Incorrect sign-in name or password.');
  }

  await pool.query('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE user_id = ?', [user.user_id]);
  await logActivity({ userId: user.user_id, action: 'LOGIN_SUCCESS', ip });

  const activeRole = roles[0];
  const mustChangePassword = Boolean(user.must_change_password);
  return {
    token: signAccessToken({ userId: user.user_id, roles, activeRole, mustChangePassword }),
    user: {
      id: user.user_id,
      username: user.username,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
      mustChangePassword,
    },
    roles,
    activeRole,
  };
}

// Role switcher in the header (ERD 1b): issues a new token acting as another role the user has.
export async function switchRole({ userId, role, mustChangePassword }) {
  const roles = await getRoles(userId);
  if (!roles.includes(role)) throw forbidden('ROLE_NOT_ASSIGNED', 'You do not have this role.');
  return { token: signAccessToken({ userId, roles, activeRole: role, mustChangePassword }), roles, activeRole: role };
}

export async function getMe(userId) {
  const [rows] = await pool.query(
    `SELECT user_id AS id, username, full_name AS fullName, email, phone, avatar_url AS avatarUrl,
            must_change_password AS mustChangePassword
     FROM users WHERE user_id = ? AND status = 'ACTIVE'`,
    [userId],
  );
  if (!rows.length) throw unauthorized('AUTH_INVALID', 'Please sign in again.');
  return { ...rows[0], mustChangePassword: Boolean(rows[0].mustChangePassword) };
}

// ---------- UC-02 Reset Forgotten Password: email → 6-digit OTP (hashed, N minutes) → new password ----------

function validEmail(email) {
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    throw badRequest('MSG_INVALID_EMAIL', 'Please enter a valid email address.');
  }
  return email.trim();
}

// Step 1. Always answers the same way, so nobody can find out which emails have an account.
export async function requestPasswordOtp({ email, ip }) {
  email = validEmail(email);
  const expiryMinutes = await getNumberSetting('otp.expiry_minutes', 5);
  const [users] = await pool.query(
    `SELECT user_id, full_name, email FROM users WHERE email = ? AND status = 'ACTIVE' LIMIT 1`,
    [email],
  );
  const user = users[0];
  const result = { expiresInMinutes: expiryMinutes };
  if (!user) return result;

  // Expired OTPs are the only rows we hard delete (business-rules §14).
  await pool.query('DELETE FROM password_reset_otps WHERE expires_at < NOW() - INTERVAL \'1 day\'');

  // ASSUMPTION: at most one email per minute per account (anti-spam); a new code replaces the previous one.
  const [recent] = await pool.query(
    `SELECT 1 FROM password_reset_otps WHERE user_id = ? AND created_at > NOW() - INTERVAL '1 minute' LIMIT 1`,
    [user.user_id],
  );
  if (recent.length) return result;

  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await withTransaction(async (conn) => {
    await conn.query(
      `UPDATE password_reset_otps SET expires_at = NOW() WHERE user_id = ? AND used_at IS NULL AND expires_at > NOW()`,
      [user.user_id],
    );
    await conn.query(
      `INSERT INTO password_reset_otps (user_id, otp_hash, expires_at) VALUES (?, ?, NOW() + ($3 * INTERVAL '1 minute'))`,
      [user.user_id, await bcrypt.hash(otp, 10), expiryMinutes],
    );
  });

  await sendMail({
    to: user.email,
    subject: 'EduConnect – Mã xác thực đặt lại mật khẩu',
    text:
      `Xin chào ${user.full_name},\n\n` +
      `Mã xác thực để đặt lại mật khẩu EduConnect của bạn là: ${otp}\n` +
      `Mã có hiệu lực trong ${expiryMinutes} phút. Không chia sẻ mã này cho bất kỳ ai.\n\n` +
      'Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.',
    html:
      `<p>Xin chào ${escapeHtml(user.full_name)},</p>` +
      `<p>Mã xác thực để đặt lại mật khẩu EduConnect của bạn là:</p>` +
      `<p style="font-size:28px;font-weight:600;letter-spacing:6px;color:#4A2F85">${otp}</p>` +
      `<p>Mã có hiệu lực trong ${expiryMinutes} phút. Không chia sẻ mã này cho bất kỳ ai.</p>` +
      '<p>Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>',
  });
  await logActivity({ userId: user.user_id, action: 'PASSWORD_RESET', detail: { step: 'OTP_SENT' }, ip });
  return result;
}

// Step 2. A correct OTP returns a short-lived reset token; each wrong try counts, the 5th makes the OTP invalid.
export async function verifyPasswordOtp({ email, otp }) {
  email = validEmail(email);
  if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) throw badRequest('MSG_OTP_FORMAT', 'The code has 6 digits.');

  const [rows] = await pool.query(
    `SELECT o.otp_id, o.otp_hash, o.attempt_count, o.user_id
     FROM password_reset_otps o JOIN users u ON u.user_id = o.user_id
     WHERE u.email = ? AND u.status = 'ACTIVE' AND o.used_at IS NULL AND o.expires_at > NOW() AND o.attempt_count < ?
     ORDER BY o.created_at DESC LIMIT 1`,
    [email, OTP_MAX_ATTEMPTS],
  );  const row = rows[0];
  if (!row) throw badRequest('MSG_OTP_INVALID', 'The code is invalid or has expired. Please request a new code.');

  if (!(await bcrypt.compare(otp, row.otp_hash))) {
    const attempts = row.attempt_count + 1;
    await pool.query('UPDATE password_reset_otps SET attempt_count = ? WHERE otp_id = ?', [attempts, row.otp_id]);
    const attemptsLeft = OTP_MAX_ATTEMPTS - attempts;
    if (attemptsLeft <= 0) {
      throw badRequest('MSG_OTP_TOO_MANY', 'Too many wrong codes. Please request a new code.');
    }
    throw badRequest('MSG_OTP_WRONG', 'The code is not correct.', { attemptsLeft });
  }

  return { resetToken: signPurposeToken('PASSWORD_RESET', { userId: row.user_id, otpId: row.otp_id }, RESET_TOKEN_TTL) };
}

// Step 3. Sets the new password and uses up the OTP.
export async function resetPassword({ resetToken, newPassword, ip }) {
  const claims = verifyPurposeToken('PASSWORD_RESET', resetToken);
  if (!claims) throw badRequest('MSG_RESET_EXPIRED', 'The reset session has expired. Please start again.');

  const [rows] = await pool.query(
    `SELECT u.user_id, u.username, u.phone, u.password_hash
     FROM password_reset_otps o JOIN users u ON u.user_id = o.user_id
     WHERE o.otp_id = ? AND o.user_id = ? AND o.used_at IS NULL AND u.status = 'ACTIVE'`,
    [claims.otpId, claims.userId],
  );
  const user = rows[0];
  if (!user) throw badRequest('MSG_RESET_EXPIRED', 'The reset session has expired. Please start again.');

  await assertNewPassword(newPassword, user);
  const hash = await hashPassword(newPassword);
  await withTransaction(async (conn) => {
    await conn.query('UPDATE users SET password_hash = ?, must_change_password = FALSE WHERE user_id = ?', [hash, user.user_id]);
    await conn.query('UPDATE password_reset_otps SET used_at = NOW() WHERE otp_id = ?', [claims.otpId]);
  });
  await logActivity({ userId: user.user_id, action: 'PASSWORD_RESET', detail: { step: 'DONE' }, ip });
  return { ok: true };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
