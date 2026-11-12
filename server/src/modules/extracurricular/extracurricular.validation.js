import { badRequest } from '../../utils/AppError.js';
import { ACTIVITY_LIMITS, ERROR_CODES, REGISTRATION_STATUS } from './extracurricular.constants.js';

// Input checks before the database (CLAUDE.md). Times are Vietnam local time "YYYY-MM-DDTHH:MM" (as FE-10).

const invalid = (field, message = `Invalid ${field}.`) => badRequest(ERROR_CODES.INVALID_INPUT, message, { field });
export const isId = (v) => /^[1-9]\d{0,17}$/.test(String(v ?? ''));
const isLocal = (v) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/.test(v)
  && !Number.isNaN(Date.parse(`${v}:00Z`)) && new Date(`${v}:00Z`).toISOString().slice(0, 16) === v;
const length = (s) => [...s].length;

function idParam(req, name) {
  const v = req.params[name];
  if (!isId(v)) throw invalid(name);
  return String(v);
}
export const eventIdParam = (req) => idParam(req, 'eventId');
export const studentIdParam = (req) => idParam(req, 'studentId');

// GET /extracurricular-events?classId=&status=upcoming|past|all
export function listQuery(req) {
  const { classId, status } = req.query;
  if (classId !== undefined && classId !== '' && !isId(classId)) throw invalid('classId');
  if (status !== undefined && status !== '' && !['upcoming', 'past', 'all'].includes(status)) throw invalid('status');
  return { classId: classId ? String(classId) : null, status: status || 'upcoming' };
}

// GET /:eventId/registrations?search=&status=REGISTERED|CANCELLED|NONE|all  (NONE = studying, never registered)
export function registrationQuery(req) {
  const { search, status } = req.query;
  if (search !== undefined && (typeof search !== 'string' || search.length > ACTIVITY_LIMITS.SEARCH_MAX)) throw invalid('search');
  if (status !== undefined && status !== '' && ![...Object.values(REGISTRATION_STATUS), 'NONE', 'all'].includes(status)) throw invalid('status');
  return { search: search?.trim() || '', status: status || REGISTRATION_STATUS.REGISTERED };
}

const FIELDS = ['stamp', 'classId', 'title', 'description', 'location', 'startAt', 'endAt', 'registrationDeadline', 'capacity'];

function text(b, field, code, max) {
  const v = b[field];
  if (v !== undefined && v !== null && typeof v !== 'string') throw invalid(field);
  const t = (v ?? '').normalize('NFC').trim();
  if (!t) throw badRequest(code, `${field} is required.`, { reason: 'EMPTY' });
  if (length(t) > max) throw badRequest(code, `${field} is too long.`, { reason: 'TOO_LONG', max });
  return t;
}

// POST / PUT body (UC-50, UC-51). classId only on create (an activity never changes class).
export function activityBody(req, { create }) {
  const b = req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw invalid('body', 'Body must be a JSON object.');
  const extra = Object.keys(b).filter((k) => !FIELDS.includes(k) || (k === 'classId' && !create));
  if (extra.length) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Unknown fields.', { fields: extra });
  if (create && !isId(b.classId)) throw invalid('classId');

  const title = text(b, 'title', ERROR_CODES.TITLE, ACTIVITY_LIMITS.TITLE_MAX);
  const description = text(b, 'description', ERROR_CODES.DESCRIPTION, ACTIVITY_LIMITS.DESCRIPTION_MAX);
  const location = text(b, 'location', ERROR_CODES.LOCATION, ACTIVITY_LIMITS.LOCATION_MAX);

  if (!isLocal(b.startAt)) throw invalid('startAt');
  if (b.endAt !== undefined && b.endAt !== null && b.endAt !== '' && !isLocal(b.endAt)) throw invalid('endAt');
  if (!isLocal(b.registrationDeadline)) throw invalid('registrationDeadline');
  const endAt = b.endAt || null;
  if (endAt && endAt <= b.startAt) throw badRequest(ERROR_CODES.TIME, 'endAt must be after startAt.', { reason: 'END_BEFORE_START' });
  if (b.registrationDeadline > b.startAt) {
    throw badRequest(ERROR_CODES.TIME, 'The registration deadline must not be after the start.', { reason: 'DEADLINE_AFTER_START' });
  }

  let capacity = null;
  if (b.capacity !== undefined && b.capacity !== null && b.capacity !== '') {
    if (!Number.isInteger(b.capacity) || b.capacity < 1 || b.capacity > ACTIVITY_LIMITS.CAPACITY_MAX) {
      throw badRequest(ERROR_CODES.CAPACITY, 'Capacity must be a whole number from 1.', { reason: 'RANGE', max: ACTIVITY_LIMITS.CAPACITY_MAX });
    }
    capacity = b.capacity;
  }
  if (b.stamp !== undefined && (typeof b.stamp !== 'string' || b.stamp.length > 64)) throw invalid('stamp');

  return {
    classId: create ? String(b.classId) : undefined,
    stamp: create ? undefined : (b.stamp ?? null),
    title, description, location, startAt: b.startAt, endAt, registrationDeadline: b.registrationDeadline, capacity,
  };
}

// POST /:eventId/registrations { studentId } (UC-54)
export function registerBody(req) {
  const b = req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw invalid('body', 'Body must be a JSON object.');
  const extra = Object.keys(b).filter((k) => k !== 'studentId');
  if (extra.length) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Unknown fields.', { fields: extra });
  if (!isId(b.studentId)) throw invalid('studentId');
  return { studentId: String(b.studentId) };
}
