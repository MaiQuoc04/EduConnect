import { api } from './client.js';

// FE-02 Student Management API (owner: Anh).

// Drops empty values so the URL sent to the server only carries the filters in use.
function compact(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false),
  );
}

// UC-07 GET /students -> { items, page, pageSize, total }
export async function listStudents(params, { signal } = {}) {
  const { data } = await api.get('/students', { params: compact(params), signal });
  return data;
}

// UC-08 GET /students/:studentId -> { student, currentEnrollment, enrollmentHistory, parents }
export async function getStudent(studentId, { signal } = {}) {
  const { data } = await api.get(`/students/${encodeURIComponent(studentId)}`, { signal });
  return data;
}

// UC-12 GET /students/:studentId/parents -> { student: { studentId, studentCode, fullName, avatarUrl, className },
// parents: [...], canLinkMore }. Read only; parents are ordered by linkedAt, at most 2 (business-rules §3).
export async function getStudentParents(studentId, { signal } = {}) {
  const { data } = await api.get(`/students/${encodeURIComponent(studentId)}/parents`, { signal });
  return data;
}

// TEMPORARY (UC-13): GET /students/parents/lookup?phone= -> { found: true, parent: { parentId, userId, fullName,
// avatarUrl, phone, email, occupation, address, accountStatus, linkedStudentCount } } or { found: false } (200).
// The server drops spaces, dots and dashes and reads +84 as 0; 400 MSG_INVALID_PARAM for an invalid number.
// TODO FE-14 (Khanh): switch to the UC-104 parent list endpoint once it exists; the server endpoint is removed then.
export async function lookupParentByPhone(phone, { signal } = {}) {
  const { data } = await api.get('/students/parents/lookup', { params: { phone }, signal });
  return data;
}

// UC-13 POST /students/:studentId/parents -> { student, parents, canLinkMore, warnings } (the UC-12 shape plus
// warnings). The body is only { parentId, relationshipType }: the server rejects any other key, and
// relationshipType must be exactly FATHER | MOTHER | GUARDIAN (upper case).
export async function linkParent(studentId, { parentId, relationshipType }) {
  const { data } = await api.post(`/students/${encodeURIComponent(studentId)}/parents`, { parentId, relationshipType });
  return data;
}

// UC-13 DELETE /students/:studentId/parents/:parentId -> same shape as linkParent. No body. The link is hard
// deleted (business-rules §14); linking the same parent again later is allowed.
export async function unlinkParent(studentId, parentId) {
  const { data } = await api.delete(
    `/students/${encodeURIComponent(studentId)}/parents/${encodeURIComponent(parentId)}`,
  );
  return data;
}

// UC-09 PATCH /students/:studentId -> the updated "student" object (same shape as UC-08's `student`).
// changes may only hold fullName, dob, gender: the server rejects any other key with MSG_FIELD_NOT_EDITABLE.
export async function updateStudent(studentId, changes) {
  const { data } = await api.patch(`/students/${encodeURIComponent(studentId)}`, changes);
  return data;
}

// UC-10 POST /students/:studentId/transfer -> { student, fromEnrollment, toEnrollment, groupChanges, warnings }.
// The body is only { toClassId }: the server rejects any other key (there is no "reason", see UC-10).
export async function transferStudent(studentId, toClassId) {
  const { data } = await api.post(`/students/${encodeURIComponent(studentId)}/transfer`, { toClassId });
  return data;
}

// UC-11 POST /students/promote -> { summary: { total, promoted, skipped }, results, warnings }. Answers 200 even when
// some students are SKIPPED (each result says why); only a problem with the whole request is an error.
// body: { fromSchoolYearId, toSchoolYearId, groups: [{ toClassId, studentIds }] } – no other key is accepted.
export async function promoteStudents(body) {
  const { data } = await api.post('/students/promote', body);
  return data;
}

// School years for the SCR-11 selects (UC-10, UC-11), from FE-04's GET /school-years (UC-20), oldest first:
// [{ schoolYearId, yearName, startDate, endDate, isCurrent, ended }]. isCurrent = today is inside the year.
export async function getSchoolYearOptions({ signal } = {}) {
  const { data } = await api.get('/school-years', { signal });
  return data
    .map((y) => ({
      schoolYearId: y.schoolYearId,
      yearName: y.yearName,
      startDate: y.startDate,
      endDate: y.endDate,
      isCurrent: y.status === 'CURRENT',
      ended: y.status === 'ENDED',
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// The classes of one school year, from FE-04's GET /classes?schoolYearId= (SCR-20): every class that is not
// soft-deleted, empty ones included, with its number of studying students. Natural order ("10A2" before "10A10").
// -> [{ classId, className, gradeLevelName, trackName, studentCount }]
export async function getClassOptions(schoolYearId, { signal } = {}) {
  const { data } = await api.get('/classes', { params: compact({ schoolYearId }), signal });
  return data.classes
    .map((c) => ({
      classId: c.classId,
      className: c.className,
      gradeLevelName: c.gradeLevel,
      trackName: c.trackName,
      studentCount: c.studentCount,
    }))
    .sort((a, b) => a.gradeLevelName.localeCompare(b.gradeLevelName, 'vi', { numeric: true })
      || a.className.localeCompare(b.className, 'vi', { numeric: true }));
}

// Every student of a UC-07 query, page after page (100 per page, at most MAX_OPTION_PAGES pages), for the
// UC-11 class roster and the destination year check. Errors are thrown like listStudents().
export async function listAllStudents(params, { signal } = {}) {
  const items = [];
  for (let page = 1; page <= MAX_OPTION_PAGES; page += 1) {
    const data = await listStudents({ ...params, page, pageSize: 100 }, { signal });
    items.push(...data.items);
    if (page * data.pageSize >= data.total) break;
  }
  return items;
}

// Class options for the Student List filter, from FE-04's class list (getClassOptions), so a class without
// students appears too. Cached per school year for the session.
const classOptionsCache = new Map();
const MAX_OPTION_PAGES = 20;

export function fetchClassOptions(schoolYearId) {
  const key = schoolYearId ?? 'current';
  if (!classOptionsCache.has(key)) {
    const load = getClassOptions(schoolYearId).then((classes) =>
      classes.map((c) => ({ id: c.classId, name: c.className, gradeLevelName: c.gradeLevelName })));
    load.catch(() => classOptionsCache.delete(key));
    classOptionsCache.set(key, load);
  }
  return classOptionsCache.get(key);
}

// --- UC-14 Import Parent–Student Links (SCR-07 "Nhập liên kết phụ huynh") ------------------------------------
// Same calls as FE-13's account import (UC-96, api/admin.js): a blob download for the template, then the SAME File
// object sent to preview and to import (multipart, field "file"). The server keeps nothing between the two calls.

// Saves a downloaded Blob under `name` (the browser's download).
function saveFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// GET /students/parent-links/template -> .xlsx with the three columns and one example row.
export async function downloadParentLinkTemplate() {
  const res = await api.get('/students/parent-links/template', { responseType: 'blob' });
  const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? 'mau-nhap-lien-ket-phu-huynh.xlsx';
  saveFile(res.data, name);
}

function fileForm(file) {
  const form = new FormData();
  form.append('file', file);
  return form;
}

// POST /students/parent-links/preview (nothing is saved) and POST /students/parent-links/import (every valid row is
// saved in one transaction). Both answer { summary: { total, valid, invalid, imported }, rows, warnings }:
// rows: [{ rowNumber, studentCode, phone, relationshipType, relationshipText, status: VALID | INVALID | IMPORTED,
//          studentName, parentName, errorCode, errorMessage, details }].
export async function previewParentLinks(file) {
  const { data } = await api.post('/students/parent-links/preview', fileForm(file));
  return data;
}

export async function importParentLinks(file) {
  const { data } = await api.post('/students/parent-links/import', fileForm(file));
  return data;
}
