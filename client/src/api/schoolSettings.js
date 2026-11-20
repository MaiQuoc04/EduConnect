import { api } from './client.js';

// School Manager settings (Dung, 21/11/2026). Server: server/src/modules/school-settings.

export async function getSchoolSettings() {
  const { data } = await api.get('/school-settings');
  return data;
}

// teaching: { norm, homeroomNorm, maxOver, maxPerDay }; stamp from the last read (409 MSG_SCHOOL_SETTINGS_CHANGED)
export async function saveSchoolSettings({ teaching, stamp }) {
  const { data } = await api.put('/school-settings', { teaching, stamp });
  return data;
}
