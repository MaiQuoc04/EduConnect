import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// Access token: { userId, roles, activeRole, mustChangePassword }. requireAuth rejects tokens that carry a `purpose`.
export function signAccessToken({ userId, roles, activeRole, mustChangePassword = false }) {
  return jwt.sign({ userId, roles, activeRole, mustChangePassword }, env.jwt.secret, { expiresIn: env.jwt.expiresIn });
}

// Short-lived single-purpose token (e.g. PASSWORD_RESET after a correct OTP). Never accepted as an access token.
export function signPurposeToken(purpose, payload, expiresIn) {
  return jwt.sign({ ...payload, purpose }, env.jwt.secret, { expiresIn });
}

export function verifyPurposeToken(purpose, token) {
  try {
    const payload = jwt.verify(token, env.jwt.secret);
    return payload.purpose === purpose ? payload : null;
  } catch {
    return null;
  }
}
