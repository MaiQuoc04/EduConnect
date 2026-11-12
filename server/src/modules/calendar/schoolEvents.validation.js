// School calendar – input checks (FE-10, Dung, 13/11/2026).
import { badRequest, notFound } from '../../utils/AppError.js';
import { ERROR_CODES, SCHOOL_EVENT_CODES as C, SCHOOL_EVENT_LIMITS as L } from './calendar.constants.js';
import { isId, isIsoDate, isLocalDateTime } from './calendar.validation.js';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clean = (v) => (typeof v === 'string' ? v.normalize('NFC').replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏⁠﻿]/g, '').trim() : v);

export const schoolEventIdParam = (req) => {
  const id = req.params?.eventId;
  if (!isId(id)) throw notFound(C.NOT_FOUND, 'School event not found.');
  return String(id);
};

// GET /school-events?from=&to=&classId=
export function rangeQuery(req) {
  const q = req.query ?? {};
  for (const f of ['from', 'to']) {
    if (!isIsoDate(q[f])) throw badRequest(ERROR_CODES.INVALID_DATE, `${f} must be a real date YYYY-MM-DD.`, { field: f });
  }
  const days = (new Date(`${q.to}T00:00:00Z`) - new Date(`${q.from}T00:00:00Z`)) / 86400000;
  if (days < 0 || days > L.RANGE_MAX_DAYS) throw badRequest(ERROR_CODES.RANGE, 'from..to must be at most 62 days.', { max: L.RANGE_MAX_DAYS });
  if (q.classId !== undefined && q.classId !== '' && !isId(q.classId)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Invalid classId.', { field: 'classId' });
  return { from: q.from, to: q.to, classId: q.classId ? String(q.classId) : null };
}

// GET /school-events/upcoming?limit=
export function upcomingQuery(req) {
  const raw = req.query?.limit;
  if (raw === undefined || raw === '') return { limit: 5 };
  if (!/^\d{1,2}$/.test(String(raw)) || Number(raw) < 1 || Number(raw) > L.UPCOMING_MAX) {
    throw badRequest(ERROR_CODES.INVALID_INPUT, `limit must be 1..${L.UPCOMING_MAX}.`, { field: 'limit' });
  }
  return { limit: Number(raw) };
}

const FIELDS = ['stamp', 'title', 'description', 'location', 'startAt', 'endAt', 'gradeLevelId'];

// POST / PUT body. Times are Vietnam local "YYYY-MM-DDTHH:MM"; gradeLevelId null = whole school.
export function schoolEventBody(req, { create }) {
  const b = req.body;
  if (!isPlainObject(b)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Body must be an object.');
  const extra = Object.keys(b).filter((k) => !FIELDS.includes(k) || (create && k === 'stamp'));
  if (extra.length) throw badRequest(ERROR_CODES.INVALID_INPUT, `Unknown field ${extra[0]}.`, { field: extra[0] });

  const title = clean(b.title);
  if (typeof title !== 'string' || !title) throw badRequest(C.TITLE, 'Title is required.', { reason: 'REQUIRED', max: L.TITLE_MAX });
  if (title.length > L.TITLE_MAX) throw badRequest(C.TITLE, 'Title is too long.', { reason: 'TOO_LONG', max: L.TITLE_MAX });

  const location = b.location == null ? '' : clean(b.location);
  if (typeof location !== 'string') throw badRequest(ERROR_CODES.INVALID_INPUT, 'Invalid location.', { field: 'location' });
  if (location.length > L.LOCATION_MAX) throw badRequest(C.LOCATION, 'Location is too long.', { max: L.LOCATION_MAX });

  const description = b.description == null ? '' : typeof b.description === 'string' ? b.description.normalize('NFC').replace(/\r\n/g, '\n').trim() : null;
  if (description === null) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Invalid description.', { field: 'description' });
  if (description.length > L.DESCRIPTION_MAX) throw badRequest(C.DESCRIPTION, 'Description is too long.', { max: L.DESCRIPTION_MAX });

  if (!isLocalDateTime(b.startAt)) throw badRequest(ERROR_CODES.INVALID_DATE, 'startAt must be YYYY-MM-DDTHH:MM.', { field: 'startAt' });
  let endAt = null;
  if (b.endAt !== undefined && b.endAt !== null && b.endAt !== '') {
    if (!isLocalDateTime(b.endAt)) throw badRequest(ERROR_CODES.INVALID_DATE, 'endAt must be YYYY-MM-DDTHH:MM.', { field: 'endAt' });
    if (b.endAt <= b.startAt) throw badRequest(C.TIME, 'End must be after start.', { reason: 'END_BEFORE_START' });
    endAt = b.endAt;
  }

  let gradeLevelId = null;
  if (b.gradeLevelId !== undefined && b.gradeLevelId !== null && b.gradeLevelId !== '') {
    if (!isId(b.gradeLevelId)) throw badRequest(C.GRADE, 'Invalid grade.');
    gradeLevelId = String(b.gradeLevelId);
  }
  const out = { title, location: location || null, description: description || null, startAt: b.startAt, endAt, gradeLevelId };
  if (!create) {
    if (typeof b.stamp !== 'string' || !b.stamp) throw badRequest(ERROR_CODES.INVALID_INPUT, 'stamp is required.', { field: 'stamp' });
    out.stamp = b.stamp;
  }
  return out;
}
