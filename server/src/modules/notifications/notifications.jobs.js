import { env } from '../../config/env.js';
import { sendClassEventReminders } from '../calendar/calendar.reminders.js';
import { sendActivityDeadlineReminders } from '../extracurricular/extracurricular.reminders.js';

// FE-09 UC-69 Send Event Reminders (actor: Scheduler). Runs the reminders written by FE-10 (class event 1 day before)
// and FE-07 (activity registration deadline) every hour, the first time one minute after the server starts.
// Both never send twice (reminded_at / an earlier reminder, rows locked with SKIP LOCKED), so several servers on one
// database are safe. REMINDER_JOB=off in .env stops it on this server. A run never overlaps the previous one.
const FIRST_RUN_MS = 60 * 1000;
const EVERY_MS = 60 * 60 * 1000;

let running = false;

export async function runRemindersOnce() {
  if (running) return null;
  running = true;
  try {
    const result = {};
    // One after the other: each takes a connection of the small pool.
    for (const [name, job] of [
      ['classEvents', sendClassEventReminders],
      ['activityDeadlines', sendActivityDeadlineReminders],
    ]) {
      try {
        result[name] = await job();
      } catch (err) {
        console.error(`[reminders] ${name} failed:`, err?.message);
      }
    }
    return result;
  } finally {
    running = false;
  }
}

export function startReminderJob() {
  if (!env.reminderJob) {
    console.log('[reminders] REMINDER_JOB=off: reminders are not sent by this server');
    return;
  }
  const tick = () =>
    runRemindersOnce().then((r) => {
      const sent = r && Object.values(r).some((x) => x && (x.recipients || x.events || x.activities));
      if (sent) console.log('[reminders]', JSON.stringify(r));
    });
  setTimeout(tick, FIRST_RUN_MS).unref();
  setInterval(tick, EVERY_MS).unref();
}
