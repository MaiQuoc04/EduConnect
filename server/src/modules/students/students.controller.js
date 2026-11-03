import { badRequest } from '../../utils/AppError.js';
import { normalizePhone, PHONE_RE } from '../../utils/phone.js';
import * as parentLinkImport from './parentLinkImport.service.js';
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

// UC-12 View Student's Parents
export async function parents(req, res) {
  res.json(await studentsService.getStudentParents(parseStudentId(req.params.studentId)));
}

// --- UC-13 ---------------------------------------------------------------------------------------------------

const LINK_FIELDS = ['parentId', 'relationshipType'];

// parentId is parents.parent_id, the same id GET /students/:studentId/parents returns.
function parseParentId(value) {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > Number.MAX_SAFE_INTEGER) {
    throw invalid('parentId');
  }
  return Number(value);
}

// TEMPORARY (UC-13, SCR-13): GET /students/parents/lookup?phone=. Read-only lookup of ONE existing parent account
// by its exact phone number, so School Manager sees the parent's name before linking. It exists only because FE-14
// (UC-104 View Parent List, owner: Khanh) is not built yet: remove it and switch SCR-13 to Khanh's endpoint then.
// The phone is normalised as everywhere a phone is typed (business-rules §3, utils/phone.js): spaces, dots and
// dashes removed, a leading +84 becomes 0; valid = 0 + 9 digits.
// Not finding anyone is a normal answer (200 { found: false }), not a 404.
export async function lookupParent(req, res) {
  const query = req.query ?? {};
  rejectUnknownKeys(query, ['phone']);
  const raw = optionalString(query, 'phone');
  if (!raw) throw invalid('phone');
  const phone = normalizePhone(raw);
  if (!PHONE_RE.test(phone)) throw invalid('phone');
  const parent = await studentsService.findParentByPhone(phone);
  res.json(parent ? { found: true, parent } : { found: false });
}

// UC-13 Link Parent–Student: { parentId, relationshipType }. Unknown keys are rejected, as in UC-09 / UC-10.
export async function linkParent(req, res) {
  const studentId = parseStudentId(req.params.studentId);
  const body = req.body ?? {};
  if (!isPlainObject(body)) {
    throw badRequest('MSG_INVALID_PARAM', 'The request body must be a JSON object.', { field: 'body' });
  }
  rejectUnknownKeys(body, LINK_FIELDS);
  const { parentId, relationshipType } = body;
  if (!isId(parentId)) throw invalid('parentId');
  // Exact upper-case values only ("father" is rejected, not normalised), as gender in UC-09.
  if (!studentsService.RELATIONSHIP_TYPES.includes(relationshipType)) {
    throw badRequest('MSG_INVALID_RELATIONSHIP_TYPE', 'Invalid relationship type.',
      { field: 'relationshipType', allowed: studentsService.RELATIONSHIP_TYPES });
  }
  res.json(await studentsService.linkParent(studentId, parentId, relationshipType));
}

// UC-13 Unlink Parent–Student. No body: anything sent is rejected rather than ignored.
export async function unlinkParent(req, res) {
  const studentId = parseStudentId(req.params.studentId);
  const parentId = parseParentId(req.params.parentId);
  const body = req.body ?? {};
  if (!isPlainObject(body)) {
    throw badRequest('MSG_INVALID_PARAM', 'The request body must be a JSON object.', { field: 'body' });
  }
  rejectUnknownKeys(body, []);
  res.json(await studentsService.unlinkParent(studentId, parentId));
}

// --- UC-09 ---------------------------------------------------------------------------------------------------

// The only fields UC-09 may change. Login identifiers (email, phone, username) belong to System Admin (UC-99,
// business-rules §3); student_code, account status, class and nickname have their own owners. Any other key is
// rejected with 400, never silently ignored, so School Manager does not think it was saved.
const EDITABLE_FIELDS = ['fullName', 'dob', 'gender', 'address'];
const GENDERS = ['MALE', 'FEMALE', 'OTHER']; // students.gender has no CHECK constraint, so it is enforced here
const MAX_FULL_NAME_LENGTH = 150; // users.full_name VARCHAR(150)
const MAX_ADDRESS_LENGTH = 500; // users.address, business-rules §3 (same limit and code as UC-107)

// "2011-02-30" passes the pattern but is not a real date: rebuild it and compare.
function isRealDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// UC-09 Update Student: partial update of fullName / dob / gender / address (business-rules §4 "Students").
// Fields left out keep their value.
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
  if ('address' in body) {
    // Cleaned as in UC-107 (trim, single spaces); null, empty or blank clears it (business-rules §3).
    if (body.address !== null && typeof body.address !== 'string') throw invalid('address');
    const address = (body.address ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
    if ([...address].length > MAX_ADDRESS_LENGTH) {
      throw badRequest('MSG_ADDRESS_TOO_LONG', `The address must not exceed ${MAX_ADDRESS_LENGTH} characters.`,
        { field: 'address', max: MAX_ADDRESS_LENGTH });
    }
    changes.address = address || null;
  }
  res.json(await studentsService.updateStudent(studentId, changes));
}

// --- UC-10 ---------------------------------------------------------------------------------------------------

// The only key UC-10 accepts. There is no "reason": class_enrollments has no column for it and transfers are not
// in activity_logs (business-rules §13), so a reason could not be stored; it is rejected like any unknown key
// instead of being accepted and thrown away.
const TRANSFER_FIELDS = ['toClassId'];

// UC-10 Transfer Student: move a student to another class of the same school year.
export async function transfer(req, res) {
  const studentId = parseStudentId(req.params.studentId);
  const body = req.body ?? {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('MSG_INVALID_PARAM', 'The request body must be a JSON object.', { field: 'body' });
  }
  const rejected = Object.keys(body).filter((key) => !TRANSFER_FIELDS.includes(key));
  if (rejected.length) {
    throw badRequest('MSG_INVALID_PARAM', 'These fields are not accepted here.', { fields: rejected });
  }
  // A JSON number, as every id the API returns (BIGINT -> Number, db.js).
  const { toClassId } = body;
  if (!Number.isSafeInteger(toClassId) || toClassId < 1) throw invalid('toClassId');
  res.json(await studentsService.transferStudent(studentId, toClassId));
}

// --- UC-11 ---------------------------------------------------------------------------------------------------

const PROMOTE_FIELDS = ['fromSchoolYearId', 'toSchoolYearId', 'groups'];
const PROMOTE_GROUP_FIELDS = ['toClassId', 'studentIds'];

const isId = (value) => Number.isSafeInteger(value) && value >= 1;
const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function rejectUnknownKeys(object, allowed) {
  const rejected = Object.keys(object).filter((key) => !allowed.includes(key));
  if (rejected.length) {
    throw badRequest('MSG_INVALID_PARAM', 'These fields are not accepted here.', { fields: rejected });
  }
}

// UC-11 Promote Students: enrol students into classes of a later school year, in groups (one target class per
// group, so an old class can be split and a student repeating a year can go to a class of the same grade).
// The whole body is checked here before the DB is touched; per-student problems are SKIPPED results (service).
export async function promote(req, res) {
  const body = req.body ?? {};
  if (!isPlainObject(body)) {
    throw badRequest('MSG_INVALID_PARAM', 'The request body must be a JSON object.', { field: 'body' });
  }
  rejectUnknownKeys(body, PROMOTE_FIELDS);
  const { fromSchoolYearId, toSchoolYearId, groups } = body;
  if (!isId(fromSchoolYearId)) throw invalid('fromSchoolYearId');
  if (!isId(toSchoolYearId)) throw invalid('toSchoolYearId');
  if (fromSchoolYearId === toSchoolYearId) {
    throw badRequest('MSG_SAME_SCHOOL_YEAR',
      'The destination school year must differ from the source school year. Use transfer (UC-10) within a year.');
  }
  if (!Array.isArray(groups) || groups.length === 0) throw invalid('groups');

  const seen = new Set();
  const duplicates = new Set();
  let total = 0;
  groups.forEach((group, index) => {
    if (!isPlainObject(group)) throw invalid(`groups[${index}]`);
    rejectUnknownKeys(group, PROMOTE_GROUP_FIELDS);
    if (!isId(group.toClassId)) throw invalid(`groups[${index}].toClassId`);
    if (!Array.isArray(group.studentIds) || group.studentIds.length === 0) throw invalid(`groups[${index}].studentIds`);
    for (const studentId of group.studentIds) {
      if (!isId(studentId)) throw invalid(`groups[${index}].studentIds`);
      if (seen.has(studentId)) duplicates.add(studentId);
      seen.add(studentId);
    }
    total += group.studentIds.length;
  });
  if (duplicates.size) {
    throw badRequest('MSG_DUPLICATE_STUDENT_IN_REQUEST', 'A student appears more than once in the request.',
      { studentIds: [...duplicates] });
  }
  if (total > studentsService.MAX_PROMOTE_STUDENTS) {
    throw badRequest('MSG_TOO_MANY_STUDENTS', `At most ${studentsService.MAX_PROMOTE_STUDENTS} students per request.`,
      { max: studentsService.MAX_PROMOTE_STUDENTS, total });
  }

  res.json(await studentsService.promoteStudents({
    fromSchoolYearId,
    toSchoolYearId,
    groups: groups.map(({ toClassId, studentIds }) => ({ toClassId, studentIds })),
  }));
}

// --- UC-14 ---------------------------------------------------------------------------------------------------

// Multer reads file names as latin1; turn them back into UTF-8 (same as UC-96, admin.controller.js), so a
// Vietnamese file name keeps its .xlsx / .csv ending readable.
function uploadedFile(req) {
  if (!req.file) return null;
  return { ...req.file, originalname: Buffer.from(req.file.originalname, 'latin1').toString('utf8') };
}

// UC-14 Import Parent–Student Links – template download (.xlsx, three columns and one example row).
export async function parentLinkTemplate(_req, res) {
  const { fileName, contentType, buffer } = await parentLinkImport.buildTemplate();
  res
    .set('Content-Type', contentType)
    .set('Content-Disposition', `attachment; filename="${fileName}"`)
    .send(buffer);
}

// UC-14 – check the file, nothing is saved. multipart/form-data, field "file".
export async function previewParentLinks(req, res) {
  res.json(await parentLinkImport.previewImport({ file: uploadedFile(req) }));
}

// UC-14 – check the same file again and save every valid row. Same answer shape as the preview.
export async function importParentLinks(req, res) {
  res.json(await parentLinkImport.importLinks({ file: uploadedFile(req) }));
}
