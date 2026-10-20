import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from '../utils/AppError.js';

// Verifies "Authorization: Bearer <token>" and sets req.user = { userId, roles, activeRole }.
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized('AUTH_REQUIRED', 'Please sign in.'));
  try {
    req.user = jwt.verify(token, env.jwt.secret);
    next();
  } catch {
    next(unauthorized('AUTH_INVALID', 'Your session has expired. Please sign in again.'));
  }
}

// Permissions follow the role the user is currently acting as (ERD 1b role switcher).
// Usage: router.post('/subjects', requireAuth, requireRole('SCHOOL_MANAGER'), handler)
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.activeRole)) return next(forbidden());
    next();
  };
}
