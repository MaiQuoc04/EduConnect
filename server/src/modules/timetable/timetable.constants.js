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

// Automatic scheduling (17/11/2026, Dung – spec "Đặc tả: Tự động phân công & xếp thời khoá biểu"). Defaults follow
// CT GDPT 2018 (Thông tư 32/2018 sửa bởi 13/2022), Công văn 7291 (sáng ≤ 5, chiều ≤ 3 tiết) and Thông tư 05/2025
// (17 tiết/tuần, GVCN 13). The School Manager can change every value on the screen before running.
export const AUTO_LIMITS = Object.freeze({
  MORNING_MAX: 5, // a session (buổi) has at most 5 periods of 45 minutes
  AFTERNOON_MAX: 5, // 26/11/2026: was 3; the class limit a day is now the School Manager setting (classMaxDay)
  DAYS_MAX: 6, // at most 6 school days a week (Monday .. Saturday)
  CLASSES_MAX: 200,
  // School-wide limits, defaults of "Cài đặt hệ thống" (Dung, 26/11/2026 – replace the teacher norms):
  // The default is also the highest value the School Manager may set (legal caps).
  TEACHER_NORM_WEEK: 17, // Thông tư 05/2025: THPT teacher norm – "nên dạy", a warning only (27/11/2026)
  HOMEROOM_REDUCTION: 4, // Thông tư 05/2025: a homeroom teacher teaches 4 periods a week less (17 - 4 = 13)
  TEACHER_MAX_WEEK: 25, // norm 17 (Thông tư 05/2025) + at most 50 % over it = 25.5, rounded down
  CLASS_MAX_DAY: 7, // Công văn 4567/BGDĐT-GDPT (2025): a pupil has at most 7 periods of 45 minutes a day
  // Default 38 approved by the lead 27/11/2026 (the dispatch sets no weekly cap, at most 11 sessions a week): 5 days ×
  // 7 + 3. Unlike the others it is not the highest value: the School Manager may set up to CLASS_MAX_DAY × DAYS_MAX = 42.
  CLASS_MAX_WEEK: 38,
  MAX_PER_SUBJECT_DAY: 2, // hard: a subject at most 2 periods a day in a class
  BUSY_MAX: 3000,
  TIME_LIMIT_SEC: 5, // default search time; 1..30
  TIME_LIMIT_SEC_MAX: 30,
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
  // Not thrown since 27/11/2026 (a subject over its periods per week is a warning, `overQuota` of the save result).
  TIMETABLE_OVER_QUOTA: 'MSG_TIMETABLE_OVER_QUOTA', // details: { items: [{ subject, periods, periodsPerWeek }] }
  TIMETABLE_CLASS_LIMIT: 'MSG_TIMETABLE_CLASS_LIMIT', // details: { days: [{ weekday, periods }], maxDay, periods, maxWeek } – school settings
  TIMETABLES_NOT_READY: 'MSG_TIMETABLES_NOT_READY', // tables timetables / timetable_entries missing on this database
  IMPORT_FILE: 'MSG_IMPORT_FILE',
  IMPORT_TEMPLATE: 'MSG_IMPORT_TEMPLATE', // details: { missing }
  IMPORT_EMPTY: 'MSG_IMPORT_EMPTY',
  IMPORT_TOO_MANY_ROWS: 'MSG_IMPORT_TOO_MANY_ROWS', // details: { max }
  IMPORT_HAS_ERRORS: 'MSG_TIMETABLE_IMPORT_HAS_ERRORS', // the file still has errors – nothing was saved
  PERIOD_TIMES_INVALID: 'MSG_PERIOD_TIMES_INVALID', // details: { field, reason, min?, max?, session? }
  PERIOD_TIMES_CHANGED: 'MSG_PERIOD_TIMES_CHANGED', // 409 – someone else changed the period times meanwhile
  PERIOD_TIMES_EMPTY: 'MSG_PERIOD_TIMES_EMPTY', // time_slots has no rows
  AUTO_INVALID: 'MSG_AUTO_INVALID', // details: { field, reason? } – a setting of the automatic scheduling is wrong
  SEMESTER_NOT_FOUND: 'MSG_SEMESTER_NOT_FOUND',
  SEMESTER_ENDED: 'MSG_SEMESTER_ENDED', // the semester is over: nothing left to schedule
  AUTO_STALE: 'MSG_AUTO_STALE', // 409 – assignments or timetables changed after the draft was made
  AUTO_CONFIRM: 'MSG_AUTO_CONFIRM', // 409 – details: { classes } already have a timetable / assignments: confirm overwrite
  AUTO_DRAFT_INVALID: 'MSG_AUTO_DRAFT_INVALID', // 400 – details: { problem, ... } the draft breaks a hard rule
  AUTO_INCOMPLETE: 'MSG_AUTO_INCOMPLETE', // 409 – the draft still has lessons or pairs without a place / teacher
});

// "Nên dạy" of a teacher (27/11/2026): the school norm, 4 periods less for a homeroom teacher (Thông tư 05/2025).
// Only a warning: going over it is allowed up to teacherMaxWeek.
export const normOf = (limits, homeroom) => Math.max(0, limits.teacherNormWeek - (homeroom ? AUTO_LIMITS.HOMEROOM_REDUCTION : 0));
