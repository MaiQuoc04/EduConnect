// FE-10 timetable history (Dung, 17/11/2026). Every saved timetable of a class – manual save, import or automatic
// scheduling – with its weekly pattern, who saved it and when, which dates it is still in force on, and which later
// save replaced which dates. No extra column: freeRange (timetable.service.js) never edits a version in place, so
//   * rows of a class with the same created_at are one saved timetable ("plan"); its first row keeps the full range
//     and the pattern as saved (later rows are the pieces left in force after a change, same pattern);
//   * a row soft-deleted at time T was replaced by the plan of the same class created at T (same transaction).
// Versions changed before this rule (ranges trimmed in place) only show what is left of them.
import { pool } from '../../config/db.js';
import { internals } from './timetable.service.js';

const { classInfo, today, timeSlots, guard } = internals;
export const HISTORY_MAX_PLANS = 300;

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// Sorted ranges -> touching / overlapping ones joined.
function joinRanges(list) {
  const out = [];
  for (const r of [...list].sort((a, b) => (a.startDate < b.startDate ? -1 : 1))) {
    const last = out.at(-1);
    if (last && addDays(last.endDate, 1) >= r.startDate) {
      if (r.endDate > last.endDate) last.endDate = r.endDate;
    } else out.push({ startDate: r.startDate, endDate: r.endDate });
  }
  return out;
}
const days = (r) => Math.round((Date.parse(`${r.endDate}T00:00:00Z`) - Date.parse(`${r.startDate}T00:00:00Z`)) / 86400000) + 1;

// GET /timetables/classes/:classId/history (School Manager).
export function classHistory({ classId }, db = pool) {
  return guard(async () => {
    const [cls, day, slots] = await Promise.all([classInfo(classId, db), today(db), timeSlots(db)]);
    // Key = created_at to the microsecond (one plan), `at` = deleted_at the same way (time of the change).
    const { rows } = await db.query(
      `SELECT t.timetable_id AS "id", to_char(t.start_date, 'YYYY-MM-DD') AS "startDate",
              to_char(t.end_date, 'YYYY-MM-DD') AS "endDate",
              to_char(t.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS "createdKey",
              to_char(t.deleted_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS "deletedKey",
              t.created_by AS "createdById", u.full_name AS "createdBy"
       FROM timetables t LEFT JOIN users u ON u.user_id = t.created_by
       WHERE t.class_id = $1
       ORDER BY t.created_at DESC, t.timetable_id`,
      [classId],
    );
    const plans = new Map(); // createdKey -> plan
    for (const r of rows) {
      let p = plans.get(r.createdKey);
      if (!p) {
        if (plans.size >= HISTORY_MAX_PLANS) continue;
        p = { key: r.createdKey, rows: [], createdBy: r.createdBy ?? null };
        plans.set(r.createdKey, p);
      }
      p.rows.push(r);
    }
    const all = [...plans.values()];
    for (const p of all) p.first = p.rows.reduce((a, b) => (Number(b.id) < Number(a.id) ? b : a));

    // Pattern of each plan = entries of its first row.
    const firstIds = all.map((p) => p.first.id);
    const { rows: entries } = firstIds.length
      ? await db.query(
        `SELECT e.timetable_id::text AS "id", e.weekday, e.slot_id::text AS "slotId", e.subject_id::text AS "subjectId",
                e.room
         FROM timetable_entries e WHERE e.timetable_id = ANY($1::bigint[]) ORDER BY e.weekday, e.slot_id`,
        [firstIds],
      )
      : { rows: [] };
    const byId = new Map();
    for (const e of entries) {
      if (!byId.has(e.id)) byId.set(e.id, []);
      byId.get(e.id).push({ weekday: e.weekday, slotId: e.slotId, subjectId: e.subjectId, room: e.room ?? null });
    }
    const subjectIds = [...new Set(entries.map((e) => e.subjectId))];
    const { rows: subjects } = subjectIds.length
      ? await db.query(
        `SELECT subject_id::text AS "subjectId", subject_name AS "name", subject_code AS "code"
         FROM subjects WHERE subject_id = ANY($1::bigint[]) ORDER BY subject_name`,
        [subjectIds],
      )
      : { rows: [] };

    // Periods that took place (days up to today) on the dates each plan was in force.
    const inForceOf = (p) => joinRanges(p.rows.filter((r) => !r.deletedKey));
    const ranges = all.flatMap((p) => inForceOf(p).filter((r) => r.startDate <= day)
      .map((r) => ({ key: p.key, startDate: r.startDate, endDate: r.endDate < day ? r.endDate : day })));
    const held = new Map();
    if (ranges.length) {
      const { rows: counts } = await db.query(
        `SELECT x.k AS "key", COUNT(ts.*)::int AS "n",
                COUNT(ts.*) FILTER (WHERE EXISTS (SELECT 1 FROM attendances a WHERE a.timetable_slot_id = ts.timetable_slot_id))::int AS "checked"
         FROM unnest($2::text[], $3::date[], $4::date[]) AS x(k, s, e)
         LEFT JOIN timetable_slots ts ON ts.class_id = $1 AND ts."date" BETWEEN x.s AND x.e
         GROUP BY x.k`,
        [classId, ranges.map((r) => r.key), ranges.map((r) => r.startDate), ranges.map((r) => r.endDate)],
      );
      for (const c of counts) held.set(c.key, { periods: c.n, withAttendance: c.checked });
    }

    const label = (p) => ({ planId: String(p.first.id), createdAt: p.key.slice(0, 16).replace('T', ' '), createdBy: p.createdBy });
    const out = all.map((p) => {
      const inForce = inForceOf(p);
      // Dates of this plan taken by later saves: deleted row ∩ range of the plan created at its deletion time.
      const replaced = [];
      for (const r of p.rows.filter((x) => x.deletedKey)) {
        const q = plans.get(r.deletedKey);
        const s = q && q.first.startDate > r.startDate ? q.first.startDate : r.startDate;
        const e = q && q.first.endDate < r.endDate ? q.first.endDate : r.endDate;
        if (q && s > e) continue; // a piece cut away and kept elsewhere – not replaced
        const prev = replaced.find((x) => x.at === r.deletedKey);
        if (prev) prev.ranges.push({ startDate: s, endDate: e });
        else replaced.push({ at: r.deletedKey, by: q ? label(q) : null, ranges: [{ startDate: s, endDate: e }] });
      }
      for (const x of replaced) x.ranges = joinRanges(x.ranges);
      replaced.sort((a, b) => (a.at < b.at ? -1 : 1));
      const pattern = byId.get(String(p.first.id)) ?? [];
      const status = !inForce.length ? 'REPLACED' : inForce.every((r) => r.endDate < day) && !replaced.length ? 'ENDED'
        : replaced.length ? 'PARTLY_REPLACED' : 'IN_FORCE';
      return {
        ...label(p),
        startDate: p.first.startDate,
        endDate: p.first.endDate,
        status,
        runningToday: inForce.some((r) => r.startDate <= day && r.endDate >= day),
        inForce,
        inForceDays: inForce.reduce((n, r) => n + days(r), 0),
        replacedBy: replaced.map((x) => ({ at: x.at.slice(0, 16).replace('T', ' '), by: x.by, ranges: x.ranges })),
        periodsPerWeek: pattern.length,
        held: held.get(p.key) ?? { periods: 0, withAttendance: 0 },
        entries: pattern,
      };
    });
    // The other way round: which earlier plans each plan replaced, and on which dates.
    for (const p of out) {
      p.replaces = out.flatMap((o) => o.replacedBy.filter((x) => x.by?.planId === p.planId)
        .map((x) => ({ planId: o.planId, createdAt: o.createdAt, createdBy: o.createdBy, ranges: x.ranges })));
    }
    return {
      class: cls,
      today: day,
      timeSlots: slots,
      subjects,
      truncated: plans.size >= HISTORY_MAX_PLANS && rows.length > all.reduce((n, p) => n + p.rows.length, 0),
      plans: out,
    };
  });
}
