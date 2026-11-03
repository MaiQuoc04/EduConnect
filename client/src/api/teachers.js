import { api } from './client.js';

// GET /api/v1/teachers?page=1&limit=10&search=&subject=&homeroom=&status=
export async function getTeachers(params = {}) {
  const res = await api.get('/teachers', { params });
  return res.data; // { teachers, total, page, totalPages }
}

// GET /api/v1/teachers/:id?week=YYYY-MM-DD  (SCR-15, UC-16)
export async function getTeacher(teacherId, { week } = {}) {
  const res = await api.get(`/teachers/${teacherId}`, { params: week ? { week } : {} });
  return res.data; // { teacher, schoolYear, assignments, workload, schedule }
}

// GET /api/v1/teachers/subject-options  (SCR-17 subject picker)
export async function getSubjectOptions() {
  const res = await api.get('/teachers/subject-options');
  return res.data; // { subjects: [{ subjectId, code, name }] }
}

// GET /api/v1/teachers/department-options  (SCR-17 department picker)
export async function getDepartmentOptions() {
  const res = await api.get('/teachers/department-options');
  return res.data; // { departments: [{ departmentId, name }] }
}

// PATCH /api/v1/teachers/:id  (SCR-17, UC-17) – { fullName, departmentId?, subjectIds }
export async function updateTeacher(teacherId, body) {
  const res = await api.patch(`/teachers/${teacherId}`, body);
  return res.data;
}
