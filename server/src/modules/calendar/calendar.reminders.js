// FE-10 class calendar – the 1-day reminder (business rules §10, §9 personal notifications).
// The daily / hourly job of FE-09 (UC-69 Send Event Reminders, Quoc) calls sendClassEventReminders(); nothing here
// schedules itself. Safe to run as often as wanted: each event is reminded once (reminded_at), rows are locked with
// SKIP LOCKED so two runs at the same time never send twice.
import { withTransaction } from '../../config/db.js';
import { TIME_ZONE } from './calendar.constants.js';
import { notifyAudience } from './calendar.service.js';

const LOCAL_TEXT = (col) => `to_char(${col} AT TIME ZONE '${TIME_ZONE}', 'YYYY-MM-DD"T"HH24:MI')`;
const vnTime = (local) => `${local.slice(11, 16)} ngày ${local.slice(8, 10)}/${local.slice(5, 7)}/${local.slice(0, 4)}`;

// Due = starts within the next 24 hours, not reminded yet, not deleted, and created at least one day before it
// starts ("events created less than a day ahead get no reminder"). Moving an event clears reminded_at (UC-79).
// Returns { events, recipients } for the job's log.
export async function sendClassEventReminders() {
  return withTransaction(async (db) => {
    const { rows: due } = await db.query(
      `SELECT e.event_id AS "eventId", e.title, e.description, e.created_by AS "createdBy", c.class_name AS "className",
              ec.name AS "categoryName", s.subject_name AS "subjectName", ${LOCAL_TEXT('e.start_at')} AS "startAt",
              ${LOCAL_TEXT('e.end_at')} AS "endAt"
       FROM class_events e
       JOIN classes c ON c.class_id = e.class_id AND c.deleted_at IS NULL
       JOIN event_categories ec ON ec.category_id = e.category_id
       LEFT JOIN subjects s ON s.subject_id = e.subject_id
       WHERE e.deleted_at IS NULL AND e.reminded_at IS NULL
         AND e.start_at > NOW() AND e.start_at <= NOW() + INTERVAL '1 day'
         AND e.created_at <= e.start_at - INTERVAL '1 day'
       ORDER BY e.start_at
       FOR UPDATE OF e SKIP LOCKED`,
    );
    let recipients = 0;
    for (const ev of due) {
      const what = [ev.categoryName, ev.subjectName].filter(Boolean).join(' · ');
      recipients += await notifyAudience(db, {
        eventId: String(ev.eventId),
        title: `Ngày mai – lớp ${ev.className}: ${ev.title}`,
        detail: [
          `${what} lúc ${vnTime(ev.startAt)}${ev.endAt ? `, kết thúc ${vnTime(ev.endAt)}` : ''}.`,
          ev.description ? ev.description.slice(0, 500) : null,
        ].filter(Boolean).join('\n'),
        personal: true,
        createdBy: null, // system / scheduler
      });
      await db.query('UPDATE class_events SET reminded_at = NOW() WHERE event_id = $1', [ev.eventId]);
    }
    return { events: due.length, recipients };
  });
}
