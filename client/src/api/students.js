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
// TODO FE-14 (Khanh): switch to the UC-105 parent list endpoint once it exists; the server endpoint is removed then.
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

// TEMPORARY: GET /students/promote/options -> { schoolYears, classes } for the SCR-11 selects (UC-10, UC-11).
// schoolYears: [{ schoolYearId, yearName, startDate, endDate, isCurrent }] by start_date; classes (only with
// toSchoolYearId): [{ classId, className, gradeLevelName, trackName, studentCount }].
// TODO FE-04 (Khanh): switch to GET /school-years and GET /classes?schoolYearId= once they exist; the server
// endpoint is removed then.
export async function getPromoteOptions({ toSchoolYearId } = {}, { signal } = {}) {
  const { data } = await api.get('/students/promote/options', { params: compact({ toSchoolYearId }), signal });
  return data;
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

// Class options for the Student List filter, grouped by grade level. (SCR-11 uses getPromoteOptions instead.)
// TODO FE-04 (Khanh): replace with the class list API (GET /classes?schoolYearId=) once it exists.
// ASSUMPTION: until then the options are collected from the students of the year (at most 20 pages of 100), so a
// class without students does not appear. Cached per school year for the session.
const classOptionsCache = new Map();
const MAX_OPTION_PAGES = 20;

export function fetchClassOptions(schoolYearId) {
  const key = schoolYearId ?? 'current';
  if (!classOptionsCache.has(key)) {
    const load = (async () => {
      const classes = new Map();
      for (let page = 1; page <= MAX_OPTION_PAGES; page += 1) {
        const data = await listStudents({ schoolYearId, page, pageSize: 100 });
        for (const s of data.items) {
          if (s.classId && !classes.has(s.classId)) {
            classes.set(s.classId, { id: s.classId, name: s.className, gradeLevelName: s.gradeLevelName });
          }
        }
        if (page * data.pageSize >= data.total) break;
      }
      return [...classes.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
    })();
    load.catch(() => classOptionsCache.delete(key));
    classOptionsCache.set(key, load);
  }
  return classOptionsCache.get(key);
}
