import { ERROR_CODES } from '../constants/errorCodes.js';
import { HOMEROOM_RULES } from '../constants/teacher.constants.js';
import { badRequest } from '../utils/AppError.js';
import { isId, toNullableId } from '../utils/validation.js';
import { optionalSchoolYearId } from './schoolYear.validator.js';

// GET /homeroom-assignments?schoolYearId=  (SCR-16, UC-19)
export function homeroomBoardQuery(req) {
  return { schoolYearId: optionalSchoolYearId(req.query?.schoolYearId) };
}

// PUT /homeroom-assignments  body { schoolYearId, changes: [{ classId, teacherId|null, previousTeacherId|null }] }
export function saveHomeroomRequest(req) {
  const { schoolYearId, changes } = req.body ?? {};
  if (!isId(schoolYearId)) throw badRequest(ERROR_CODES.REQUIRED, 'schoolYearId is required.', { field: 'schoolYearId' });
  if (!Array.isArray(changes) || !changes.length) throw badRequest(ERROR_CODES.REQUIRED, 'No changes to save.', { field: 'changes' });
  if (changes.length > HOMEROOM_RULES.MAX_CHANGES_PER_SAVE) throw badRequest(ERROR_CODES.TOO_MANY, 'Too many changes.');

  const seen = new Set();
  const items = changes.map((ch) => {
    const classId = String(ch?.classId ?? '');
    const teacherId = toNullableId(ch?.teacherId);
    const previousTeacherId = toNullableId(ch?.previousTeacherId);
    if (!isId(classId) || (teacherId && !isId(teacherId)) || (previousTeacherId && !isId(previousTeacherId))) {
      throw badRequest(ERROR_CODES.INVALID_INPUT, 'Invalid class or teacher id.');
    }
    if (seen.has(classId)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'A class appears twice.');
    seen.add(classId);
    return { classId, teacherId, previousTeacherId };
  });
  return { schoolYearId: String(schoolYearId), changes: items };
}
