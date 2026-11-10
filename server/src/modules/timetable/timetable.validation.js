// FE-10 input checks. Each function takes the request and returns clean input, or throws AppError 400 / 404.
import { badRequest, notFound } from '../../utils/AppError.js';
import { ERROR_CODES, TIMETABLE_LIMITS } from './timetable.constants.js';

export const isId = (v) => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0) || (typeof v === 'string' && /^[1-9]\d{0,17}$/.test(v));
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// A real calendar date YYYY-MM-DD between 2000 and 2100.
export function isIsoDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= '2000-01-01' && v <= '2100-12-31';
}

function dateParam(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(ERROR_CODES.INVALID_DATE, `${field} is required.`, { field });
    return undefined;
  }
  if (!isIsoDate(value)) throw badRequest(ERROR_CODES.INVALID_DATE, `${field} must be a real date YYYY-MM-DD.`, { field });
  return value;
}

export function classIdParam(req) {
  const id = req.params?.classId;
  if (!isId(id)) throw notFound(ERROR_CODES.CLASS_NOT_FOUND, 'Class not found.');
  return String(id);
}

// GET /timetables?schoolYearId=
export function listQuery(req) {
  const id = req.query?.schoolYearId;
  if (id !== undefined && id !== '' && !isId(id)) throw notFound(ERROR_CODES.SCHOOL_YEAR_NOT_FOUND, 'School year not found.');
  return { schoolYearId: id ? String(id) : undefined };
}

// ?date=YYYY-MM-DD (optional)
export const dateQuery = (req) => ({ date: dateParam(req.query?.date, 'date') });

const cleanRoom = (v) =>
  typeof v === 'string' ? v.normalize('NFC').replace(/[\u0000-\u001F\u007F-\u009F​-‏⁠﻿]/g, '').replace(/\s+/g, ' ').trim() : '';

// Checks one weekly pattern: [{ weekday 1..6, slotId, subjectId, room? }], one subject per (weekday, period).
export function readEntries(list) {
  if (!Array.isArray(list)) throw badRequest(ERROR_CODES.TIMETABLE_ENTRY_INVALID, 'entries must be a list.', { field: 'entries' });
  if (list.length > 7 * 20) throw badRequest(ERROR_CODES.TIMETABLE_ENTRY_INVALID, 'Too many entries.', { field: 'entries', max: 140 });
  const seen = new Set();
  return list.map((e, index) => {
    if (!isPlainObject(e)) throw badRequest(ERROR_CODES.TIMETABLE_ENTRY_INVALID, 'Invalid entry.', { index });
    const weekday = Number(e.weekday);
    if (!Number.isInteger(weekday) || weekday < TIMETABLE_LIMITS.WEEKDAY_MIN || weekday > TIMETABLE_LIMITS.WEEKDAY_MAX) {
      throw badRequest(ERROR_CODES.TIMETABLE_ENTRY_INVALID, 'weekday must be 1 (Monday) .. 6 (Saturday).', { index, field: 'weekday' });
    }
    if (!isId(e.slotId)) throw badRequest(ERROR_CODES.TIMETABLE_ENTRY_INVALID, 'Invalid period.', { index, field: 'slotId' });
    if (!isId(e.subjectId)) throw badRequest(ERROR_CODES.TIMETABLE_ENTRY_INVALID, 'Invalid subject.', { index, field: 'subjectId' });
    if (e.room !== undefined && e.room !== null && typeof e.room !== 'string') {
      throw badRequest(ERROR_CODES.TIMETABLE_ENTRY_INVALID, 'room must be text.', { index, field: 'room' });
    }
    const room = cleanRoom(e.room ?? '');
    if (room.length > TIMETABLE_LIMITS.ROOM_MAX) {
      throw badRequest(ERROR_CODES.TIMETABLE_ENTRY_INVALID, 'Room is too long.', { index, field: 'room', max: TIMETABLE_LIMITS.ROOM_MAX });
    }
    const key = `${weekday}-${e.slotId}`;
    if (seen.has(key)) throw badRequest(ERROR_CODES.TIMETABLE_DUPLICATE_PERIOD, 'Two subjects in the same period.', { weekday, slotId: String(e.slotId) });
    seen.add(key);
    return { weekday, slotId: String(e.slotId), subjectId: String(e.subjectId), room: room || null };
  });
}

// PUT /timetables/classes/:classId  { startDate, endDate?, entries, stamp? } (stamp: from the editor data)
export function saveRequest(req) {
  const body = req.body;
  if (!isPlainObject(body)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Body must be a JSON object.');
  const unknown = Object.keys(body).filter((k) => !['startDate', 'endDate', 'entries', 'stamp'].includes(k));
  if (unknown.length) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Unknown fields.', { fields: unknown });
  const startDate = dateParam(body.startDate, 'startDate', { required: true });
  const endDate = dateParam(body.endDate, 'endDate');
  if (endDate && endDate < startDate) throw badRequest(ERROR_CODES.INVALID_DATE, 'endDate must not be before startDate.', { field: 'endDate' });
  if (body.stamp !== undefined && (typeof body.stamp !== 'string' || body.stamp.length > 4000)) {
    throw badRequest(ERROR_CODES.INVALID_INPUT, 'Invalid stamp.', { field: 'stamp' });
  }
  return { classId: classIdParam(req), startDate, endDate, entries: readEntries(body.entries), stamp: body.stamp };
}
