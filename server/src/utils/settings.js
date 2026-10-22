import { pool } from '../config/db.js';

// Reads one value from system_settings (UC-99). Values are edited by System Admin only.
export async function getSetting(key, fallback) {
  const { rows } = await pool.query('SELECT setting_value FROM system_settings WHERE setting_key = $1', [key]);
  return rows.length ? rows[0].setting_value : fallback;
}

export async function getNumberSetting(key, fallback) {
  const value = Number(await getSetting(key, fallback));
  return Number.isFinite(value) ? value : fallback;
}
