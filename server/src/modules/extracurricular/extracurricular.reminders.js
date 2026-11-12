import { withTransaction } from '../../config/db.js';
import { NOTIFICATION, TIME_ZONE } from './extracurricular.constants.js';
import { notify } from './extracurricular.service.js';

// FE-07 deadline reminder (business-rules §9: "activity registration deadline" personal notification), written for
// FE-09's scheduled job (Quoc, UC-69): call sendActivityDeadlineReminders() as often as the job runs (e.g. hourly).
// Due = an OPEN activity of an open school year whose registration deadline is within the next 24 hours and that was
// posted at least one day before its deadline. Recipients = parents of children still studying in the class who are
// not registered. Sent once per activity: an earlier reminder (same type, target and title start) is not repeated –
// the schema has no "reminded" column for activities, so the notification itself is the mark.
const TITLE_START = 'Sắp hết hạn đăng ký';
const LOCAL = (col) => `to_char(${col} AT TIME ZONE '${TIME_ZONE}', 'HH24:MI DD/MM/YYYY')`;

export async function sendActivityDeadlineReminders() {
  return withTransaction(async (db) => {
    const { rows: due } = await db.query(
      `SELECT ev.event_id AS "eventId", ev.title, c.class_id AS "classId", c.class_name AS "className",
              ${LOCAL('ev.registration_deadline')} AS deadline
       FROM extracurricular_events ev
       JOIN posts p ON p.post_id = ev.post_id AND p.deleted_at IS NULL AND p.approval_status = 'APPROVED' AND NOT p.is_hidden
       JOIN groups g ON g.group_id = p.group_id JOIN classes c ON c.class_id = g.class_id AND c.deleted_at IS NULL
       JOIN school_years sy ON sy.school_year_id = c.school_year_id AND sy.end_date >= CURRENT_DATE
       WHERE ev.status = 'OPEN' AND ev.registration_deadline > NOW() AND ev.registration_deadline <= NOW() + INTERVAL '1 day'
         AND p.created_at <= ev.registration_deadline - INTERVAL '1 day'
         AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.type = $1 AND n.target_type = $2
                         AND n.target_id = ev.event_id AND n.title LIKE $3)
       ORDER BY ev.registration_deadline
       FOR UPDATE OF ev SKIP LOCKED`,
      [NOTIFICATION.TYPE, NOTIFICATION.TARGET, `${TITLE_START}%`],
    );
    let recipients = 0;
    for (const a of due) {
      recipients += await notify(db, {
        classId: a.classId, eventId: a.eventId, createdBy: null,
        audience: { parents: true, extra: `NOT EXISTS (SELECT 1 FROM event_registrations r WHERE r.event_id = $2
                       AND r.student_id = s.student_id AND r.status = 'REGISTERED')` },
        title: `${TITLE_START} – lớp ${a.className}: ${a.title}`,
        detail: `Hạn đăng ký hoạt động "${a.title}" là ${a.deadline}. Con bạn chưa được đăng ký; nếu muốn tham gia, hãy đăng ký trên EduConnect trước hạn.`,
      });
    }
    return { activities: due.length, recipients };
  });
}
