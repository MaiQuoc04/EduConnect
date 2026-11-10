import { api } from './client.js';

// FE-10 timetable (Dung). Server: server/src/modules/timetable.

// UC-70 – classes of a school year with their timetable (School Manager)
export async function getTimetableClasses(schoolYearId) {
  const { data } = await api.get('/timetables', { params: schoolYearId ? { schoolYearId } : {} });
  return data;
}

// UC-71 / UC-73 – editor data of a class; `date` picks the version shown
export async function getTimetableEditor(classId, date) {
  const { data } = await api.get(`/timetables/classes/${classId}/edit`, { params: date ? { date } : {} });
  return data;
}

// UC-71 / UC-73 – save the weekly pattern for [startDate, endDate] (endDate empty = end of the school year)
export async function saveClassTimetable(classId, { startDate, endDate, entries, stamp }) {
  const { data } = await api.put(`/timetables/classes/${classId}`, { startDate, endDate: endDate || undefined, entries, stamp });
  return data;
}
