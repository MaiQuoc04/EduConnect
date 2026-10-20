import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from '../utils/AppError.js';

function verifyAccessToken(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw unauthorized('AUTH_REQUIRED', 'Please sign in.');
  let payload;
  try {
    payload = jwt.verify(token, env.jwt.secret);
  } catch {
    throw unauthorized('AUTH_INVALID', 'Your session has expired. Please sign in again.');
  }
  // Single-purpose tokens (e.g. PASSWORD_RESET) are never access tokens.
  if (payload.purpose) throw unauthorized('AUTH_INVALID', 'Your session has expired. Please sign in again.');
  return payload;
}

// Verifies "Authorization: Bearer <token>" and sets req.user = { userId, roles, activeRole, mustChangePassword }.
// UC-01: while the account still has a temporary password, every API except the few that use
// requireAuthAllowingPasswordChange answers 403 PASSWORD_CHANGE_REQUIRED.
export function requireAuth(req, _res, next) {
  req.user = verifyAccessToken(req);
  if (req.user.mustChangePassword) {
    return next(forbidden('PASSWORD_CHANGE_REQUIRED', 'Please change your temporary password first.'));
  }
  next();
}

// Same as requireAuth but also lets in accounts that must change their password (GET /auth/me, change password).
export function requireAuthAllowingPasswordChange(req, _res, next) {
  req.user = verifyAccessToken(req);
  next();
}

// Permissions follow the role the user is currently acting as (ERD 1b role switcher).
// Usage: router.post('/subjects', requireAuth, requireRole('SCHOOL_MANAGER'), handler)
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.activeRole)) return next(forbidden());
    next();
  };
}
