import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { env } from '../config/env.js';

// Real-time layer for FE-06 chat and live notifications (FE-09).
// Client connects with: io(URL, { auth: { token } }). Each user joins room "user:<id>",
// so the server can push to one user with io.to(`user:${id}`).emit(...).
//
// FE-06 (UC-47): chat events go to the "user:<id>" room of every active member of the group (emitToUsers), not to
// a "group:<id>" room. Membership changes all the time (transfer, promotion, assignments, teams, leaving), and a
// per-user push always follows the current group_members rows without re-joining rooms. The client reloads the
// chat through the REST API, which checks the active role and the data scope again.
let io = null;

export function initSockets(httpServer) {
  io = new Server(httpServer, { cors: { origin: env.clientOrigin } });

  io.use((socket, next) => {
    try {
      const payload = jwt.verify(socket.handshake.auth?.token, env.jwt.secret);
      // Single-purpose tokens (e.g. PASSWORD_RESET) are never accepted as a session, as in requireAuth.
      if (payload.purpose) throw new Error('purpose token');
      socket.user = payload;
      next();
    } catch {
      next(new Error('AUTH_INVALID'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.userId}`);
  });

  return io;
}

// Sends one event to each listed user (all their open tabs). Does nothing before the server starts (scripts, tests).
export function emitToUsers(userIds, event, payload) {
  if (!io || !userIds.length) return;
  io.to([...new Set(userIds)].map((id) => `user:${id}`)).emit(event, payload);
}
