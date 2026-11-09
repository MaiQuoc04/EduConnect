// FE-03 Teacher Management (Dung) – constants and API error codes of this module.
// The client maps each error code to Vietnamese in client/src/messages.js.


export const USER_STATUS = Object.freeze({ ACTIVE: 'ACTIVE', LOCKED: 'LOCKED' });
export const ENROLLMENT_STATUS = Object.freeze({ STUDYING: 'STUDYING' });
export const ROLES = Object.freeze({ SCHOOL_MANAGER: 'SCHOOL_MANAGER' });

// Column sizes from database/educonnect_schema_v0.3.sql
export const TEACHER_LIMITS = Object.freeze({
  FULL_NAME_MAX: 150, // users.full_name
  FULL_NAME_MIN_LETTERS: 2,
  LIST_PAGE_SIZE_DEFAULT: 10,
  LIST_PAGE_SIZE_MAX: 100,
  LIST_PAGE_MAX: 100000,
  SEARCH_MAX: 100, // SCR-14 search box and subject filter
  SUBJECTS_PER_TEACHER_MAX: 30,
  DEPARTMENT_NAME_MAX: 100, // departments.department_name
  SUBJECTS_PER_DEPARTMENT_MAX: 50,
});

// POST / PATCH /departments accept only these fields (UC-114).
export const DEPARTMENT_EDITABLE_FIELDS = Object.freeze(['name', 'subjectIds']);

// PATCH /teachers/:id accepts only these fields (SCR-17).
// departmentId: an id from the departments list (or null = no department); omitted = keep the current department.
export const TEACHER_EDITABLE_FIELDS = Object.freeze(['fullName', 'departmentId', 'subjectIds']);
// Login identifiers – System Admin only (UC-99); a School Manager request that contains them is refused.
export const LOGIN_IDENTIFIER_FIELDS = Object.freeze(['username', 'email', 'phone']);

// SCR-14 list filters
export const HOMEROOM_FILTER = Object.freeze({ HAS: 'has', NONE: 'none' });

// business-rules §4 "Teachers" (agreed 02/11/2026).
export const HOMEROOM_RULES = Object.freeze({
  MAX_CLASSES_PER_TEACHER: 1,
  LOCKED_TEACHER_ALLOWED: false,
  MAX_CHANGES_PER_SAVE: 500,
});

// business-rules §4 "Teachers": locked teachers get no new teaching assignment; changes are never back-dated.
export const TEACHING_RULES = Object.freeze({
  LOCKED_TEACHER_ALLOWED: false,
  MAX_CHANGES_PER_SAVE: 1000,
});

// API error codes
export const ERROR_CODES = Object.freeze({
  REQUIRED: 'MSG_REQUIRED',
  FIELD_TOO_LONG: 'MSG_FIELD_TOO_LONG',
  INVALID_INPUT: 'MSG_INVALID_INPUT',
  INVALID_DATE: 'INVALID_DATE',
  TOO_MANY: 'MSG_TOO_MANY',
  INVALID_NAME: 'MSG_INVALID_NAME', // details: { field, reason } – reason from teacher.text.js NAME_REASON
  DEPARTMENT_INVALID: 'MSG_DEPARTMENT_INVALID', // departmentId not in the departments list
  DEPARTMENTS_NOT_READY: 'MSG_DEPARTMENTS_NOT_READY', // table departments / department_subjects missing on this database
  DEPARTMENT_NOT_FOUND: 'MSG_DEPARTMENT_NOT_FOUND',
  DEPARTMENT_NAME_INVALID: 'MSG_DEPARTMENT_NAME_INVALID', // details: { field, reason } – reason from NAME_REASON
  DEPARTMENT_NAME_TAKEN: 'MSG_DEPARTMENT_NAME_TAKEN', // another department has the same name (case / accents ignored)
  DEPARTMENT_IN_USE: 'MSG_DEPARTMENT_IN_USE', // details: { teachers } – teachers still in the department
  SUBJECT_IN_OTHER_DEPARTMENT: 'MSG_SUBJECT_IN_OTHER_DEPARTMENT', // details: { items: [{ subject, department }] }
  SUBJECT_NOT_IN_DEPARTMENT: 'MSG_SUBJECT_NOT_IN_DEPARTMENT', // details: { subjects, department } (UC-17)
  LOGIN_IDENTIFIER_READONLY: 'MSG_LOGIN_IDENTIFIER_READONLY', // username / email / phone: System Admin only
  UNKNOWN_FIELD: 'MSG_UNKNOWN_FIELD',
  // teacher
  TEACHER_NOT_FOUND: 'TEACHER_NOT_FOUND',
  SUBJECT_INVALID: 'MSG_SUBJECT_INVALID',
  SUBJECT_IN_USE: 'MSG_SUBJECT_IN_USE',
  // school year
  SCHOOL_YEAR_NOT_FOUND: 'SCHOOL_YEAR_NOT_FOUND',
  // homeroom (SCR-18)
  HOMEROOM_STALE: 'MSG_HOMEROOM_STALE',
  HOMEROOM_LIMIT: 'MSG_HOMEROOM_LIMIT',
  TEACHER_LOCKED: 'MSG_TEACHER_LOCKED',
  // teaching assignment (SCR-19)
  EFFECTIVE_DATE: 'MSG_EFFECTIVE_DATE',
  SUBJECT_NOT_IN_CLASS: 'MSG_SUBJECT_NOT_IN_CLASS',
  ASSIGNMENT_STALE: 'MSG_ASSIGNMENT_STALE',
  TEACHER_NOT_QUALIFIED: 'MSG_TEACHER_NOT_QUALIFIED',
  ASSIGNMENT_IN_TIMETABLE: 'MSG_ASSIGNMENT_IN_TIMETABLE',
  TIMETABLE_CLASH: 'MSG_TIMETABLE_CLASH',
});
