import { ERROR_CODES } from '../constants/errorCodes.js';
import { HOMEROOM_RULES } from '../constants/teacher.constants.js';
import { badRequest } from '../utils/AppError.js';
import { isId, isPlainObject, toNullableId } from '../utils/validation.js';
import { optionalSchoolYearId } from './schoolYear.validator.js';

// GET /homeroom-assignments?schoolYearId=  (SCR-16, UC-19)
export function homeroomBoardQuery(req) {
  return { schoolYearId: optionalSchoolYearId(req.query?.schoolYearId) };
}

// teacherId / previousTeacherId: null or an id (empty string counts as null)
const optionalIdOk = (v) => v == null || v === '' || isId(v);

// PUT /homeroom-assignments  body { schoolYearId, changes: [{ classId, teacherId|null, previousTeacherId|null }] }
export function saveHomeroomRequest(req) {
  const body = req.body;
  if (!isPlainObject(body)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Body must be a JSON object.');
  const { schoolYearId, changes } = body;
  if (!isId(schoolYearId)) throw badRequest(ERROR_CODES.REQUIRED, 'schoolYearId is required.', { field: 'schoolYearId' });
  if (!Array.isArray(changes) || !changes.length) throw badRequest(ERROR_CODES.REQUIRED, 'No changes to save.', { field: 'changes' });
  if (changes.length > HOMEROOM_RULES.MAX_CHANGES_PER_SAVE) throw badRequest(ERROR_CODES.TOO_MANY, 'Too many changes.');

  const seen = new Set();
  const items = changes.map((ch) => {
    if (!isPlainObject(ch) || !isId(ch.classId) || !optionalIdOk(ch.teacherId) || !optionalIdOk(ch.previousTeacherId)) {
      throw badRequest(ERROR_CODES.INVALID_INPUT, 'Invalid class or teacher id.');
    }
    const classId = String(ch.classId);
    if (seen.has(classId)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'A class appears twice.');
    seen.add(classId);
    return { classId, teacherId: toNullableId(ch.teacherId), previousTeacherId: toNullableId(ch.previousTeacherId) };
  });
  return { schoolYearId: String(schoolYearId), changes: items };
}
