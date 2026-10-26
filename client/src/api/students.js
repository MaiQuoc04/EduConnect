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

// Class options for the Student List filter, grouped by grade level.
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
