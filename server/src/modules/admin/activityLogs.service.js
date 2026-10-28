import { pool } from '../../config/db.js';
import { removeAccents } from '../../utils/username.js';

// UC-101 View Activity Log (FE-13, owner: Linh). Read only: log rows are never edited or deleted.
export const LOG_ACTIONS = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'ACCOUNT_CREATE',
  'ACCOUNT_IMPORT',
  'ACCOUNT_LOCK',
  'ACCOUNT_UNLOCK',
  'PASSWORD_RESET',
  'ROLE_CHANGE',
  'SETTING_CHANGE',
  'GRADE_UNLOCK',
];
const PAGE_SIZE = 50;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VN_LETTERS = 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ';
const VN_FOLDED = removeAccents(VN_LETTERS);

function parseDetail(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

// Filters: action, user (name or username, accent-insensitive), from / to (YYYY-MM-DD, Vietnam dates, inclusive).
export async function listActivityLogs(query = {}) {
  const action = LOG_ACTIONS.includes(query.action) ? query.action : null;
  const user = typeof query.user === 'string' && query.user.trim() ? removeAccents(query.user.trim().toLowerCase()).slice(0, 100) : null;
  const from = DATE_RE.test(query.from ?? '') ? query.from : null;
  const to = DATE_RE.test(query.to ?? '') ? query.to : null;
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);

  const { rows } = await pool.query(
    `SELECT l.log_id AS id, l.created_at AS "createdAt", l.action, l.target_type AS "targetType", l.target_id AS "targetId",
            l.detail, l.ip_address AS ip,
            u.user_id AS "userId", u.username, u.full_name AS "fullName",
            tu.username AS "targetUsername", tu.full_name AS "targetFullName",
            COUNT(*) OVER() AS total
     FROM activity_logs l
     LEFT JOIN users u ON u.user_id = l.user_id
     LEFT JOIN users tu ON l.target_type = 'USER' AND tu.user_id = l.target_id
     WHERE ($1::text IS NULL OR l.action = $1)
       AND ($2::text IS NULL OR u.username LIKE '%' || $2 || '%' OR translate(LOWER(u.full_name), $6, $7) LIKE '%' || $2 || '%')
       AND ($3::date IS NULL OR l.created_at >= ($3::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
       AND ($4::date IS NULL OR l.created_at < ($4::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
     ORDER BY l.created_at DESC, l.log_id DESC
     LIMIT ${PAGE_SIZE} OFFSET $5`,
    [action, user, from, to, (page - 1) * PAGE_SIZE, VN_LETTERS, VN_FOLDED],
  );
  return {
    items: rows.map(({ total, detail, ...r }) => ({ ...r, detail: parseDetail(detail) })),
    total: rows[0]?.total ?? 0,
    page,
    pageSize: PAGE_SIZE,
    actions: LOG_ACTIONS,
  };
}
