// FE-10 timetable (Dung, It2) – constants and API error codes. The client maps each code to Vietnamese in
// client/src/messages.js.

export const ROLES = Object.freeze({
  SCHOOL_MANAGER: 'SCHOOL_MANAGER',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
  PARENT: 'PARENT',
});

export const TIMETABLE_LIMITS = Object.freeze({
  // ASSUMPTION: lessons run Monday (1) to Saturday (6); Sunday is a day off. The table accepts 1..7 if this changes.
  WEEKDAY_MIN: 1,
  WEEKDAY_MAX: 6,
  ROOM_MAX: 50, // timetable_entries.room / timetable_slots.room
  IMPORT_MAX_ROWS: 3000,
  REPORT_ITEMS: 10, // problems listed in one error answer
});

// Period times (13/11/2026, Dung's request): the School Manager sets the start of each session (morning, afternoon)
// and one length for every period; the breaks between periods keep their current lengths.
export const PERIOD_TIME_LIMITS = Object.freeze({
  DURATION_MIN: 30, // ASSUMPTION: a period lasts 30..60 minutes (45 in the seed)
  DURATION_MAX: 60,
  SESSION_GAP: 45, // a break longer than this between two periods separates two sessions (morning / afternoon)
  LUNCH_MIN: 60, // ASSUMPTION: at least 60 minutes between the end of a session and the start of the next one
  DAY_START: '05:00', // ASSUMPTION: lessons between 05:00 and 22:00
  DAY_END: '22:00',
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: 'MSG_INVALID_INPUT',
  INVALID_DATE: 'MSG_INVALID_DATE', // details: { field }
  CLASS_NOT_FOUND: 'MSG_CLASS_NOT_FOUND',
  SCHOOL_YEAR_NOT_FOUND: 'MSG_SCHOOL_YEAR_NOT_FOUND',
  SCHOOL_YEAR_ENDED: 'MSG_SCHOOL_YEAR_ENDED',
  TIMETABLE_STALE: 'MSG_TIMETABLE_STALE', // 409 – someone else saved this class after the editor was opened
  TIMETABLE_RANGE: 'MSG_TIMETABLE_RANGE', // details: { min, max } – start today or later, inside the school year
  TIMETABLE_ENTRY_INVALID: 'MSG_TIMETABLE_ENTRY_INVALID', // details: { index, field }
  TIMETABLE_DUPLICATE_PERIOD: 'MSG_TIMETABLE_DUPLICATE_PERIOD', // details: { weekday, period }
  TIMETABLE_SUBJECT_NOT_IN_CLASS: 'MSG_TIMETABLE_SUBJECT_NOT_IN_CLASS', // details: { subjects }
  TIMETABLE_NO_TEACHER: 'MSG_TIMETABLE_NO_TEACHER', // details: { items: [{ subject, from, to, periods }] }
  TIMETABLE_TEACHER_CLASH: 'MSG_TIMETABLE_TEACHER_CLASH', // details: { items: [{ date, period, teacher, otherClass }] }
  TIMETABLES_NOT_READY: 'MSG_TIMETABLES_NOT_READY', // tables timetables / timetable_entries missing on this database
  IMPORT_FILE: 'MSG_IMPORT_FILE',
  IMPORT_TEMPLATE: 'MSG_IMPORT_TEMPLATE', // details: { missing }
  IMPORT_EMPTY: 'MSG_IMPORT_EMPTY',
  IMPORT_TOO_MANY_ROWS: 'MSG_IMPORT_TOO_MANY_ROWS', // details: { max }
  IMPORT_HAS_ERRORS: 'MSG_TIMETABLE_IMPORT_HAS_ERRORS', // the file still has errors – nothing was saved
  PERIOD_TIMES_INVALID: 'MSG_PERIOD_TIMES_INVALID', // details: { field, reason, min?, max?, session? }
  PERIOD_TIMES_CHANGED: 'MSG_PERIOD_TIMES_CHANGED', // 409 – someone else changed the period times meanwhile
  PERIOD_TIMES_EMPTY: 'MSG_PERIOD_TIMES_EMPTY', // time_slots has no rows
});
