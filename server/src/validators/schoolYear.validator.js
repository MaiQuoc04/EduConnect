import { ERROR_CODES } from '../constants/errorCodes.js';
import { notFound } from '../utils/AppError.js';
import { isId } from '../utils/validation.js';

// Optional ?schoolYearId= ; a malformed id is treated as "not found".
export function optionalSchoolYearId(value) {
  if (value == null || value === '') return undefined;
  if (!isId(value)) throw notFound(ERROR_CODES.SCHOOL_YEAR_NOT_FOUND, 'School year not found.');
  return String(value);
}
