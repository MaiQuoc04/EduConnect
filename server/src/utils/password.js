import bcrypt from 'bcryptjs';
import { badRequest } from './AppError.js';

// Password rules (business-rules §3): 8–32 characters with a digit, a lowercase letter, an uppercase letter and a
// special character; must not contain the username or phone number; not equal to the previous password.
// Rule keys are returned to the client in `details.failed` so it can tick the checklist.
export function checkPasswordRules(password, { username, phone } = {}) {
  const failed = [];
  if (password.length < 8 || password.length > 32) failed.push('LENGTH');
  if (!/[A-Z]/.test(password)) failed.push('UPPERCASE');
  if (!/[a-z]/.test(password)) failed.push('LOWERCASE');
  if (!/[0-9]/.test(password)) failed.push('DIGIT');
  if (!/[^A-Za-z0-9]/.test(password)) failed.push('SPECIAL');
  const lower = password.toLowerCase();
  if ((username && lower.includes(username.toLowerCase())) || (phone && password.includes(phone))) {
    failed.push('NO_IDENTIFIER');
  }
  return failed;
}

// Throws MSG_PASSWORD_RULES unless `password` is a valid new password for `user` ({ username, phone, password_hash }).
export async function assertNewPassword(password, user) {
  if (typeof password !== 'string' || !password) throw badRequest('MSG_REQUIRED', 'Please enter the new password.');
  const failed = checkPasswordRules(password, user);
  if (await bcrypt.compare(password, user.password_hash)) failed.push('NOT_PREVIOUS');
  if (failed.length) {
    throw badRequest('MSG_PASSWORD_RULES', 'The new password does not meet the password rules.', { failed });
  }
}

export const hashPassword = (password) => bcrypt.hash(password, 10);
