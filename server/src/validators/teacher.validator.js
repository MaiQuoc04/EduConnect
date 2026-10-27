import { ERROR_CODES } from '../constants/errorCodes.js';
import {
  HOMEROOM_FILTER,
  LOGIN_IDENTIFIER_FIELDS,
  TEACHER_EDITABLE_FIELDS,
  TEACHER_LIMITS,
  USER_STATUS,
} from '../constants/teacher.constants.js';
import { AppError, badRequest, notFound } from '../utils/AppError.js';
import { checkDepartment, checkPersonName, cleanText } from '../utils/text.js';
import { isId, isIsoDate, isPlainObject, isQueryValue, toPositiveInt } from '../utils/validation.js';

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

// GET /teachers?page=&limit=&search=&subject=&homeroom=has|none&status=ACTIVE|LOCKED  (SCR-13, UC-15)
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

// GET /teachers/:id?week=YYYY-MM-DD  (SCR-14, UC-16)
export function teacherDetailRequest(req) {
  const id = teacherId(req);
  const week = req.query?.week;
  if (!isQueryValue(week)) throw badRequest(ERROR_CODES.INVALID_DATE, 'week must be YYYY-MM-DD.');
  if (week && !isIsoDate(week)) throw badRequest(ERROR_CODES.INVALID_DATE, 'week must be a real date YYYY-MM-DD.');
  return { id, week: week || null };
}

// PATCH /teachers/:id  body { fullName, department, subjectIds }  (SCR-15, UC-17)
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

  // fullName – person name rules (utils/text.js)
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

  // department – optional label
  if (body.department != null && typeof body.department !== 'string') {
    throw badRequest(ERROR_CODES.INVALID_DEPARTMENT, 'Department must be text.', { field: 'department', reason: 'INVALID_CHAR' });
  }
  const dept = checkDepartment(body.department ?? '', { min: TEACHER_LIMITS.DEPARTMENT_MIN, max: TEACHER_LIMITS.DEPARTMENT_MAX });
  if (dept.reason === 'TOO_LONG') {
    throw badRequest(ERROR_CODES.FIELD_TOO_LONG, 'Department is too long.', { field: 'department', max: TEACHER_LIMITS.DEPARTMENT_MAX });
  }
  if (dept.reason) throw badRequest(ERROR_CODES.INVALID_DEPARTMENT, 'Invalid department.', { field: 'department', reason: dept.reason });

  // subjectIds – list of subject ids
  if (!Array.isArray(body.subjectIds)) throw badRequest(ERROR_CODES.REQUIRED, 'subjectIds must be a list.', { field: 'subjectIds' });
  if (body.subjectIds.length > TEACHER_LIMITS.SUBJECTS_PER_TEACHER_MAX) {
    throw badRequest(ERROR_CODES.TOO_MANY, 'Too many subjects.', { field: 'subjectIds', max: TEACHER_LIMITS.SUBJECTS_PER_TEACHER_MAX });
  }
  if (body.subjectIds.some((s) => !isId(s))) throw badRequest(ERROR_CODES.SUBJECT_INVALID, 'Unknown subject.', { field: 'subjectIds' });
  const subjectIds = [...new Set(body.subjectIds.map(String))];
  // ASSUMPTION: a teacher keeps at least one subject (SCR-15 design marks the field as required).
  if (!subjectIds.length) throw badRequest(ERROR_CODES.REQUIRED, 'Choose at least one subject.', { field: 'subjectIds' });

  return { id, fullName: name.value, department: dept.value || null, subjectIds };
}
