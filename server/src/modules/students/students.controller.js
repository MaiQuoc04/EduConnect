import { badRequest } from '../../utils/AppError.js';
import * as studentsService from './students.service.js';

const ENROLLMENT_STATUSES = ['STUDYING', 'TRANSFERRED', 'DROPPED'];
const ACCOUNT_STATUSES = ['ACTIVE', 'LOCKED'];
const MAX_Q_LENGTH = 100;
// ASSUMPTION: the documents do not fix a page size; default 20, at most 100.
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function invalid(field) {
  return badRequest('MSG_INVALID_PARAM', `Invalid value for "${field}".`, { field });
}

// Query values are strings; a repeated parameter (?page=1&page=2) arrives as an array and is rejected.
function optionalString(query, field) {
  const value = query[field];
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw invalid(field);
  return value.trim();
}

function optionalInt(query, field, { min = 1, max = Number.MAX_SAFE_INTEGER, fallback } = {}) {
  const value = optionalString(query, field);
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw invalid(field);
  const n = Number(value);
  if (n < min || n > max) throw invalid(field);
  return n;
}

function optionalBoolean(query, field) {
  const value = optionalString(query, field);
  if (value === undefined || value === '') return false;
  if (value !== 'true' && value !== 'false') throw invalid(field);
  return value === 'true';
}

function optionalEnum(query, field, allowed) {
  const value = optionalString(query, field);
  if (value === undefined || value === '') return undefined;
  if (!allowed.includes(value)) throw invalid(field);
  return value;
}

// UC-07 View Student List
export async function list(req, res) {
  const query = req.query ?? {};
  const q = optionalString(query, 'q');
  if (q && q.length > MAX_Q_LENGTH) throw invalid('q');
  // ASSUMPTION: UC-07 says "filter by class and status" without saying which status; the system has two, so
  // status = enrollment status (class_enrollments) and accountStatus = account status (users, business-rules §3).
  const filters = {
    q: q || undefined,
    classId: optionalInt(query, 'classId'),
    schoolYearId: optionalInt(query, 'schoolYearId'),
    status: optionalEnum(query, 'status', ENROLLMENT_STATUSES),
    accountStatus: optionalEnum(query, 'accountStatus', ACCOUNT_STATUSES),
    // unassigned=true: students with no enrollment in the school year (see listStudents).
    unassigned: optionalBoolean(query, 'unassigned'),
    page: optionalInt(query, 'page', { fallback: 1 }),
    pageSize: optionalInt(query, 'pageSize', { max: MAX_PAGE_SIZE, fallback: DEFAULT_PAGE_SIZE }),
  };
  // Students without a class have neither a class nor an enrollment status to filter on.
  if (filters.unassigned && filters.classId) throw invalid('classId');
  if (filters.unassigned && filters.status) throw invalid('status');
  res.json(await studentsService.listStudents(filters));
}
