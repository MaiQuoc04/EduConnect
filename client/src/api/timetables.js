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

// UC-74 – classes this user may view (own class, children's classes, taught classes)
export async function getViewableClasses() {
  const { data } = await api.get('/timetables/viewable-classes');
  return data;
}

// UC-74 – one week (Monday..Sunday of `date`) of a class
export async function getClassWeek(classId, date) {
  const { data } = await api.get(`/timetables/classes/${classId}/week`, { params: date ? { date } : {} });
  return data;
}

// UC-75 – the signed-in teacher's lessons of one week
export async function getTeachingWeek(date) {
  const { data } = await api.get('/timetables/teaching-schedule/week', { params: date ? { date } : {} });
  return data;
}

// UC-72 – template (.xlsx) with the classes and subjects of the year in its guide sheet
export async function downloadTimetableTemplate(schoolYearId) {
  const res = await api.get('/timetables/import/template', { params: { schoolYearId }, responseType: 'blob', validateStatus: () => true });
  if (res.status !== 200) {
    let body = {};
    try {
      body = JSON.parse(await res.data.text());
    } catch {
      // not JSON
    }
    throw { status: res.status, code: body.code ?? 'NETWORK_ERROR', message: body.message ?? '', details: body.details };
  }
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mau-thoi-khoa-bieu.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importForm({ schoolYearId, startDate, endDate, file }) {
  const form = new FormData();
  form.append('schoolYearId', schoolYearId);
  form.append('startDate', startDate);
  if (endDate) form.append('endDate', endDate);
  form.append('file', file);
  return form;
}

// UC-72 – check the file (nothing is saved)
export async function previewTimetableImport(input) {
  const { data } = await api.post('/timetables/import/preview', importForm(input));
  return data;
}

// UC-72 – save every class of the file, or none
export async function importTimetables(input) {
  const { data } = await api.post('/timetables/import', importForm(input));
  return data;
}
