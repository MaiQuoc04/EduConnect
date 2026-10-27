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

// BIGINT ids arrive as JS numbers (db.js), so the id must be a positive safe integer.
function parseStudentId(value) {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > Number.MAX_SAFE_INTEGER) {
    throw invalid('studentId');
  }
  return Number(value);
}

// UC-08 View Student Detail
export async function detail(req, res) {
  res.json(await studentsService.getStudentDetail(parseStudentId(req.params.studentId)));
}

// --- UC-09 ---------------------------------------------------------------------------------------------------

// The only fields UC-09 may change. Login identifiers (email, phone, username) belong to System Admin (UC-99,
// business-rules §3); student_code, account status, class and nickname have their own owners. Any other key is
// rejected with 400, never silently ignored, so School Manager does not think it was saved.
const EDITABLE_FIELDS = ['fullName', 'dob', 'gender'];
const GENDERS = ['MALE', 'FEMALE', 'OTHER']; // students.gender has no CHECK constraint, so it is enforced here
const MAX_FULL_NAME_LENGTH = 150; // users.full_name VARCHAR(150)

// "2011-02-30" passes the pattern but is not a real date: rebuild it and compare.
function isRealDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// UC-09 Update Student: partial update of fullName / dob / gender. Fields left out keep their value.
export async function update(req, res) {
  const studentId = parseStudentId(req.params.studentId);
  const body = req.body ?? {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('MSG_INVALID_PARAM', 'The request body must be a JSON object.', { field: 'body' });
  }
  const keys = Object.keys(body);
  if (keys.length === 0) throw badRequest('MSG_NO_FIELDS_TO_UPDATE', 'Send at least one field to update.');
  const rejected = keys.filter((key) => !EDITABLE_FIELDS.includes(key));
  if (rejected.length) {
    throw badRequest('MSG_FIELD_NOT_EDITABLE', 'These fields cannot be changed here.', { fields: rejected });
  }

  const changes = {};
  if ('fullName' in body) {
    if (typeof body.fullName !== 'string') throw invalid('fullName');
    // NFC so a name typed with combining accents is stored like the same name typed precomposed.
    const fullName = body.fullName.normalize('NFC').trim().replace(/\s+/g, ' ');
    // Count characters as PostgreSQL does (code points), not UTF-16 units.
    const length = [...fullName].length;
    if (length < 1 || length > MAX_FULL_NAME_LENGTH) throw invalid('fullName');
    changes.fullName = fullName;
  }
  if ('dob' in body) {
    if (body.dob !== null && (typeof body.dob !== 'string' || !isRealDate(body.dob))) throw invalid('dob');
    changes.dob = body.dob; // not in the future / plausible age: checked in SQL against CURRENT_DATE (service)
  }
  if ('gender' in body) {
    if (body.gender !== null && !GENDERS.includes(body.gender)) throw invalid('gender');
    changes.gender = body.gender;
  }
  res.json(await studentsService.updateStudent(studentId, changes));
}
