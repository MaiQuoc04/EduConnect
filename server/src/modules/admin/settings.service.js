import { pool, withTransaction } from '../../config/db.js';
import { badRequest } from '../../utils/AppError.js';
import { logActivity } from '../../utils/activityLog.js';

// UC-99 Configure System Settings (FE-13, owner: Linh). Keys are loaded by SQL with the schema; System Admin edits
// values only (business-rules §13).
// ASSUMPTION: the allowed ranges below are proposals in the FE-13 use case specification, not yet agreed.
const RULES = {
  'login.max_failed_attempts': { type: 'int', min: 3, max: 10 },
  'login.lock_minutes_step': { type: 'int', min: 1, max: 60 },
  'login.lock_minutes_max': { type: 'int', min: 1, max: 1440 },
  'upload.max_file_mb': { type: 'int', min: 1, max: 50 },
  'upload.max_video_mb': { type: 'int', min: 1, max: 200 },
  'otp.expiry_minutes': { type: 'int', min: 1, max: 30 },
  'attendance.edit_deadline_time': { type: 'time' },
};

export async function listSettings() {
  const { rows } = await pool.query(
    `SELECT s.setting_key AS key, s.setting_value AS value, s.description, s.updated_at AS "updatedAt",
            u.full_name AS "updatedByName", u.username AS "updatedByUsername"
     FROM system_settings s LEFT JOIN users u ON u.user_id = s.updated_by
     ORDER BY s.setting_key`,
  );
  return { items: rows.map((r) => ({ ...r, rule: RULES[r.key] ?? null })) };
}

function checkValue(key, raw) {
  const rule = RULES[key];
  const value = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (!value) return { error: 'REQUIRED' };
  if (!rule) return value.length <= 255 ? { value } : { error: 'TOO_LONG' };
  if (rule.type === 'int') {
    if (!/^\d+$/.test(value)) return { error: 'INVALID' };
    const n = Number(value);
    if (n < rule.min || n > rule.max) return { error: 'OUT_OF_RANGE' };
    return { value: String(n) };
  }
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return { error: 'INVALID' };
  return { value: `${m[1].padStart(2, '0')}:${m[2]}` };
}

// Saves the changed values; one SETTING_CHANGE log row per key with the old and new value.
export async function updateSettings({ values, actorId, ip }) {
  if (!values || typeof values !== 'object' || Array.isArray(values) || !Object.keys(values).length) {
    throw badRequest('MSG_NOTHING_CHANGED', 'Nothing was changed.');
  }
  const { rows: current } = await pool.query('SELECT setting_key, setting_value FROM system_settings');
  const old = new Map(current.map((r) => [r.setting_key, r.setting_value]));

  const fields = {};
  const changes = [];
  for (const [key, raw] of Object.entries(values)) {
    if (!old.has(key)) {
      fields[key] = 'UNKNOWN';
      continue;
    }
    const { value, error } = checkValue(key, raw);
    if (error) fields[key] = error;
    else if (value !== old.get(key)) changes.push({ key, oldValue: old.get(key), newValue: value });
  }
  const after = (key) => changes.find((c) => c.key === key)?.newValue ?? old.get(key);
  if (!fields['login.lock_minutes_max'] && Number(after('login.lock_minutes_max')) < Number(after('login.lock_minutes_step'))) {
    fields['login.lock_minutes_max'] = 'LESS_THAN_STEP';
  }
  if (Object.keys(fields).length) throw badRequest('MSG_SETTINGS_INVALID', 'Some values are invalid.', { fields });
  if (!changes.length) throw badRequest('MSG_NOTHING_CHANGED', 'Nothing was changed.');

  await withTransaction(async (client) => {
    for (const c of changes) {
      await client.query('UPDATE system_settings SET setting_value = $1, updated_by = $2 WHERE setting_key = $3', [
        c.newValue,
        actorId,
        c.key,
      ]);
    }
  });
  for (const c of changes) {
    await logActivity({ userId: actorId, action: 'SETTING_CHANGE', targetType: 'SETTING', detail: c, ip });
  }
  return listSettings();
}
