import { pool } from '../../config/db.js';
import { hashPassword } from '../../utils/password.js';
import { seal } from '../../utils/secretBox.js';
import { generateTemporaryPassword } from '../../utils/tempPassword.js';

// FE-13 (owner: Linh) – one-time password of a password reset request, used by FE-01 (auth.service.js).
// ASSUMPTION (FE-13 owner, 31/10/2026, to confirm with the team lead and add to business-rules §3):
// - Sending a request (Forgot Password screen) issues a new one-time password at once: the old password stops
//   working, the account must change its password at the next sign-in, a temporary sign-in lock is cleared.
// - System Admin / School Manager read that password on the requests page until the user signs in; then the request
//   becomes DONE and the stored (encrypted) copy is cleared.
// - A second request while one is PENDING changes nothing (same password).

// Inside the transaction that created the request. `user` = { user_id, username, phone }.
export async function issueRequestPassword(client, user, requestId) {
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
