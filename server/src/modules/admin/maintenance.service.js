import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, notFound } from '../../utils/AppError.js';

// UC-100 Post Maintenance Announcement (FE-13, owner: Linh). During start_at..end_at only System Admin can sign in
// (checked in auth.service signIn). Times are compared in SQL.
// ASSUMPTION: users already signed in when a window starts are not signed out; they keep seeing the banner.
// ASSUMPTION: editing an upcoming window does not send a second notification.

const STATE_SQL = `CASE WHEN m.start_at > NOW() THEN 'UPCOMING' WHEN m.end_at > NOW() THEN 'RUNNING' ELSE 'ENDED' END`;
const COLUMNS = `m.maintenance_id AS id, m.title, m.message, m.start_at AS "startAt", m.end_at AS "endAt",
                 ${STATE_SQL} AS state, m.created_at AS "createdAt", u.full_name AS "createdByName"`;

export async function listMaintenance() {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM maintenance_announcements m JOIN users u ON u.user_id = m.created_by
     WHERE m.deleted_at IS NULL
     ORDER BY (m.end_at > NOW()) DESC, m.start_at DESC
     LIMIT 50`,
  );
  return { items: rows };
}

async function loadWindow(db, idParam) {
  const id = Number(idParam);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound('NOT_FOUND', 'Maintenance announcement not found.');
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM maintenance_announcements m JOIN users u ON u.user_id = m.created_by
     WHERE m.maintenance_id = $1 AND m.deleted_at IS NULL`,
    [id],
  );
  if (!rows.length) throw notFound('NOT_FOUND', 'Maintenance announcement not found.');
  return rows[0];
}

// Checks title / message / times. Times come as ISO strings with a time zone (e.g. "2026-10-30T22:00:00+07:00").
async function readWindow(db, body = {}, exceptId = null) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const startAt = typeof body.startAt === 'string' ? body.startAt : '';
  const endAt = typeof body.endAt === 'string' ? body.endAt : '';
  const fields = {};
  if (!title) fields.title = 'REQUIRED';
  else if (title.length > 255) fields.title = 'TOO_LONG';
  if (!message) fields.message = 'REQUIRED';
  else if (message.length > 2000) fields.message = 'TOO_LONG';
  const valid = (v) => v && !Number.isNaN(Date.parse(v));
  if (!startAt) fields.startAt = 'REQUIRED';
  else if (!valid(startAt)) fields.startAt = 'INVALID';
  if (!endAt) fields.endAt = 'REQUIRED';
  else if (!valid(endAt)) fields.endAt = 'INVALID';
  if (Object.keys(fields).length) throw badRequest('MSG_MAINTENANCE_INVALID', 'Some fields are missing or invalid.', { fields });

  const { rows } = await db.query(
    `SELECT $1::timestamptz <= NOW() AS "startPast",
            $2::timestamptz <= $1::timestamptz AS "endBeforeStart",
            EXISTS (SELECT 1 FROM maintenance_announcements
                    WHERE deleted_at IS NULL AND end_at > NOW() AND maintenance_id IS DISTINCT FROM $3
                      AND tstzrange(start_at, end_at) && tstzrange($1::timestamptz, $2::timestamptz)) AS overlap`,
    [startAt, endAt, exceptId],
  );
  const check = rows[0];
  if (check.startPast) fields.startAt = 'IN_PAST';
  if (check.endBeforeStart) fields.endAt = 'BEFORE_START';
  if (!Object.keys(fields).length && check.overlap) fields.startAt = 'OVERLAP';
  if (Object.keys(fields).length) throw badRequest('MSG_MAINTENANCE_INVALID', 'Some fields are missing or invalid.', { fields });
  return { title, message, startAt, endAt };
}

const fmt = `to_char($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY')`;

// Schedules a window and notifies every active account (one notification + one recipient row per account).
export async function createMaintenance({ body, actorId }) {
  return withTransaction(async (client) => {
    const w = await readWindow(client, body);
    const { rows } = await client.query(
      `INSERT INTO maintenance_announcements (title, message, start_at, end_at, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING maintenance_id`,
      [w.title, w.message, w.startAt, w.endAt, actorId],
    );
    const id = rows[0].maintenance_id;
    const { rows: times } = await client.query(`SELECT ${fmt} AS s, ${fmt.replace('$1', '$2')} AS e`, [w.startAt, w.endAt]);
    const { rows: n } = await client.query(
      `INSERT INTO notifications (type, title, detail, is_personal, target_type, target_id, created_by)
       VALUES ('MAINTENANCE', $1, $2, FALSE, 'MAINTENANCE', $3, $4) RETURNING notification_id`,
      [`Bảo trì hệ thống: ${w.title}`, `Từ ${times[0].s} đến ${times[0].e}. ${w.message}`, id, actorId],
    );
    await client.query(
      `INSERT INTO notification_recipients (notification_id, user_id)
       SELECT $1, user_id FROM users WHERE status = 'ACTIVE'`,
      [n[0].notification_id],
    );
    return loadWindow(client, id);
  });
}

// Edits an upcoming window (title, message, times).
export async function updateMaintenance({ idParam, body }) {
  const current = await loadWindow(pool, idParam);
  if (current.state !== 'UPCOMING') throw new AppError(409, 'MSG_MAINTENANCE_STATE', 'Only an upcoming window can be edited.');
  const w = await readWindow(pool, body, current.id);
  await pool.query('UPDATE maintenance_announcements SET title = $1, message = $2, start_at = $3, end_at = $4 WHERE maintenance_id = $5', [
    w.title,
    w.message,
    w.startAt,
    w.endAt,
    current.id,
  ]);
  return loadWindow(pool, current.id);
}

// Ends a running window now: sign-in works again at once.
export async function endMaintenance({ idParam }) {
  const current = await loadWindow(pool, idParam);
  if (current.state !== 'RUNNING') throw new AppError(409, 'MSG_MAINTENANCE_STATE', 'Only a running window can be ended.');
  await pool.query('UPDATE maintenance_announcements SET end_at = NOW() WHERE maintenance_id = $1', [current.id]);
  return loadWindow(pool, current.id);
}

// Cancels an upcoming window (soft delete).
export async function cancelMaintenance({ idParam }) {
  const current = await loadWindow(pool, idParam);
  if (current.state !== 'UPCOMING') throw new AppError(409, 'MSG_MAINTENANCE_STATE', 'Only an upcoming window can be cancelled.');
  await pool.query('UPDATE maintenance_announcements SET deleted_at = NOW() WHERE maintenance_id = $1', [current.id]);
  return { id: current.id, cancelled: true };
}

// Banner for every visitor: the running window, or the next upcoming one. Public (also shown before sign-in).
export async function currentMaintenance() {
  const { rows } = await pool.query(
    `SELECT m.maintenance_id AS id, m.title, m.message, m.start_at AS "startAt", m.end_at AS "endAt", ${STATE_SQL} AS state
     FROM maintenance_announcements m
     WHERE m.deleted_at IS NULL AND m.end_at > NOW()
     ORDER BY m.start_at LIMIT 1`,
  );
  return { maintenance: rows[0] ?? null };
}
