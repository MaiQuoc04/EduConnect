import { api } from './client.js';

// UC-114 Manage Departments (FE-03, School Manager).

// GET /api/v1/departments → { departments: [{ departmentId, name, teacherCount, subjects }], subjects: [{ subjectId, code, name, departmentId }] }
export async function getDepartments() {
  const { data } = await api.get('/departments');
  return data;
}

// POST /api/v1/departments { name, subjectIds }
export async function createDepartment(body) {
  const { data } = await api.post('/departments', body);
  return data;
}

// PATCH /api/v1/departments/:id { name?, subjectIds? }
export async function updateDepartment(id, body) {
  const { data } = await api.patch(`/departments/${id}`, body);
  return data;
}

// DELETE /api/v1/departments/:id
export async function deleteDepartment(id) {
  await api.delete(`/departments/${id}`);
}
