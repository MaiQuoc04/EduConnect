import { pool } from '../config/db.js';

// Only important actions are logged (ERD 7f): LOGIN_SUCCESS, LOGIN_FAILED, ACCOUNT_CREATE, ACCOUNT_IMPORT,
// ACCOUNT_LOCK, ACCOUNT_UNLOCK, PASSWORD_RESET, ROLE_CHANGE, SETTING_CHANGE, GRADE_UNLOCK.
// Moderation (25/11/2026, business-rules §17; detail never holds content): CHAT_CONTEXT_VIEW (27/11/2026: with the
// School Manager's reason; CHAT_FULL_VIEW removed with the whole-chat view),
// MODERATION_ITEM_VIEW, MODERATION_UNHIDE, MESSAGE_REPORT_RESOLVE, MODERATION_RULE_CHANGE.
export async function logActivity({ userId = null, action, targetType = null, targetId = null, detail = null, ip = null }) {
  await pool.query(
    `INSERT INTO activity_logs (user_id, action, target_type, target_id, detail, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, action, targetType, targetId, detail ? JSON.stringify(detail) : null, ip],
  );
}
