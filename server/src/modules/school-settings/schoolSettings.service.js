// School Manager settings ("Cài đặt hệ thống" of the School Manager, Dung, 21/11/2026). First group: the teaching
// load used by automatic scheduling (moved here from part "4. Giáo viên" of SCR-80): the weekly norm of a teacher and
// of a homeroom teacher, how many periods a teacher may go over the norm, and the most periods a teacher should teach
// in one day.
// ASSUMPTION: proposed screen / use case, not yet agreed by the team lead (no UC / SCR id yet). The values live in
// school_settings (database/patch_v0.3_school_settings.sql, NOT run on the shared DB yet). Until the patch is run the
// built-in defaults are used and saving answers 503 MSG_SCHOOL_SETTINGS_NOT_READY.
// school_settings is separate from system_settings on purpose: system_settings is edited by the System Admin only
// (UC-102, business rules §13) and its screen lists every row of that table.
import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest } from '../../utils/AppError.js';
import { logActivity } from '../../utils/activityLog.js';
import { AUTO_LIMITS } from '../timetable/timetable.constants.js';

export const ERROR_CODES = Object.freeze({
  NOT_READY: 'MSG_SCHOOL_SETTINGS_NOT_READY', // 503 – patch_v0.3_school_settings.sql not run on this database
  INVALID: 'MSG_SCHOOL_SETTINGS_INVALID', // 400 details: { field, reason: REQUIRED | RANGE | ABOVE_NORM, min?, max? }
  CHANGED: 'MSG_SCHOOL_SETTINGS_CHANGED', // 409 – saved by someone else after the page was opened
  NOTHING: 'MSG_NOTHING_CHANGED', // 400 – same code as the System Admin settings
});

// field (API, camelCase) -> row key, built-in default and allowed range. Defaults = the values used before the move.
export const TEACHING_FIELDS = Object.freeze({
  norm: { key: 'teaching.norm', fallback: AUTO_LIMITS.NORM, min: 1, max: 40 },
  homeroomNorm: { key: 'teaching.homeroom_norm', fallback: AUTO_LIMITS.HOMEROOM_NORM, min: 0, max: 40 },
  maxOver: { key: 'teaching.max_over', fallback: AUTO_LIMITS.MAX_OVER, min: 0, max: 20 },
  maxPerDay: { key: 'teaching.max_periods_per_day', fallback: AUTO_LIMITS.MAX_PER_DAY, min: 1, max: 10 },
});
const KEYS = Object.values(TEACHING_FIELDS).map((f) => f.key);

const missingTable = (err) => err?.code === '42P01';

async function readRows(db, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT s.setting_key AS "key", s.setting_value AS "value", s.updated_at AS "updatedAt", u.full_name AS "updatedByName"
     FROM school_settings s LEFT JOIN users u ON u.user_id = s.updated_by
     WHERE s.setting_key = ANY($1::varchar[])${lock ? ' FOR UPDATE OF s' : ''}`,
    [KEYS],
  );
  return rows;
}

function shape(rows, ready) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const values = {};
  for (const [field, f] of Object.entries(TEACHING_FIELDS)) {
    const n = Number(byKey.get(f.key)?.value);
    values[field] = Number.isInteger(n) && n >= f.min && n <= f.max ? n : f.fallback;
  }
  const last = rows.filter((r) => r.updatedAt).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  return {
    ready,
    teaching: values,
    limits: Object.fromEntries(Object.entries(TEACHING_FIELDS).map(([k, f]) => [k, { min: f.min, max: f.max, default: f.fallback }])),
    updatedAt: last?.updatedAt ?? null,
    updatedByName: last?.updatedByName ?? null,
    stamp: Object.keys(TEACHING_FIELDS).map((k) => values[k]).join('|'),
  };
}

// The teaching load in force (automatic scheduling reads it on every run and apply).
export async function teachingLoad(db = pool) {
  try {
    return shape(await readRows(db), true).teaching;
  } catch (err) {
    if (missingTable(err)) return shape([], false).teaching;
    throw err;
  }
}

// GET /api/v1/school-settings
export async function getSettings() {
  try {
    return shape(await readRows(pool), true);
  } catch (err) {
    if (missingTable(err)) return shape([], false);
    throw err;
  }
}

const invalid = (field, reason, more = {}) => badRequest(ERROR_CODES.INVALID, `Invalid ${field}.`, { field, reason, ...more });

export function checkTeaching(body) {
  const t = body?.teaching;
  if (!t || typeof t !== 'object' || Array.isArray(t)) throw invalid('teaching', 'REQUIRED');
  const out = {};
  for (const [field, f] of Object.entries(TEACHING_FIELDS)) {
    const raw = t[field];
    if (raw === undefined || raw === null || raw === '') throw invalid(field, 'REQUIRED');
    const n = typeof raw === 'string' && /^\d{1,3}$/.test(raw.trim()) ? Number(raw) : raw;
    if (!Number.isInteger(n) || n < f.min || n > f.max) throw invalid(field, 'RANGE', { min: f.min, max: f.max });
    out[field] = n;
  }
  if (out.homeroomNorm > out.norm) throw invalid('homeroomNorm', 'ABOVE_NORM');
  return out;
}

// PUT /api/v1/school-settings { teaching: { norm, homeroomNorm, maxOver, maxPerDay }, stamp }
export async function updateSettings({ teaching, stamp }, user, ip) {
  let before;
  try {
    before = await withTransaction(async (db) => {
      const current = shape(await readRows(db, { lock: true }), true);
      if (stamp !== current.stamp) throw new AppError(409, ERROR_CODES.CHANGED, 'The settings were changed after the page was opened.');
      const changed = Object.keys(TEACHING_FIELDS).filter((k) => teaching[k] !== current.teaching[k]);
      if (!changed.length) throw badRequest(ERROR_CODES.NOTHING, 'Nothing was changed.');
      for (const k of changed) {
        const f = TEACHING_FIELDS[k];
        await db.query(
          `INSERT INTO school_settings (setting_key, setting_value, updated_by, updated_at) VALUES ($1, $2, $3, NOW())
           ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
          [f.key, String(teaching[k]), user.userId],
        );
      }
      return { values: current.teaching, changed };
    });
  } catch (err) {
    if (missingTable(err)) throw new AppError(503, ERROR_CODES.NOT_READY, 'The school_settings table is not created yet.');
    throw err;
  }
  await logActivity({
    userId: user.userId, action: 'SETTING_CHANGE', targetType: 'SCHOOL_SETTINGS', ip,
    detail: Object.fromEntries(before.changed.map((k) => [TEACHING_FIELDS[k].key, { from: before.values[k], to: teaching[k] }])),
  }).catch(() => {}); // the change is saved; a failed log line must not turn it into an error
  return getSettings();
}
