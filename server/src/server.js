import http from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { startReminderJob } from './modules/notifications/notifications.jobs.js';
import { initSockets } from './sockets/index.js';
import { startNotificationListener } from './sockets/notificationListener.js';

const server = http.createServer(app);
export const io = initSockets(server);

server.listen(env.port, () => {
  console.log(`EduConnect API running on http://localhost:${env.port}/api/v1`);
  startNotificationListener(); // FE-09 real time: LISTEN for new notification rows
  startReminderJob(); // FE-09 UC-69: hourly reminders (REMINDER_JOB=off stops it)
});
