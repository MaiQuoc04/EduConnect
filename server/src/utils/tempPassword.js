import crypto from 'node:crypto';
import { checkPasswordRules } from './password.js';

// Random temporary password for UC-92 / UC-93 / UC-97 (business-rules §3): meets the password rules, shown once,
// the account must change it at the next sign-in. Look-alike characters (0/O, 1/l/I) are left out because the
// password is handed over on paper or read out.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '@#$%&*!?';
const ALL = UPPER + LOWER + DIGITS + SPECIAL;
const LENGTH = 12;

const pick = (chars) => chars[crypto.randomInt(chars.length)];

export function generateTemporaryPassword({ username, phone } = {}) {
  for (;;) {
    const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIAL)];
    while (chars.length < LENGTH) chars.push(pick(ALL));
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = crypto.randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const password = chars.join('');
    if (!checkPasswordRules(password, { username, phone }).length) return password;
  }
}
