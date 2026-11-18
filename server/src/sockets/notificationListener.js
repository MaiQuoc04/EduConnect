import pg from 'pg';
import { connectionConfig, pool } from '../config/db.js';
import { emitToUsers } from './index.js';

// FE-09 real time (Quoc, 18/11/2026, approved by the lead). The trigger of patch_v0.3_notification_roles.sql sends
// NOTIFY 'notification_recipients' with the new notification ids; PostgreSQL delivers it only after the writing
// transaction COMMITs (nothing on ROLLBACK), so nobody is told about a notification that does not exist, and no module
// has to push anything itself. This server keeps ONE extra connection that LISTENs, looks up who got the rows and
// emits "notification:new" { notificationId, role } to each user's room; the client refreshes only when `role` is its
// active role. If the connection drops it reconnects (5 s, then up to 60 s); clients also reload their badge when
// their socket reconnects, so nothing is lost meanwhile.
const CHANNEL = 'notification_recipients';
let client = null;
let retryMs = 5000;
let stopped = false;

async function announce(payload) {
  const ids = String(payload ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return;
  const { rows } = await pool.query(
    `SELECT notification_id AS "notificationId", role_code AS role, array_agg(user_id) AS users
     FROM notification_recipients WHERE notification_id = ANY($1::bigint[])
     GROUP BY notification_id, role_code`,
    [ids],
  );
  for (const r of rows) emitToUsers(r.users.map(Number), 'notification:new', { notificationId: r.notificationId, role: r.role });
}

async function connect() {
  if (stopped) return;
  const c = new pg.Client(connectionConfig);
  c.on('notification', (msg) => {
    if (msg.channel === CHANNEL) announce(msg.payload).catch((err) => console.error('[notifications] push failed:', err?.message));
  });
  c.on('error', (err) => console.error('[notifications] listener error:', err?.message));
  c.on('end', () => {
    if (client === c) client = null;
    if (!stopped) setTimeout(connect, retryMs).unref();
    retryMs = Math.min(retryMs * 2, 60000);
  });
  try {
    await c.connect();
    await c.query(`LISTEN ${CHANNEL}`);
    client = c;
    retryMs = 5000;
  } catch (err) {
    console.error('[notifications] cannot listen:', err?.message);
    c.end().catch(() => {});
  }
}

export function startNotificationListener() {
  stopped = false;
  connect();
}

export async function stopNotificationListener() {
  stopped = true;
  if (client) await client.end().catch(() => {});
}
