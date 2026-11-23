// FE-12 Attendance Management (owner: Quoc) – constants. Business rules §12 (agreed details 18/11/2026).

export const STATUSES = ['PRESENT', 'LATE', 'ABSENT_EXCUSED', 'ABSENT_UNEXCUSED'];
export const ABSENCES = ['ABSENT_EXCUSED', 'ABSENT_UNEXCUSED'];

// Vietnamese labels: only for the notification text and the Excel files (the screens have their own copy).
export const STATUS_LABELS = {
  PRESENT: 'Có mặt',
  LATE: 'Đi muộn',
  ABSENT_EXCUSED: 'Vắng có phép',
  ABSENT_UNEXCUSED: 'Vắng không phép',
};

// What the caller may do with one period (resolveMode in attendance.scope.js):
//   TEACHER  – the period's teacher, from its start until the deadline of that day: every status, the whole class.
//   HOMEROOM – the class's homeroom teacher, semester open, period taken: excused <-> unexcused only, reason required.
//   MANAGER  – School Manager, period started: any change at any time (§12 point 6), reason required.
//   VIEW     – may look only; `blocked` says why it cannot be changed.
export const MODES = { TEACHER: 'TEACHER', HOMEROOM: 'HOMEROOM', MANAGER: 'MANAGER', VIEW: 'VIEW' };

export const SETTING_DEADLINE = 'attendance.edit_deadline_time';
export const DEFAULT_DEADLINE = '23:59';

// The school day: periods 1–5 are the morning session, 6–10 the afternoon (same split as FE-10's timetable screens).
// The prefill of a sheet never crosses from one session to the other (lead, 23/11/2026).
export const MORNING_LAST_PERIOD = 5;

export const NOTE_MAX = 500;
export const REASON_MAX = 255;

// Every time is compared in SQL in Vietnam time, whatever the session time zone is (CLAUDE.md "Times").
export const TZ = 'Asia/Ho_Chi_Minh';
export const TODAY_SQL = `(NOW() AT TIME ZONE '${TZ}')::date`;
// A period's start as a moment: date + start time read as Vietnam time.
export const LESSON_START_SQL = `((ts."date" + sl.start_time) AT TIME ZONE '${TZ}')`;
