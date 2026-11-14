import { api } from './client.js';

// FE-11 Grade Management (owner: Linh). A grade book = class × subject × semester.
const book = (classId, subjectId) => `/grades/books/${classId}/${subjectId}`;

export const getGradeOptions = () => api.get('/grades/options').then((r) => r.data);

// UC-81, UC-82 (School Manager)
export const listStructures = (semesterId, gradeLevelId) =>
  api.get('/grades/structures', { params: { semesterId, gradeLevelId } }).then((r) => r.data);
export const getStructure = (semesterId, gradeLevelId, subjectId) =>
  api.get(`/grades/structures/${semesterId}/${gradeLevelId}/${subjectId}`).then((r) => r.data);
export const saveStructure = (semesterId, gradeLevelId, subjectId, components) =>
  api.put(`/grades/structures/${semesterId}/${gradeLevelId}/${subjectId}`, { components }).then((r) => r.data);
// to = { semesterId, gradeLevelId, subjectIds: [...] }
export const copyStructure = (from, to) => api.post('/grades/structures/copy', { from, to }).then((r) => r.data);

// UC-83, UC-84, UC-85 (teacher)
export const listMyBooks = (semesterId) => api.get('/grades/my-books', { params: { semesterId } }).then((r) => r.data);
export const getBook = (classId, subjectId, semesterId) =>
  api.get(book(classId, subjectId), { params: { semesterId } }).then((r) => r.data);
export const saveGrades = (classId, subjectId, semesterId, changes) =>
  api.put(book(classId, subjectId), { changes }, { params: { semesterId } }).then((r) => r.data);
export const finalizeBook = (classId, subjectId, semesterId) =>
  api.post(`${book(classId, subjectId)}/finalize`, null, { params: { semesterId } }).then((r) => r.data);

export async function downloadGradeTemplate(classId, subjectId, semesterId) {
  const res = await api.get(`${book(classId, subjectId)}/import/template`, { params: { semesterId }, responseType: 'blob' });
  const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? 'so-diem.xlsx';
  const url = URL.createObjectURL(res.data);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const upload = (path, semesterId, file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post(path, form, { params: { semesterId } }).then((r) => r.data);
};
export const previewGradeImport = (classId, subjectId, semesterId, file) =>
  upload(`${book(classId, subjectId)}/import/preview`, semesterId, file);
export const importGrades = (classId, subjectId, semesterId, file) =>
  upload(`${book(classId, subjectId)}/import`, semesterId, file);

// UC-86, UC-87 (School Manager)
export const listGradeBooks = (params) => api.get('/grades/control', { params }).then((r) => r.data);
export const unlockBook = (classId, subjectId, semesterId, reason) =>
  api.post(`${book(classId, subjectId)}/unlock`, { reason }, { params: { semesterId } }).then((r) => r.data);
export const listGradeHistory = (params) => api.get('/grades/history', { params }).then((r) => r.data);

// UC-88, UC-89
export const listGradeClasses = (schoolYearId) => api.get('/grades/classes', { params: { schoolYearId } }).then((r) => r.data);
export const getClassResults = (classId, period) =>
  api.get(`/grades/classes/${classId}/results`, { params: { period } }).then((r) => r.data);
export const listMyStudents = () => api.get('/grades/students').then((r) => r.data);
export const getStudentResults = (studentId, schoolYearId) =>
  api.get(`/grades/students/${studentId}/results`, { params: { schoolYearId } }).then((r) => r.data);
