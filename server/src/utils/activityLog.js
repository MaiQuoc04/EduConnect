import { pool } from '../config/db.js';

// Only important actions are logged (ERD 7f): LOGIN_SUCCESS, LOGIN_FAILED, ACCOUNT_CREATE, ACCOUNT_IMPORT,
// ACCOUNT_LOCK, ACCOUNT_UNLOCK, PASSWORD_RESET, ROLE_CHANGE, SETTING_CHANGE, GRADE_UNLOCK.
export async function logActivity({ userId = null, action, targetType = null, targetId = null, detail = null, ip = null }) {
  await pool.query(
    `INSERT INTO activity_logs (user_id, action, target_type, target_id, detail, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, action, targetType, targetId, detail ? JSON.stringify(detail) : null, ip],
  );
}
