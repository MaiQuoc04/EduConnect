// FE-10 class calendar – input checks. Each function takes the request and returns clean input, or throws 400 / 404.
import { badRequest, notFound } from '../../utils/AppError.js';
import { ERROR_CODES, EVENT_LIMITS } from './calendar.constants.js';

export const isId = (v) => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0) || (typeof v === 'string' && /^[1-9]\d{0,17}$/.test(v));
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// A real calendar date YYYY-MM-DD between 2000 and 2100.
export function isIsoDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= '2000-01-01' && v <= '2100-12-31';
}

// Local Vietnam time "YYYY-MM-DDTHH:MM" (what <input type="datetime-local"> sends). The SQL reads it with
// `AT TIME ZONE 'Asia/Ho_Chi_Minh'`, so the server's own time zone never matters.
export function isLocalDateTime(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v)) return false;
  return isIsoDate(v.slice(0, 10));
}

function dateTimeField(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(ERROR_CODES.INVALID_DATE, `${field} is required.`, { field });
    return null;
  }
  if (!isLocalDateTime(value)) throw badRequest(ERROR_CODES.INVALID_DATE, `${field} must be YYYY-MM-DDTHH:MM.`, { field });
  return value;
}

const cleanText = (v) =>
  typeof v === 'string' ? v.normalize('NFC').replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏⁠﻿]/g, '') : v;

export const eventIdParam = (req) => {
  const id = req.params?.eventId;
  if (!isId(id)) throw notFound(ERROR_CODES.NOT_FOUND, 'Event not found.');
  return String(id);
};

export const classIdParam = (req) => {
  const id = req.params?.classId;
  if (!isId(id)) throw notFound('MSG_CLASS_NOT_FOUND', 'Class not found.');
  return String(id);
};

// GET /class-events?from=&to=&classId=&childId=
export function listQuery(req) {
  const q = req.query ?? {};
  for (const f of ['from', 'to']) {
    if (!isIsoDate(q[f])) throw badRequest(ERROR_CODES.INVALID_DATE, `${f} must be a real date YYYY-MM-DD.`, { field: f });
  }
  const days = (new Date(`${q.to}T00:00:00Z`) - new Date(`${q.from}T00:00:00Z`)) / 86400000;
  if (days < 0 || days > EVENT_LIMITS.RANGE_MAX_DAYS) {
    throw badRequest(ERROR_CODES.RANGE, 'from..to must be at most 62 days, from first.', { max: EVENT_LIMITS.RANGE_MAX_DAYS });
  }
  for (const f of ['classId', 'childId']) {
    if (q[f] !== undefined && q[f] !== '' && !isId(q[f])) throw badRequest(ERROR_CODES.INVALID_INPUT, `Invalid ${f}.`, { field: f });
  }
  return { from: q.from, to: q.to, classId: q.classId ? String(q.classId) : null, childId: q.childId ? String(q.childId) : null };
}
