import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { assertCanSeeSchoolPost } from '../modules/schoolposts/schoolposts.service.js';

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
    // FE-08 School Feed (Anh): per-post rooms. Kept apart from the line above and wrapped, so nothing here can stop
    // a connection or the "user:<id>" room the chat relies on.
    try {
      socket.on('schoolpost:join', (...args) => {
        joinSchoolPost(socket, args).catch(() => {}); // joinSchoolPost catches everything itself; belt and braces
      });
      socket.on('schoolpost:leave', (...args) => leaveSchoolPost(socket, args));
    } catch (err) {
      console.error('[socket] FE-08 handlers not registered:', err?.message);
    }
  });

  return io;
}

// Sends one event to each listed user (all their open tabs). Does nothing before the server starts (scripts, tests).
export function emitToUsers(userIds, event, payload) {
  if (!io || !userIds.length) return;
  io.to([...new Set(userIds)].map((id) => `user:${id}`)).emit(event, payload);
}

// --- FE-08 School Feed (owner Anh; real time approved by Quoc 09/11/2026) ------------------------------------------
//
// Room "schoolpost:<id>" = the sockets that have SCR-05 School Post Detail of that post open. Only comment events go
// there ("schoolpost:comment", "schoolpost:comment-deleted"); post changes go per user through emitToUsers
// ("schoolpost:changed"). Events carry ids only: the client reloads through the REST API, which checks the active
// role and the audience again (the room is a delivery shortcut, never a permission).
//
// Client contract (FE-08 step 3):
//   socket.emit('schoolpost:join', { schoolPostId }, (answer) => …)   answer = { ok: true } | { ok: false }
//   socket.emit('schoolpost:leave', { schoolPostId })                when the detail page closes
// The server does NOT put a socket back into these rooms: a socket is new after every reconnect and after a role
// switch (SocketContext makes a new connection with the new token), and only "user:<id>" is joined automatically.
// The client must send 'schoolpost:join' again on every 'connect' event while the page is open.
// { ok: false } is the same answer for every refusal (post missing, deleted, outside the audience, bad id, limit),
// so the answer never tells whether a post exists.
//
// ASSUMPTION: at most 5 school post rooms per socket (a person reads one post at a time, a few tabs share nothing:
// each tab has its own socket) and at most 2 permission checks in flight per socket, so a faulty client cannot fill
// the 3-connection DB pool the chat also uses.
const MAX_SCHOOL_POST_ROOMS = 5;
const MAX_PENDING_JOINS = 2;
const schoolPostRoom = (schoolPostId) => `schoolpost:${schoolPostId}`;
const countSchoolPostRooms = (socket) => [...socket.rooms].filter((room) => room.startsWith('schoolpost:')).length;

// Socket.io passes the acknowledgement callback as the last argument when the client gives one.
function splitArgs(args) {
  const ack = typeof args.at(-1) === 'function' ? args.at(-1) : null;
  return { payload: args[0] === ack ? undefined : args[0], ack };
}

function answer(ack, ok) {
  if (!ack) return;
  try {
    ack({ ok });
  } catch {
    // a broken callback on the client side is not our problem
  }
}

// A positive safe integer from { schoolPostId } (number, or digits as text: the client reads it from the URL).
function schoolPostIdOf(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const raw = payload.schoolPostId;
  const id = typeof raw === 'string' && /^\d{1,15}$/.test(raw) ? Number(raw) : raw;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function joinSchoolPost(socket, args) {
  let ack = null;
  try {
    const split = splitArgs(args);
    ack = split.ack;
    const schoolPostId = schoolPostIdOf(split.payload);
    const user = socket.user;
    if (!schoolPostId || !user) return answer(ack, false);
    const room = schoolPostRoom(schoolPostId);
    if (socket.rooms.has(room)) return answer(ack, true);
    // What requireAuth refuses on the REST API, checked here and not in io.use (the chat handshake stays as it is):
    // a temporary password, and a token that expired while the socket stayed connected (exp is in seconds).
    if (user.mustChangePassword || (Number.isFinite(user.exp) && user.exp * 1000 <= Date.now())) {
      return answer(ack, false);
    }
    socket.data.schoolPostPending ??= new Set();
    const pending = socket.data.schoolPostPending;
    if (countSchoolPostRooms(socket) >= MAX_SCHOOL_POST_ROOMS || pending.size >= MAX_PENDING_JOINS) {
      return answer(ack, false);
    }
    pending.add(schoolPostId);
    let leftMeanwhile = false;
    try {
      // UC-59's rule for the ACTIVE role of the token (resolveAudience + visibleSchoolPostsSql); 404 / 403 if not.
      await assertCanSeeSchoolPost({ userId: user.userId, activeRole: user.activeRole }, schoolPostId);
    } finally {
      pending.delete(schoolPostId);
      // A 'schoolpost:leave' sent during the check (see leaveSchoolPost); cleared here whatever the check gave.
      leftMeanwhile = Boolean(socket.data.schoolPostLeftWhilePending?.delete(schoolPostId));
    }
    if (!socket.connected || leftMeanwhile) return answer(ack, false);
    if (countSchoolPostRooms(socket) >= MAX_SCHOOL_POST_ROOMS) return answer(ack, false);
    socket.join(room);
    return answer(ack, true);
  } catch (err) {
    // 403 / 404 are the normal "no"; anything else is logged, never thrown (an unhandled rejection stops Node).
    if (err?.status !== 403 && err?.status !== 404) console.error('[socket] schoolpost:join failed:', err?.message);
    return answer(ack, false);
  }
}

function leaveSchoolPost(socket, args) {
  let ack = null;
  try {
    const split = splitArgs(args);
    ack = split.ack;
    const schoolPostId = schoolPostIdOf(split.payload);
    if (!schoolPostId) return answer(ack, false);
    // A leave that arrives while the permission check of the same post is still running wins over that join.
    if (socket.data.schoolPostPending?.has(schoolPostId)) {
      socket.data.schoolPostLeftWhilePending ??= new Set();
      socket.data.schoolPostLeftWhilePending.add(schoolPostId);
    }
    socket.leave(schoolPostRoom(schoolPostId));
    return answer(ack, true);
  } catch (err) {
    console.error('[socket] schoolpost:leave failed:', err?.message);
    return answer(ack, false);
  }
}

// Sends one event to the sockets that have the post open (room "schoolpost:<id>"). Does nothing before the server
// starts, like emitToUsers. Callers send ids only and call it after COMMIT.
export function emitToSchoolPost(schoolPostId, event, payload) {
  if (!io) return;
  io.to(schoolPostRoom(schoolPostId)).emit(event, payload);
}
