import { api } from './client.js';

// GET /api/v1/teachers?page=1&limit=10&search=&subject=&homeroom=&status=
export async function getTeachers(params = {}) {
  const res = await api.get('/teachers', { params });
  return res.data; // { teachers, total, page, totalPages }
}

// GET /api/v1/teachers/:id?week=YYYY-MM-DD  (SCR-14, UC-16)
export async function getTeacher(teacherId, { week } = {}) {
  const res = await api.get(`/teachers/${teacherId}`, { params: week ? { week } : {} });
  return res.data; // { teacher, schoolYear, assignments, workload, schedule }
}

// GET /api/v1/teachers/subject-options  (SCR-15 subject picker)
export async function getSubjectOptions() {
  const res = await api.get('/teachers/subject-options');
  return res.data; // { subjects: [{ subjectId, code, name }] }
}

// PATCH /api/v1/teachers/:id  (SCR-15, UC-17) – { fullName, department, subjectIds }
export async function updateTeacher(teacherId, body) {
  const res = await api.patch(`/teachers/${teacherId}`, body);
  return res.data;
}
