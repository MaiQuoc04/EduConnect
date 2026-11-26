import { api } from './client.js';

// School Manager settings (Dung, 21/11/2026). Server: server/src/modules/school-settings.

export async function getSchoolSettings() {
  const { data } = await api.get('/school-settings');
  return data;
}

// teaching: { teacherMaxWeek, classMaxDay, classMaxWeek }, attendance: { editDeadlineTime: 'HH:MM' } (each optional);
// stamp from the last read (409 MSG_SCHOOL_SETTINGS_CHANGED)
export async function saveSchoolSettings({ teaching, attendance, stamp }) {
  const { data } = await api.put('/school-settings', { teaching, attendance, stamp });
  return data;
}
