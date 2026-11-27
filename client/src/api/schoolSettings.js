import { api } from './client.js';

// School Manager settings (Dung, 21/11/2026). Server: server/src/modules/school-settings.

export async function getSchoolSettings() {
  const { data } = await api.get('/school-settings');
  return data;
}

// teaching: { teacherMaxWeek, classMaxDay, classMaxWeek, subjectMaxWeek }, classes: { warnStudents, maxStudents },
// attendance: { editDeadlineTime: 'HH:MM' } (each optional); stamp from the last read (409 MSG_SCHOOL_SETTINGS_CHANGED)
export async function saveSchoolSettings({ teaching, classes, attendance, stamp }) {
  const { data } = await api.put('/school-settings', { teaching, classes, attendance, stamp });
  return data;
}

// FE-04 (27/11/2026): what is already above the values about to be saved (only the lowered ones are sent).
// -> { classes: [{ className, yearName, students }], subjects: [{ trackName, gradeLevel, subjectName, periods }],
//      tracks: [{ trackName, gradeLevel, total }] }
export async function getSchoolSettingsImpact({ maxStudents, subjectMaxWeek, classMaxWeek }) {
  const { data } = await api.get('/school-settings/impact', { params: { maxStudents, subjectMaxWeek, classMaxWeek } });
  return data;
}
