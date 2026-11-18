import { api } from './client.js';

// FE-12 Attendance Management (owner: Quoc). Server: /api/v1/attendances (server/src/modules/attendance).

export const getAttendanceOptions = () => api.get('/attendances/options').then((r) => r.data);
export const listAttendanceClasses = (schoolYearId) =>
  api.get('/attendances/classes', { params: { schoolYearId: schoolYearId || undefined } }).then((r) => r.data);

// UC-90 / UC-91: periods of a day and the sheet of one period
export const listMyLessons = (date) => api.get('/attendances/my-lessons', { params: { date: date || undefined } }).then((r) => r.data);
export const listClassLessons = (classId, date) =>
  api.get(`/attendances/classes/${classId}/lessons`, { params: { date: date || undefined } }).then((r) => r.data);
export const getAttendanceSheet = (lessonId) => api.get(`/attendances/lessons/${lessonId}`).then((r) => r.data);
// records = [{ enrollmentId, status, note }]; reason required for the homeroom teacher and School Manager.
export const saveAttendanceSheet = (lessonId, records, reason) =>
  api.put(`/attendances/lessons/${lessonId}`, { records, reason: reason || undefined }).then((r) => r.data);
export const getLessonHistory = (lessonId) => api.get(`/attendances/lessons/${lessonId}/history`).then((r) => r.data);

// UC-93
export const getClassReport = (classId, params) => api.get(`/attendances/classes/${classId}/report`, { params }).then((r) => r.data);

// UC-92
export const listAttendanceStudents = () => api.get('/attendances/students').then((r) => r.data);
export const getStudentAttendance = (studentId, params) =>
  api.get(`/attendances/students/${studentId}`, { params }).then((r) => r.data);

// UC-94
export const getAttendanceStats = (params) => api.get('/attendances/stats', { params }).then((r) => r.data);
export const listMissingLessons = (params) => api.get('/attendances/stats/missing', { params }).then((r) => r.data);

async function download(path, params, fallbackName) {
  const res = await api.get(path, { params, responseType: 'blob' });
  const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(res.data);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
export const exportClassReport = (classId, params) =>
  download(`/attendances/classes/${classId}/report/export`, params, 'diem-danh-lop.xlsx');
export const exportAttendanceStats = (params) => download('/attendances/stats/export', params, 'thong-ke-diem-danh.xlsx');
