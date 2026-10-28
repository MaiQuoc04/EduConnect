import { ERROR_CODES } from '../constants/errorCodes.js';
import { TEACHING_RULES } from '../constants/teacher.constants.js';
import { badRequest } from '../utils/AppError.js';
import { isId, isIsoDate, isPlainObject, isQueryValue, toNullableId } from '../utils/validation.js';
import { optionalSchoolYearId } from './schoolYear.validator.js';

// GET /teaching-assignments?schoolYearId=&date=YYYY-MM-DD  (SCR-17, UC-18)
export function teachingBoardQuery(req) {
  const date = req.query?.date;
  if (!isQueryValue(date) || (date && !isIsoDate(date))) throw badRequest(ERROR_CODES.INVALID_DATE, 'date must be a real date YYYY-MM-DD.');
  return { schoolYearId: optionalSchoolYearId(req.query?.schoolYearId), date: date || undefined };
}

const optionalIdOk = (v) => v == null || v === '' || isId(v);

// PUT /teaching-assignments
// body { schoolYearId, date, changes: [{ classId, subjectId, teacherId|null, previousTeacherId|null }] }
export function saveTeachingRequest(req) {
  const body = req.body;
  if (!isPlainObject(body)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Body must be a JSON object.');
  const { schoolYearId, date, changes } = body;
  if (!isId(schoolYearId)) throw badRequest(ERROR_CODES.REQUIRED, 'schoolYearId is required.', { field: 'schoolYearId' });
  if (!isIsoDate(date)) throw badRequest(ERROR_CODES.INVALID_DATE, 'date must be a real date YYYY-MM-DD.');
  if (!Array.isArray(changes) || !changes.length) throw badRequest(ERROR_CODES.REQUIRED, 'No changes to save.', { field: 'changes' });
  if (changes.length > TEACHING_RULES.MAX_CHANGES_PER_SAVE) throw badRequest(ERROR_CODES.TOO_MANY, 'Too many changes.');

  const seen = new Set();
  const items = changes.map((ch) => {
    if (!isPlainObject(ch) || !isId(ch.classId) || !isId(ch.subjectId) || !optionalIdOk(ch.teacherId) || !optionalIdOk(ch.previousTeacherId)) {
      throw badRequest(ERROR_CODES.INVALID_INPUT, 'Invalid class, subject or teacher id.');
    }
    const key = `${ch.classId}:${ch.subjectId}`;
    if (seen.has(key)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'A class/subject pair appears twice.');
    seen.add(key);
    return {
      classId: String(ch.classId),
      subjectId: String(ch.subjectId),
      teacherId: toNullableId(ch.teacherId),
      previousTeacherId: toNullableId(ch.previousTeacherId),
    };
  });
  return { schoolYearId: String(schoolYearId), date, changes: items };
}
