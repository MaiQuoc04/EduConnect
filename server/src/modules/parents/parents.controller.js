import { badRequest } from '../../utils/AppError.js';
import * as parentsService from './parents.service.js';

// FE-14 Parent Management (owner: Anh). Every value is checked here before the DB is touched.
// Same rules as the FE-02 student list (UC-07) so both lists behave alike: q max 100, page >= 1,
// pageSize 1..100 (default 20), a repeated parameter (?page=1&page=2) is rejected.
const LIST_KEYS = ['q', 'hasChildren', 'accountStatus', 'page', 'pageSize'];
const HAS_CHILDREN = ['yes', 'no'];
const ACCOUNT_STATUSES = ['ACTIVE', 'LOCKED'];
const MAX_Q_LENGTH = 100;
const DEFAULT_PAGE_SIZE = 20; // as UC-07 (an ASSUMPTION there: the documents do not fix a page size)
const MAX_PAGE_SIZE = 100;

function invalid(field) {
  return badRequest('MSG_INVALID_PARAM', `Invalid value for "${field}".`, { field });
}

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

function optionalEnum(query, field, allowed) {
  const value = optionalString(query, field);
  if (value === undefined || value === '') return undefined;
  if (!allowed.includes(value)) throw invalid(field);
  return value;
}

// ASSUMPTION: unknown query keys are rejected (as the FE-02 parent lookup does), so a typo such as
// "haschildren" gives 400 instead of a silently unfiltered list.
function rejectUnknownKeys(object, allowed) {
  const rejected = Object.keys(object).filter((key) => !allowed.includes(key));
  if (rejected.length) {
    throw badRequest('MSG_INVALID_PARAM', 'These fields are not accepted here.', { fields: rejected });
  }
}

// UC-104 View Parent List: GET /parents?q=&hasChildren=yes|no&accountStatus=ACTIVE|LOCKED&page=&pageSize=
export async function list(req, res) {
  const query = req.query ?? {};
  rejectUnknownKeys(query, LIST_KEYS);
  const q = optionalString(query, 'q');
  if (q && q.length > MAX_Q_LENGTH) throw invalid('q');
  const filters = {
    q: q || undefined,
    hasChildren: optionalEnum(query, 'hasChildren', HAS_CHILDREN),
    accountStatus: optionalEnum(query, 'accountStatus', ACCOUNT_STATUSES),
    page: optionalInt(query, 'page', { fallback: 1 }),
    pageSize: optionalInt(query, 'pageSize', { max: MAX_PAGE_SIZE, fallback: DEFAULT_PAGE_SIZE }),
  };
  res.json(await parentsService.listParents(filters));
}

// parentId is parents.parent_id (the id UC-12 / UC-13 use). BIGINT ids are JS numbers (db.js): a positive safe integer.
function parseParentId(value) {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > Number.MAX_SAFE_INTEGER) {
    throw invalid('parentId');
  }
  return Number(value);
}

// UC-105 View Parent Detail: GET /parents/:parentId
export async function detail(req, res) {
  res.json(await parentsService.getParentDetail(parseParentId(req.params.parentId)));
}

// --- UC-106 ---------------------------------------------------------------------------------------------------

// The only keys UC-106 accepts. Login identifiers (email, phone, username) are changed by System Admin only
// (business-rules §3, UC-99), password / status / lock by FE-13: sending them is refused with their names, never
// silently ignored (same rule and codes as UC-09).
const EDITABLE_FIELDS = ['fullName', 'occupation', 'address'];
const MAX_FULL_NAME_LENGTH = 150; // users.full_name VARCHAR(150)
const MAX_OCCUPATION_LENGTH = 100; // parents.occupation VARCHAR(100), business-rules §3 (same limit and code as UC-108)
const MAX_ADDRESS_LENGTH = 500; // users.address, business-rules §3 (same limit and code as UC-107 / UC-09)

// Cleaned as in UC-09 / UC-107: NFC (a name typed with combining accents is stored like the precomposed one), trim,
// single spaces. Lengths count characters as PostgreSQL does (code points), not UTF-16 units.
const clean = (value) => value.normalize('NFC').trim().replace(/\s+/g, ' ');
const length = (value) => [...value].length;

// Optional text that null, empty or blank clears (business-rules §3: occupation and address can be cleared).
function clearableText(body, field, max, tooLongCode) {
  if (body[field] !== null && typeof body[field] !== 'string') throw invalid(field);
  const value = clean(body[field] ?? '');
  if (length(value) > max) {
    throw badRequest(tooLongCode, `The ${field} must not exceed ${max} characters.`, { field, max });
  }
  return value || null;
}

// UC-106 Update Parent Information: PATCH /parents/:parentId { fullName?, occupation?, address? }.
// PATCH = partial update, as UC-09 PATCH /students/:studentId; a field that is not sent is kept.
export async function update(req, res) {
  const parentId = parseParentId(req.params.parentId);
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
    // Required when present: null, empty or blank is refused (a name cannot be cleared).
    if (typeof body.fullName !== 'string') throw invalid('fullName');
    const fullName = clean(body.fullName);
    if (length(fullName) < 1 || length(fullName) > MAX_FULL_NAME_LENGTH) throw invalid('fullName');
    changes.fullName = fullName;
  }
  if ('occupation' in body) {
    changes.occupation = clearableText(body, 'occupation', MAX_OCCUPATION_LENGTH, 'MSG_OCCUPATION_TOO_LONG');
  }
  if ('address' in body) {
    changes.address = clearableText(body, 'address', MAX_ADDRESS_LENGTH, 'MSG_ADDRESS_TOO_LONG');
  }
  res.json(await parentsService.updateParent(parentId, changes));
}
