import { pool } from '../../config/db.js';
import { hashPassword } from '../../utils/password.js';
import { seal } from '../../utils/secretBox.js';
import { generateTemporaryPassword } from '../../utils/tempPassword.js';

// FE-13 (owner: Linh) – the automatic reset of a password reset request, used by FE-01 (auth.service.js).
// Business rules §3 (agreed 01/11/2026):
// - A request whose sign-in name and full name match resets the password at once: the old password stops working,
//   the account must change its password at the next sign-in, a temporary sign-in lock is cleared.
// - Every reset is a request row: delivery EMAIL (password emailed by auth.service.js, nothing stored) or SCHOOL
//   (no email: System Admin / School Manager read the password on the requests page until the user signs in).
// - The request becomes DONE when the user signs in; the stored (encrypted) copy is then cleared.

// Inside the caller's transaction. `user` = { user_id, username, phone }. Returns the new temporary password.
export async function resetToTemporaryPassword(client, user) {
  const password = generateTemporaryPassword({ username: user.username, phone: user.phone });
  await client.query(
    `UPDATE users SET password_hash = $1, must_change_password = TRUE, failed_login_count = 0, locked_until = NULL
     WHERE user_id = $2`,
    [await hashPassword(password), user.user_id],
  );
  await client.query(
    `UPDATE password_reset_otps SET expires_at = NOW() WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [user.user_id],
  );
  return password;
}

// Account without an email: reset, then keep an encrypted copy on the request for SA / SM.
export async function issueRequestPassword(client, user, requestId) {
  const password = await resetToTemporaryPassword(client, user);
  await client.query('UPDATE password_reset_requests SET temp_password_enc = $1 WHERE request_id = $2', [
    seal(password),
    requestId,
  ]);
}

// After every successful sign-in: the old password no longer works, so signing in means the one-time password was
// used (or the password was already changed with the OTP email). The waiting request is done.
export async function closeRequestsAfterSignIn(userId) {
  await pool.query(
    `UPDATE password_reset_requests SET status = 'DONE', handled_at = NOW(), temp_password_enc = NULL
     WHERE user_id = $1 AND status = 'PENDING'`,
    [userId],
  );
}
