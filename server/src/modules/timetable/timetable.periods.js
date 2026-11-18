// FE-10 period times (Dung, 13/11/2026, requested by Dung for the School Manager). time_slots holds one row per period
// (period_number, start_time, end_time) for every day; timetables only store the period number, so changing the times
// here moves every lesson of every day to the new times (past weeks too – time_slots keeps no history, ASSUMPTION).
//
// The School Manager sets the start of each session and one period length; the break after each period keeps its
// current length ("nghỉ giữa các tiết giữ nguyên"). Sessions are found from the current times: a break longer than
// PERIOD_TIME_LIMITS.SESSION_GAP minutes starts a new session (seed: periods 1-5 morning, 6-10 afternoon).
import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest } from '../../utils/AppError.js';
import { logActivity } from '../../utils/activityLog.js';
import { ERROR_CODES, PERIOD_TIME_LIMITS as L } from './timetable.constants.js';

export const toMinutes = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
export const toHm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const isHm = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const invalid = (field, reason, more = {}) =>
  badRequest(ERROR_CODES.PERIOD_TIMES_INVALID, `Invalid period times: ${field} ${reason}.`, { field, reason, ...more });

// Current periods -> sessions with the break after each period. Same rule as the client (pages/timetable/periodTimes.js).
export function describe(slots) {
  const sessions = [];
  slots.forEach((s, i) => {
    const prev = slots[i - 1];
    const gap = prev ? toMinutes(s.start) - toMinutes(prev.end) : null;
    if (!prev || gap > L.SESSION_GAP) sessions.push({ start: s.start, periods: [] });
    const cur = sessions[sessions.length - 1];
    const next = slots[i + 1];
    const breakAfter = next && toMinutes(next.start) - toMinutes(s.end) <= L.SESSION_GAP ? toMinutes(next.start) - toMinutes(s.end) : null;
    cur.periods.push({ ...s, length: toMinutes(s.end) - toMinutes(s.start), breakAfter });
  });
  for (const se of sessions) se.end = se.periods[se.periods.length - 1].end;
  return sessions;
}

// New times: each session starts at its new start, every period lasts `duration`, breaks unchanged.
export function plan(sessions, { sessionStarts, duration }) {
  const out = [];
  sessions.forEach((se, k) => {
    let t = toMinutes(sessionStarts[k]);
    for (const p of se.periods) {
      out.push({ slotId: p.slotId, period: p.period, start: toHm(t), end: toHm(t + duration), startMin: t, session: k });
      t += duration + (p.breakAfter ?? 0);
    }
  });
  return out;
}

async function readSlots(db, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT slot_id AS "slotId", period_number AS "period",
            to_char(start_time, 'HH24:MI') AS "start", to_char(end_time, 'HH24:MI') AS "end"
     FROM time_slots ORDER BY period_number${lock ? ' FOR UPDATE' : ''}`,
  );
  return rows;
}
const stampOf = (slots) => slots.map((s) => `${s.period}=${s.start}-${s.end}`).join(',');

// GET /timetables/period-times
export async function getPeriodTimes() {
  const slots = await readSlots(pool);
  const sessions = slots.length ? describe(slots) : [];
  const lengths = [...new Set(slots.map((s) => toMinutes(s.end) - toMinutes(s.start)))];
  return {
    slots,
    sessions: sessions.map((se) => ({ start: se.start, end: se.end, periods: se.periods.map((p) => ({ period: p.period, breakAfter: p.breakAfter })) })),
    duration: lengths.length === 1 ? lengths[0] : null, // null: periods have different lengths today
    stamp: stampOf(slots),
    limits: L,
  };
}

function check(sessions, input) {
  const { sessionStarts, duration } = input;
  if (!Number.isInteger(duration) || duration < L.DURATION_MIN || duration > L.DURATION_MAX) {
    throw invalid('duration', 'RANGE', { min: L.DURATION_MIN, max: L.DURATION_MAX });
  }
  if (sessionStarts.length !== sessions.length) throw invalid('sessionStarts', 'COUNT', { count: sessions.length });
  sessionStarts.forEach((v, k) => {
    if (!isHm(v)) throw invalid('sessionStarts', 'FORMAT', { session: k });
  });
  const rows = plan(sessions, input);
  for (let k = 0; k < sessions.length; k += 1) {
    const mine = rows.filter((r) => r.session === k);
    const first = toMinutes(sessionStarts[k]);
    const last = toMinutes(mine[mine.length - 1].end);
    if (first < toMinutes(L.DAY_START) || last > toMinutes(L.DAY_END)) {
      throw invalid('sessionStarts', 'DAY', { session: k, min: L.DAY_START, max: L.DAY_END, end: toHm(last) });
    }
    if (k > 0) {
      const prev = rows.filter((r) => r.session === k - 1);
      const prevEnd = toMinutes(prev[prev.length - 1].end);
      if (first - prevEnd < L.LUNCH_MIN) {
        throw invalid('sessionStarts', 'OVERLAP', { session: k, prevEnd: toHm(prevEnd), earliest: toHm(prevEnd + L.LUNCH_MIN), gap: L.LUNCH_MIN });
      }
    }
  }
  return rows;
}

// PUT /timetables/period-times { sessionStarts: ['07:00', '13:30'], duration: 45, stamp }
export async function updatePeriodTimes(input, user, ip) {
  const result = await withTransaction(async (db) => {
    const slots = await readSlots(db, { lock: true });
    if (!slots.length) throw new AppError(409, ERROR_CODES.PERIOD_TIMES_EMPTY, 'No periods are defined.');
    if (input.stamp !== stampOf(slots)) {
      throw new AppError(409, ERROR_CODES.PERIOD_TIMES_CHANGED, 'The period times were changed after the page was opened.');
    }
    const rows = check(describe(slots), input);
    const changed = rows.filter((r, i) => r.start !== slots[i].start || r.end !== slots[i].end);
    for (const r of changed) {
      await db.query('UPDATE time_slots SET start_time = $2::time, end_time = $3::time WHERE slot_id = $1', [r.slotId, r.start, r.end]);
    }
    return { before: slots, after: rows, changed: changed.length };
  });
  if (result.changed) {
    await logActivity({
      userId: user.userId, action: 'SETTING_CHANGE', targetType: 'TIME_SLOTS', ip,
      detail: { before: stampOf(result.before), after: stampOf(result.after) },
    }).catch(() => {}); // the change is saved; a failed log line must not turn it into an error
  }
  return { changed: result.changed, ...(await getPeriodTimes()) };
}
