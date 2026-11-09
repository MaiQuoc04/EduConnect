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

// Saves a Blob from the API under the name in Content-Disposition (or `fallback`).
function saveDownload(res, fallback) {
  const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? fallback;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// File downloads: the answer is a Blob, so an error answer (JSON { code, message, details }) is read here.
async function download(url, params, fallback) {
  const res = await api.get(url, { params, responseType: 'blob', validateStatus: () => true });
  if (res.status !== 200) {
    let body = {};
    try {
      body = JSON.parse(await res.data.text());
    } catch {
      // not JSON
    }
    throw { status: res.status, code: body.code ?? 'NETWORK_ERROR', message: body.message ?? '', details: body.details };
  }
  saveDownload(res, fallback);
}

// GET /api/v1/teachers/export?search=&subject=&homeroom=&status=  (SCR-14, UC-115) – downloads the .xlsx
export function exportTeachers(params = {}) {
  return download('/teachers/export', params, 'danh-sach-giao-vien.xlsx');
}

// UC-116 Import Teachers (School Manager): same file and checks as UC-96 with the type fixed to Teacher.
export function downloadTeacherImportTemplate() {
  return download('/teachers/import/template', {}, 'mau-nhap-tai-khoan-giao-vien.xlsx');
}

function fileForm(file) {
  const form = new FormData();
  form.append('file', file);
  return form;
}

export async function previewTeacherImport(_type, file) {
  const { data } = await api.post('/teachers/import/preview', fileForm(file));
  return data;
}

export async function importTeachers(_type, file) {
  const { data } = await api.post('/teachers/import', fileForm(file));
  return data;
}
