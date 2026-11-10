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

const FIELDS = ['classId', 'subjectId', 'categoryId', 'title', 'description', 'startAt', 'endAt', 'forStudents', 'forParents', 'forSubjectTeachers', 'viewerIds'];

// POST /class-events and PUT /class-events/:eventId (the class of an event never changes).
export function eventBody(req, { create }) {
  const b = req.body;
  if (!isPlainObject(b)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Body must be a JSON object.');
  const unknown = Object.keys(b).filter((k) => !FIELDS.includes(k) || (!create && k === 'classId'));
  if (unknown.length) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Unknown fields.', { fields: unknown });

  if (create && !isId(b.classId)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'classId is required.', { field: 'classId' });
  if (b.subjectId !== undefined && b.subjectId !== null && !isId(b.subjectId)) {
    throw badRequest(ERROR_CODES.INVALID_INPUT, 'Invalid subjectId.', { field: 'subjectId' });
  }
  if (!isId(b.categoryId)) throw badRequest(ERROR_CODES.CATEGORY, 'categoryId is required.', { field: 'categoryId' });

  if (typeof b.title !== 'string') throw badRequest(ERROR_CODES.TITLE, 'Title is required.', { reason: 'REQUIRED' });
  const title = cleanText(b.title).replace(/\s+/g, ' ').trim();
  if (!title) throw badRequest(ERROR_CODES.TITLE, 'Title is required.', { reason: 'REQUIRED' });
  if (title.length > EVENT_LIMITS.TITLE_MAX) throw badRequest(ERROR_CODES.TITLE, 'Title is too long.', { reason: 'TOO_LONG', max: EVENT_LIMITS.TITLE_MAX });

  if (b.description !== undefined && b.description !== null && typeof b.description !== 'string') {
    throw badRequest(ERROR_CODES.INVALID_INPUT, 'description must be text.', { field: 'description' });
  }
  const description = cleanText(b.description ?? '').replace(/\r\n/g, '\n').trim();
  if (description.length > EVENT_LIMITS.DESCRIPTION_MAX) {
    throw badRequest(ERROR_CODES.DESCRIPTION, 'Description is too long.', { max: EVENT_LIMITS.DESCRIPTION_MAX });
  }

  const startAt = dateTimeField(b.startAt, 'startAt', { required: true });
  const endAt = dateTimeField(b.endAt, 'endAt');
  if (endAt && endAt <= startAt) throw badRequest(ERROR_CODES.TIME, 'endAt must be after startAt.', { reason: 'END_BEFORE_START' });

  const flags = {};
  for (const f of ['forStudents', 'forParents', 'forSubjectTeachers']) {
    if (b[f] !== undefined && typeof b[f] !== 'boolean') throw badRequest(ERROR_CODES.INVALID_INPUT, `${f} must be true or false.`, { field: f });
    flags[f] = b[f] === true;
  }

  const raw = b.viewerIds ?? [];
  if (!Array.isArray(raw) || raw.some((v) => !isId(v))) throw badRequest(ERROR_CODES.INVALID_INPUT, 'viewerIds must be a list of user ids.', { field: 'viewerIds' });
  const viewerIds = [...new Set(raw.map(String))];
  if (viewerIds.length > EVENT_LIMITS.VIEWERS_MAX) {
    throw badRequest(ERROR_CODES.VIEWERS, 'Too many people.', { reason: 'TOO_MANY', max: EVENT_LIMITS.VIEWERS_MAX });
  }

  return {
    classId: create ? String(b.classId) : undefined,
    subjectId: b.subjectId ? String(b.subjectId) : null,
    categoryId: String(b.categoryId),
    title,
    description: description || null,
    startAt,
    endAt,
    ...flags,
    viewerIds,
  };
}
