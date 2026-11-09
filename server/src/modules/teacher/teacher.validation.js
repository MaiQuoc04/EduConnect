// FE-03 input validation. Each exported function takes the Express request and returns clean input for the service,
// or throws AppError (400 / 403 / 404). Controllers call them before the service (no DB access here).
import { badRequest, AppError, notFound } from '../../utils/AppError.js';
import {
  DEPARTMENT_EDITABLE_FIELDS,
  ERROR_CODES,
  HOMEROOM_FILTER,
  HOMEROOM_RULES,
  LOGIN_IDENTIFIER_FIELDS,
  TEACHER_EDITABLE_FIELDS,
  TEACHER_LIMITS,
  TEACHING_RULES,
  USER_STATUS,
} from './teacher.constants.js';
import { checkDepartmentName, checkPersonName, cleanText } from './teacher.text.js';

// ── Small helpers ───────────────────────────────────────────────────────────


// Positive integer id, at most 18 digits (BIGINT safe), given as number or numeric string. "0", "01", "1.5", "-1",
// "1e3", true, [] and {} are rejected.
export const isId = (v) => (typeof v === 'number' || typeof v === 'string') && /^[1-9]\d{0,17}$/.test(String(v));

// Real calendar date 'YYYY-MM-DD' between 2000 and 2100 ("2026-02-31", "2026-13-01", "2026-1-5" are rejected).
export function isIsoDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// null / '' / undefined -> null, otherwise the id as a string (BIGINT safe)
export const toNullableId = (v) => (v == null || v === '' ? null : String(v));

export const toPositiveInt = (v, fallback, max = Number.MAX_SAFE_INTEGER) => {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
};

export const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

// Query values must be single strings: "?a=1&a=2" (array) or "?a[b]=1" (object) are not accepted.
export const isQueryValue = (v) => v === undefined || typeof v === 'string';

// ── School year (SCR-18, SCR-19) ───────────────────────────────────────────

// Optional ?schoolYearId= ; a malformed id is treated as "not found".
export function optionalSchoolYearId(value) {
  if (!isQueryValue(value)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'schoolYearId must be a single value.', { field: 'schoolYearId' });
  if (value == null || value === '') return undefined;
  if (!isId(value)) throw notFound(ERROR_CODES.SCHOOL_YEAR_NOT_FOUND, 'School year not found.');
  return String(value);
}

// ── Teachers (SCR-14, SCR-15, SCR-17) ──────────────────────────────────────

function teacherId(req) {
  const id = req.params?.id;
  if (!isId(id)) throw notFound(ERROR_CODES.TEACHER_NOT_FOUND, 'Teacher not found.');
  return String(id);
}

// Free-text query value: one string, cleaned (NFC, no invisible chars, single spaces), at most `max` chars.
function searchText(query, field) {
  const raw = query[field];
  if (!isQueryValue(raw)) throw badRequest(ERROR_CODES.INVALID_INPUT, `${field} must be a single value.`, { field });
  const value = cleanText(raw ?? '');
  if (value.length > TEACHER_LIMITS.SEARCH_MAX) {
    throw badRequest(ERROR_CODES.FIELD_TOO_LONG, `${field} is too long.`, { field, max: TEACHER_LIMITS.SEARCH_MAX });
  }
  return value;
}

// GET /teachers?page=&limit=&search=&subject=&homeroom=has|none&status=ACTIVE|LOCKED  (SCR-14, UC-15)
// page / limit / homeroom / status fall back to their default when the value is not usable.
export function listTeachersQuery(req) {
  const q = req.query ?? {};
  for (const key of ['page', 'limit', 'status', 'homeroom']) {
    if (!isQueryValue(q[key])) throw badRequest(ERROR_CODES.INVALID_INPUT, `${key} must be a single value.`, { field: key });
  }
  const status = String(q.status ?? '').trim().toUpperCase();
  const homeroom = String(q.homeroom ?? '').trim().toLowerCase();
  return {
    page: toPositiveInt(q.page, 1, TEACHER_LIMITS.LIST_PAGE_MAX),
    limit: toPositiveInt(q.limit, TEACHER_LIMITS.LIST_PAGE_SIZE_DEFAULT, TEACHER_LIMITS.LIST_PAGE_SIZE_MAX),
    search: searchText(q, 'search'),
    subject: searchText(q, 'subject'),
    homeroom: Object.values(HOMEROOM_FILTER).includes(homeroom) ? homeroom : '',
    status: Object.values(USER_STATUS).includes(status) ? status : '',
  };
}

// GET /teachers/:id?week=YYYY-MM-DD  (SCR-15, UC-16)
export function teacherDetailRequest(req) {
  const id = teacherId(req);
  const week = req.query?.week;
  if (!isQueryValue(week)) throw badRequest(ERROR_CODES.INVALID_DATE, 'week must be YYYY-MM-DD.');
  if (week && !isIsoDate(week)) throw badRequest(ERROR_CODES.INVALID_DATE, 'week must be a real date YYYY-MM-DD.');
  return { id, week: week || null };
}

// PATCH /teachers/:id  body { fullName, departmentId?, subjectIds }  (SCR-17, UC-17)
export function updateTeacherRequest(req) {
  const id = teacherId(req);
  const body = req.body;
  if (!isPlainObject(body)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Body must be a JSON object.');

  // UC-17: not login identifiers. UC-99: only System Admin changes username / email / phone.
  const identifiers = LOGIN_IDENTIFIER_FIELDS.filter((f) => f in body);
  if (identifiers.length) {
    throw new AppError(403, ERROR_CODES.LOGIN_IDENTIFIER_READONLY, 'Only System Admin can change username, email or phone.', {
      fields: identifiers,
    });
  }
  const unknown = Object.keys(body).filter((k) => !TEACHER_EDITABLE_FIELDS.includes(k));
  if (unknown.length) throw badRequest(ERROR_CODES.UNKNOWN_FIELD, 'Unknown fields.', { fields: unknown });

  // fullName – person name rules (teacher.text.js)
  if (body.fullName != null && typeof body.fullName !== 'string') {
    throw badRequest(ERROR_CODES.INVALID_NAME, 'Full name must be text.', { field: 'fullName', reason: 'INVALID_CHAR' });
  }
  const name = checkPersonName(body.fullName ?? '', {
    min: TEACHER_LIMITS.FULL_NAME_MIN_LETTERS,
    max: TEACHER_LIMITS.FULL_NAME_MAX,
  });
  if (name.reason === 'REQUIRED') throw badRequest(ERROR_CODES.REQUIRED, 'Full name is required.', { field: 'fullName' });
  if (name.reason === 'TOO_LONG') {
    throw badRequest(ERROR_CODES.FIELD_TOO_LONG, 'Full name is too long.', { field: 'fullName', max: TEACHER_LIMITS.FULL_NAME_MAX });
  }
  if (name.reason) throw badRequest(ERROR_CODES.INVALID_NAME, 'Invalid full name.', { field: 'fullName', reason: name.reason });

  // departmentId – picked from the departments list (02/11/2026): omitted = keep, null / '' = no department.
  let departmentId;
  if ('departmentId' in body) {
    if (body.departmentId == null || body.departmentId === '') departmentId = null;
    else if (isId(body.departmentId)) departmentId = String(body.departmentId);
    else throw badRequest(ERROR_CODES.DEPARTMENT_INVALID, 'Unknown department.', { field: 'departmentId' });
  }

  // subjectIds – list of subject ids
  if (!Array.isArray(body.subjectIds)) throw badRequest(ERROR_CODES.REQUIRED, 'subjectIds must be a list.', { field: 'subjectIds' });
  if (body.subjectIds.length > TEACHER_LIMITS.SUBJECTS_PER_TEACHER_MAX) {
    throw badRequest(ERROR_CODES.TOO_MANY, 'Too many subjects.', { field: 'subjectIds', max: TEACHER_LIMITS.SUBJECTS_PER_TEACHER_MAX });
  }
  if (body.subjectIds.some((s) => !isId(s))) throw badRequest(ERROR_CODES.SUBJECT_INVALID, 'Unknown subject.', { field: 'subjectIds' });
  const subjectIds = [...new Set(body.subjectIds.map(String))];
  // business-rules §4 "Teachers": a teacher keeps at least one subject.
  if (!subjectIds.length) throw badRequest(ERROR_CODES.REQUIRED, 'Choose at least one subject.', { field: 'subjectIds' });

  return { id, fullName: name.value, departmentId, subjectIds };
}

// ── Homeroom (SCR-18, UC-19) ───────────────────────────────────────────────

// GET /homeroom-assignments?schoolYearId=  (SCR-18, UC-19)
export function homeroomBoardQuery(req) {
  return { schoolYearId: optionalSchoolYearId(req.query?.schoolYearId) };
}

// teacherId / previousTeacherId: null or an id (empty string counts as null)
const optionalIdOk = (v) => v == null || v === '' || isId(v);

// PUT /homeroom-assignments  body { schoolYearId, changes: [{ classId, teacherId|null, previousTeacherId|null }] }
export function saveHomeroomRequest(req) {
  const body = req.body;
  if (!isPlainObject(body)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Body must be a JSON object.');
  const { schoolYearId, changes } = body;
  if (!isId(schoolYearId)) throw badRequest(ERROR_CODES.REQUIRED, 'schoolYearId is required.', { field: 'schoolYearId' });
  if (!Array.isArray(changes) || !changes.length) throw badRequest(ERROR_CODES.REQUIRED, 'No changes to save.', { field: 'changes' });
  if (changes.length > HOMEROOM_RULES.MAX_CHANGES_PER_SAVE) throw badRequest(ERROR_CODES.TOO_MANY, 'Too many changes.');

  const seen = new Set();
  const items = changes.map((ch) => {
    if (!isPlainObject(ch) || !isId(ch.classId) || !optionalIdOk(ch.teacherId) || !optionalIdOk(ch.previousTeacherId)) {
      throw badRequest(ERROR_CODES.INVALID_INPUT, 'Invalid class or teacher id.');
    }
    const classId = String(ch.classId);
    if (seen.has(classId)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'A class appears twice.');
    seen.add(classId);
    return { classId, teacherId: toNullableId(ch.teacherId), previousTeacherId: toNullableId(ch.previousTeacherId) };
  });
  return { schoolYearId: String(schoolYearId), changes: items };
}

// ── Teaching assignment (SCR-19, UC-18) ────────────────────────────────────

// GET /teaching-assignments?schoolYearId=&date=YYYY-MM-DD  (SCR-19, UC-18)
export function teachingBoardQuery(req) {
  const date = req.query?.date;
  if (!isQueryValue(date) || (date && !isIsoDate(date))) throw badRequest(ERROR_CODES.INVALID_DATE, 'date must be a real date YYYY-MM-DD.');
  return { schoolYearId: optionalSchoolYearId(req.query?.schoolYearId), date: date || undefined };
}


// PUT /teaching-assignments
// body { schoolYearId, date, changes: [{ classId, subjectId, teacherId|null, previousTeacherId|null }] }
export function saveTeachingRequest(req) {
  const body = req.body;
  if (!isPlainObject(body)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Body must be a JSON object.');
  const { schoolYearId, date, changes } = body;
  if (!isId(schoolYearId)) throw badRequest(ERROR_CODES.REQUIRED, 'schoolYearId is required.', { field: 'schoolYearId' });
  if (!isIsoDate(date)) throw badRequest(ERROR_CODES.INVALID_DATE, 'date must be a real date YYYY-MM-DD.');
  if (!Array.isArray(changes) || !changes.length) throw badRequest(ERROR_CODES.REQUIRED, 'No changes to save.', { field: 'changes' });
  if (changes.length > TEACHING_RULES.MAX_CHANGES_PER_SAVE) throw badRequest(ERROR_CODES.TOO_MANY, 'Too many changes.');

  const seen = new Set();
  const items = changes.map((ch) => {
    if (!isPlainObject(ch) || !isId(ch.classId) || !isId(ch.subjectId) || !optionalIdOk(ch.teacherId) || !optionalIdOk(ch.previousTeacherId)) {
      throw badRequest(ERROR_CODES.INVALID_INPUT, 'Invalid class, subject or teacher id.');
    }
    const key = `${ch.classId}:${ch.subjectId}`;
    if (seen.has(key)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'A class/subject pair appears twice.');
    seen.add(key);
    return {
      classId: String(ch.classId),
      subjectId: String(ch.subjectId),
      teacherId: toNullableId(ch.teacherId),
      previousTeacherId: toNullableId(ch.previousTeacherId),
    };
  });
  return { schoolYearId: String(schoolYearId), date, changes: items };
}

// ── Departments (UC-114) ───────────────────────────────────────────────────

export function departmentIdParam(req) {
  const id = req.params?.id;
  if (!isId(id)) throw notFound(ERROR_CODES.DEPARTMENT_NOT_FOUND, 'Department not found.');
  return String(id);
}

// POST /departments { name, subjectIds } and PATCH /departments/:id { name?, subjectIds? }.
// Returns { name?, subjectIds? } – a field left out of a PATCH stays as it is.
export function departmentBody(req, { partial }) {
  const body = req.body;
  if (!isPlainObject(body)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Body must be a JSON object.');
  const unknown = Object.keys(body).filter((k) => !DEPARTMENT_EDITABLE_FIELDS.includes(k));
  if (unknown.length) throw badRequest(ERROR_CODES.UNKNOWN_FIELD, 'Unknown fields.', { fields: unknown });

  const out = {};
  if (!partial || body.name !== undefined) {
    const name = checkDepartmentName(body.name, { max: TEACHER_LIMITS.DEPARTMENT_NAME_MAX });
    if (name.reason) throw badRequest(ERROR_CODES.DEPARTMENT_NAME_INVALID, 'Invalid department name.', { field: 'name', reason: name.reason });
    out.name = name.value;
  }
  if (!partial || body.subjectIds !== undefined) {
    const list = body.subjectIds ?? [];
    if (!Array.isArray(list) || list.length > TEACHER_LIMITS.SUBJECTS_PER_DEPARTMENT_MAX || !list.every(isId)) {
      throw badRequest(ERROR_CODES.SUBJECT_INVALID, 'subjectIds must be a list of subject ids.', { field: 'subjectIds' });
    }
    out.subjectIds = [...new Set(list.map(String))];
  }
  if (partial && !Object.keys(out).length) throw badRequest(ERROR_CODES.REQUIRED, 'Nothing to change.');
  return out;
}
