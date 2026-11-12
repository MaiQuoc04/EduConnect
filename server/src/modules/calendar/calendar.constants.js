// FE-10 class calendar (Dung, It3) – constants and API error codes. The client maps each code to Vietnamese in
// client/src/messages.js.

export const ROLES = Object.freeze({
  SCHOOL_MANAGER: 'SCHOOL_MANAGER',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
  PARENT: 'PARENT',
});

export const TIME_ZONE = 'Asia/Ho_Chi_Minh';

export const EVENT_LIMITS = Object.freeze({
  TITLE_MAX: 255, // class_events.title VARCHAR(255)
  DESCRIPTION_MAX: 2000, // ASSUMPTION: same limit as a chat message (business rules §6)
  VIEWERS_MAX: 100, // ASSUMPTION: people picked one by one; whole groups use the three tick boxes
  RANGE_MAX_DAYS: 62, // a list request covers at most two months (month view + the days around it)
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: 'MSG_INVALID_INPUT',
  INVALID_DATE: 'MSG_INVALID_DATE',
  RANGE: 'MSG_EVENT_RANGE', // details: { max } – list from / to
  NOT_FOUND: 'MSG_EVENT_NOT_FOUND', // missing, deleted or outside the user's audience (same answer)
  NOT_OWNER: 'MSG_EVENT_NOT_OWNER', // 403 – only the creator updates / deletes
  STARTED: 'MSG_EVENT_STARTED', // 409 – the event already started: read only
  CLASS_NOT_ALLOWED: 'MSG_EVENT_CLASS_NOT_ALLOWED', // 403 – not homeroom teacher nor teaching the class
  GENERAL_HOMEROOM_ONLY: 'MSG_EVENT_GENERAL_HOMEROOM_ONLY', // 403 – event without subject
  SUBJECT_NOT_TAUGHT: 'MSG_EVENT_SUBJECT_NOT_TAUGHT', // 403 – no assignment for that subject on the event's date
  CATEGORY: 'MSG_EVENT_CATEGORY', // unknown category
  TITLE: 'MSG_EVENT_TITLE', // details: { reason: REQUIRED | TOO_LONG, max }
  DESCRIPTION: 'MSG_EVENT_DESCRIPTION', // details: { max }
  TIME: 'MSG_EVENT_TIME', // details: { reason: PAST | END_BEFORE_START | END_OTHER_DAY | OUTSIDE_YEAR, min?, max? }
  VIEWERS: 'MSG_EVENT_VIEWERS', // details: { reason: TOO_MANY | NOT_IN_CLASS, max?, userIds? }
  CHANGED: 'MSG_EVENT_CHANGED', // 409 – someone saved the event after this form was opened (stamp differs)
  SCHOOL_YEAR_ENDED: 'MSG_SCHOOL_YEAR_ENDED',
  NOT_READY: 'MSG_CALENDAR_NOT_READY', // tables missing on this database
});

// Notification texts (Vietnamese is shown to users as stored, like FE-13 maintenance notifications).
export const NOTIFICATION = Object.freeze({
  TYPE: 'CLASS_EVENT',
  TARGET: 'CLASS_EVENT',
});

// School calendar (13/11/2026, Dung) – school-wide dates set by the School Manager (table school_events, proposed
// patch_v0.3_school_events.sql). Shown on the school feed ("Lịch sắp tới của trường"), on /school-events and in the
// class calendar of the grade concerned.
export const SCHOOL_EVENT_LIMITS = Object.freeze({
  TITLE_MAX: 200, // ASSUMPTION (column is 255)
  LOCATION_MAX: 255,
  DESCRIPTION_MAX: 2000, // ASSUMPTION: same as class events
  UPCOMING_MAX: 50, // ?limit= of the upcoming / past lists
  RANGE_MAX_DAYS: 62,
});

export const SCHOOL_EVENT_CODES = Object.freeze({
  NOT_FOUND: 'MSG_SCHOOL_EVENT_NOT_FOUND',
  TITLE: 'MSG_SCHOOL_EVENT_TITLE', // details: { reason: REQUIRED | TOO_LONG, max }
  LOCATION: 'MSG_SCHOOL_EVENT_LOCATION', // details: { max }
  DESCRIPTION: 'MSG_SCHOOL_EVENT_DESCRIPTION', // details: { max }
  TIME: 'MSG_SCHOOL_EVENT_TIME', // details: { reason: PAST | END_BEFORE_START | NO_YEAR | OUTSIDE_YEAR, min?, max? }
  GRADE: 'MSG_SCHOOL_EVENT_GRADE', // unknown grade level
  STARTED: 'MSG_SCHOOL_EVENT_STARTED', // 409 – already started: read only
  CHANGED: 'MSG_SCHOOL_EVENT_CHANGED', // 409 – stale stamp
  NOT_READY: 'MSG_SCHOOL_EVENTS_NOT_READY', // 503 – table school_events missing (patch not run)
});
