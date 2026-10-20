import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../config/db.js';
import { env } from '../../config/env.js';
import { AppError, badRequest, forbidden, unauthorized } from '../../utils/AppError.js';
import { getNumberSetting } from '../../utils/settings.js';
import { logActivity } from '../../utils/activityLog.js';

function signToken(payload) {
  return jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn });
}

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
// System Admin can sign in.
export async function signIn({ identifier, password, ip }) {
  if (!identifier || !password) throw badRequest('MSG_REQUIRED', 'Please enter your sign-in name and password.');

  const [users] = await pool.query(
    `SELECT user_id, username, full_name, password_hash, status, must_change_password, failed_login_count,
            locked_until > NOW() AS is_temp_locked,
            CEIL(TIMESTAMPDIFF(SECOND, NOW(), locked_until) / 60) AS lock_minutes_left
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
              locked_until = IF(? > 0, NOW() + INTERVAL ? MINUTE, locked_until)
       WHERE user_id = ?`,
      [failed, lockMinutes, lockMinutes, user.user_id],
    );
    await logActivity({ userId: user.user_id, action: 'LOGIN_FAILED', detail: { failed }, ip });
    throw unauthorized('MSG_LOGIN_FAILED', 'Incorrect sign-in name or password.');
  }

  await pool.query('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE user_id = ?', [user.user_id]);
  await logActivity({ userId: user.user_id, action: 'LOGIN_SUCCESS', ip });

  const activeRole = roles[0];
  return {
    token: signToken({ userId: user.user_id, roles, activeRole }),
    user: {
      id: user.user_id,
      username: user.username,
      fullName: user.full_name,
      mustChangePassword: Boolean(user.must_change_password),
    },
    roles,
    activeRole,
  };
}

// Role switcher in the header (ERD 1b): issues a new token acting as another role the user has.
export async function switchRole({ userId, role }) {
  const roles = await getRoles(userId);
  if (!roles.includes(role)) throw forbidden('ROLE_NOT_ASSIGNED', 'You do not have this role.');
  return { token: signToken({ userId, roles, activeRole: role }), roles, activeRole: role };
}

export async function getMe(userId) {
  const [rows] = await pool.query(
    `SELECT user_id AS id, username, full_name AS fullName, email, phone, avatar_url AS avatarUrl,
            must_change_password AS mustChangePassword
     FROM users WHERE user_id = ?`,
    [userId],
  );
  if (!rows.length) throw unauthorized('AUTH_INVALID', 'Please sign in again.');
  return { ...rows[0], mustChangePassword: Boolean(rows[0].mustChangePassword) };
}
