// FE-10 input checks. Each function takes the request and returns clean input, or throws AppError 400 / 404.
import { notFound } from '../../utils/AppError.js';
import { ERROR_CODES } from './timetable.constants.js';

export const isId = (v) => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0) || (typeof v === 'string' && /^[1-9]\d{0,17}$/.test(v));

// A real calendar date YYYY-MM-DD between 2000 and 2100.
export function isIsoDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= '2000-01-01' && v <= '2100-12-31';
}

// GET /timetables?schoolYearId=
export function listQuery(req) {
  const id = req.query?.schoolYearId;
  if (id !== undefined && id !== '' && !isId(id)) throw notFound(ERROR_CODES.SCHOOL_YEAR_NOT_FOUND, 'School year not found.');
  return { schoolYearId: id ? String(id) : undefined };
}
