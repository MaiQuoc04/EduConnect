import { ERROR_CODES } from '../constants/errorCodes.js';
import { HOMEROOM_FILTER, TEACHER_LIMITS, USER_STATUS } from '../constants/teacher.constants.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { isId, isIsoDate, normalizeSpaces, toPositiveInt } from '../utils/validation.js';

function teacherId(req) {
  const id = String(req.params.id ?? '');
  if (!isId(id)) throw notFound(ERROR_CODES.TEACHER_NOT_FOUND, 'Teacher not found.');
  return id;
}

// GET /teachers?page=&limit=&search=&subject=&homeroom=has|none&status=ACTIVE|LOCKED  (SCR-13, UC-15)
export function listTeachersQuery(req) {
  const q = req.query ?? {};
  const status = String(q.status ?? '').trim();
  const homeroom = String(q.homeroom ?? '').trim();
  return {
    page: toPositiveInt(q.page, 1),
    limit: Math.min(toPositiveInt(q.limit, TEACHER_LIMITS.LIST_PAGE_SIZE_DEFAULT), TEACHER_LIMITS.LIST_PAGE_SIZE_MAX),
    search: String(q.search ?? '').trim(),
    subject: String(q.subject ?? '').trim(),
    homeroom: Object.values(HOMEROOM_FILTER).includes(homeroom) ? homeroom : '',
    status: Object.values(USER_STATUS).includes(status) ? status : '',
  };
}

// GET /teachers/:id?week=YYYY-MM-DD  (SCR-14, UC-16)
export function teacherDetailRequest(req) {
  const id = teacherId(req);
  const week = req.query?.week ? String(req.query.week) : null;
  if (week && !isIsoDate(week)) throw badRequest(ERROR_CODES.INVALID_DATE, 'week must be YYYY-MM-DD.');
  return { id, week };
}

// PATCH /teachers/:id  body { fullName, department, subjectIds }  (SCR-15, UC-17)
// Login identifiers (username, email, phone) are System Admin only (UC-99) and are not read here.
export function updateTeacherRequest(req) {
  const id = teacherId(req);
  const body = req.body ?? {};

  const fullName = normalizeSpaces(body.fullName);
  if (!fullName) throw badRequest(ERROR_CODES.REQUIRED, 'Full name is required.', { field: 'fullName' });
  if (fullName.length > TEACHER_LIMITS.FULL_NAME_MAX) {
    throw badRequest(ERROR_CODES.FIELD_TOO_LONG, 'Full name is too long.', { field: 'fullName', max: TEACHER_LIMITS.FULL_NAME_MAX });
  }

  const department = typeof body.department === 'string' ? body.department.trim() : '';
  if (department.length > TEACHER_LIMITS.DEPARTMENT_MAX) {
    throw badRequest(ERROR_CODES.FIELD_TOO_LONG, 'Department is too long.', { field: 'department', max: TEACHER_LIMITS.DEPARTMENT_MAX });
  }

  if (!Array.isArray(body.subjectIds)) {
    throw badRequest(ERROR_CODES.REQUIRED, 'subjectIds must be a list.', { field: 'subjectIds' });
  }
  const subjectIds = [...new Set(body.subjectIds.map(String))];
  if (subjectIds.some((s) => !isId(s))) throw badRequest(ERROR_CODES.SUBJECT_INVALID, 'Unknown subject.', { field: 'subjectIds' });
  // ASSUMPTION: a teacher keeps at least one subject (SCR-15 design marks the field as required).
  if (!subjectIds.length) throw badRequest(ERROR_CODES.REQUIRED, 'Choose at least one subject.', { field: 'subjectIds' });

  return { id, fullName, department: department || null, subjectIds };
}
