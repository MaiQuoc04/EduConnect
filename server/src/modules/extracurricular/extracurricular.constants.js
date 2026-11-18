// FE-07 Extracurricular Event Management (Dung, It3) – UC-50..UC-57. Rules: business-rules §7 (+ the "as built" block
// written with this module), permissions.md "Extracurricular event" rows (notes 4, 5, 7).

export const ROLES = { TEACHER: 'TEACHER', STUDENT: 'STUDENT', PARENT: 'PARENT' };
export const TIME_ZONE = 'Asia/Ho_Chi_Minh';

export const ACTIVITY_STATUS = { OPEN: 'OPEN', CANCELLED: 'CANCELLED' };
export const REGISTRATION_STATUS = { REGISTERED: 'REGISTERED', CANCELLED: 'CANCELLED' };

export const ACTIVITY_LIMITS = {
  TITLE_MAX: 120, // ASSUMPTION: the Stitch form counts to 120 (column VARCHAR(255))
  DESCRIPTION_MAX: 5000, // the description is the feed post's text: business-rules §5 post length
  LOCATION_MAX: 255, // extracurricular_events.location
  CAPACITY_MAX: 1000, // ASSUMPTION: a sanity limit; capacity is per class
  SEARCH_MAX: 100,
  EXPORT_MAX_ROWS: 2000,
};

export const ERROR_CODES = {
  INVALID_INPUT: 'MSG_INVALID_INPUT',
  NOT_READY: 'MSG_ACTIVITY_NOT_READY', // 503 – patch_v0.3_activity_title.sql not run on this database
  NOT_FOUND: 'MSG_ACTIVITY_NOT_FOUND', // 404 – also when the user may not see it (existence not revealed)
  NOT_HOMEROOM: 'MSG_ACTIVITY_NOT_HOMEROOM', // 403 – only the class's current homeroom teacher manages its activities
  NO_FEED: 'MSG_ACTIVITY_NO_FEED', // 409 – the class has no class feed (GENERAL group) to post in
  YEAR_ENDED: 'MSG_SCHOOL_YEAR_ENDED', // 409 – an ended school year is read only (business-rules §4)
  TITLE: 'MSG_ACTIVITY_TITLE', // 400 details: { reason: EMPTY | TOO_LONG, max? }
  DESCRIPTION: 'MSG_ACTIVITY_DESCRIPTION', // 400 details: { reason: EMPTY | TOO_LONG, max? }
  LOCATION: 'MSG_ACTIVITY_LOCATION', // 400 details: { reason: EMPTY | TOO_LONG, max? }
  TIME: 'MSG_ACTIVITY_TIME', // 400 details: { reason: START_PAST | END_BEFORE_START | DEADLINE_PAST | DEADLINE_AFTER_START | OUTSIDE_YEAR, min?, max? }
  CAPACITY: 'MSG_ACTIVITY_CAPACITY', // 400 details: { reason: RANGE | BELOW_REGISTERED, max?, registered? }
  CHANGED: 'MSG_ACTIVITY_CHANGED', // 409 – saved by someone else after the form was opened
  CANCELLED: 'MSG_ACTIVITY_CANCELLED', // 409 – the activity was cancelled
  STARTED: 'MSG_ACTIVITY_STARTED', // 409 – started: no update, cancel or registration change any more
  CLOSED: 'MSG_ACTIVITY_CLOSED', // 409 – registration deadline passed
  FULL: 'MSG_ACTIVITY_FULL', // 409 – capacity reached
  ALREADY_REGISTERED: 'MSG_ACTIVITY_ALREADY_REGISTERED', // 409
  NOT_REGISTERED: 'MSG_ACTIVITY_NOT_REGISTERED', // 409
  CHILD: 'MSG_ACTIVITY_CHILD', // 403 – not your child, or the child no longer studies in the class
  TOO_MANY: 'MSG_ACTIVITY_EXPORT_TOO_MANY', // 400
  POST_IS_ACTIVITY: 'MSG_POST_IS_ACTIVITY', // 409 – FE-05 edit / delete of an activity's post: use UC-51 / UC-52
};

export const NOTIFICATION = { TYPE: 'EXTRACURRICULAR', TARGET: 'EXTRACURRICULAR_EVENT' };
