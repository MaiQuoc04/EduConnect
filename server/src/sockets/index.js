import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { env } from '../config/env.js';

// Real-time layer for FE-06 chat and live notifications (FE-09).
// Client connects with: io(URL, { auth: { token } }). Each user joins room "user:<id>",
// so the server can push to one user with io.to(`user:${id}`).emit(...).
export function initSockets(httpServer) {
  const io = new Server(httpServer, { cors: { origin: env.clientOrigin } });

  io.use((socket, next) => {
    try {
      socket.user = jwt.verify(socket.handshake.auth?.token, env.jwt.secret);
      next();
    } catch {
      next(new Error('AUTH_INVALID'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.userId}`);
    // FE-06: join group rooms ("group:<id>") after checking membership, then relay messages.
  });

  return io;
}
