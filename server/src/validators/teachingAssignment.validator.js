import { ERROR_CODES } from '../constants/errorCodes.js';
import { TEACHING_RULES } from '../constants/teacher.constants.js';
import { badRequest } from '../utils/AppError.js';
import { isId, isIsoDate, toNullableId } from '../utils/validation.js';
import { optionalSchoolYearId } from './schoolYear.validator.js';

// GET /teaching-assignments?schoolYearId=&date=YYYY-MM-DD  (SCR-17, UC-18)
export function teachingBoardQuery(req) {
  const date = req.query?.date ? String(req.query.date) : undefined;
  if (date && !isIsoDate(date)) throw badRequest(ERROR_CODES.INVALID_DATE, 'date must be YYYY-MM-DD.');
  return { schoolYearId: optionalSchoolYearId(req.query?.schoolYearId), date };
}

// PUT /teaching-assignments
// body { schoolYearId, date, changes: [{ classId, subjectId, teacherId|null, previousTeacherId|null }] }
export function saveTeachingRequest(req) {
  const { schoolYearId, date, changes } = req.body ?? {};
  if (!isId(schoolYearId)) throw badRequest(ERROR_CODES.REQUIRED, 'schoolYearId is required.', { field: 'schoolYearId' });
  if (!isIsoDate(date)) throw badRequest(ERROR_CODES.INVALID_DATE, 'date must be YYYY-MM-DD.');
  if (!Array.isArray(changes) || !changes.length) throw badRequest(ERROR_CODES.REQUIRED, 'No changes to save.', { field: 'changes' });
  if (changes.length > TEACHING_RULES.MAX_CHANGES_PER_SAVE) throw badRequest(ERROR_CODES.TOO_MANY, 'Too many changes.');

  const seen = new Set();
  const items = changes.map((ch) => {
    const classId = String(ch?.classId ?? '');
    const subjectId = String(ch?.subjectId ?? '');
    const teacherId = toNullableId(ch?.teacherId);
    const previousTeacherId = toNullableId(ch?.previousTeacherId);
    if (![classId, subjectId].every(isId) || (teacherId && !isId(teacherId)) || (previousTeacherId && !isId(previousTeacherId))) {
      throw badRequest(ERROR_CODES.INVALID_INPUT, 'Invalid class, subject or teacher id.');
    }
    const key = `${classId}:${subjectId}`;
    if (seen.has(key)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'A class/subject pair appears twice.');
    seen.add(key);
    return { classId, subjectId, teacherId, previousTeacherId };
  });
  return { schoolYearId: String(schoolYearId), date: String(date), changes: items };
}
