// FE-03 Teacher Management – shared constants.

export const USER_STATUS = Object.freeze({ ACTIVE: 'ACTIVE', LOCKED: 'LOCKED' });
export const ENROLLMENT_STATUS = Object.freeze({ STUDYING: 'STUDYING' });
export const ROLES = Object.freeze({ SCHOOL_MANAGER: 'SCHOOL_MANAGER' });

// Column sizes from database/educonnect_schema_v0.2.sql
export const TEACHER_LIMITS = Object.freeze({
  FULL_NAME_MAX: 150, // users.full_name
  DEPARTMENT_MAX: 100, // teachers.department
  FULL_NAME_MIN_LETTERS: 2,
  DEPARTMENT_MIN: 2,
  LIST_PAGE_SIZE_DEFAULT: 10,
  LIST_PAGE_SIZE_MAX: 100,
  LIST_PAGE_MAX: 100000,
  SEARCH_MAX: 100, // SCR-13 search box and subject filter
  SUBJECTS_PER_TEACHER_MAX: 30,
});

// PATCH /teachers/:id accepts only these fields (SCR-15).
export const TEACHER_EDITABLE_FIELDS = Object.freeze(['fullName', 'department', 'subjectIds']);
// Login identifiers – System Admin only (UC-99); a School Manager request that contains them is refused.
export const LOGIN_IDENTIFIER_FIELDS = Object.freeze(['username', 'email', 'phone']);

// SCR-13 list filters
export const HOMEROOM_FILTER = Object.freeze({ HAS: 'has', NONE: 'none' });

// ASSUMPTION (SCR-16 design, not in business-rules.md): change here if the team decides otherwise.
export const HOMEROOM_RULES = Object.freeze({
  MAX_CLASSES_PER_TEACHER: 1,
  LOCKED_TEACHER_ALLOWED: false,
  MAX_CHANGES_PER_SAVE: 500,
});

// ASSUMPTION (SCR-17): locked teachers get no new teaching assignment; changes are never back-dated.
export const TEACHING_RULES = Object.freeze({
  LOCKED_TEACHER_ALLOWED: false,
  MAX_CHANGES_PER_SAVE: 1000,
});
