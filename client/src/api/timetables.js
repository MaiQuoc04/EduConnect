import { api } from './client.js';

// FE-10 timetable (Dung). Server: server/src/modules/timetable.

// UC-70 – classes of a school year with their timetable (School Manager)
export async function getTimetableClasses(schoolYearId) {
  const { data } = await api.get('/timetables', { params: schoolYearId ? { schoolYearId } : {} });
  return data;
}
