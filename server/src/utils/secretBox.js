import crypto from 'node:crypto';
import { env } from '../config/env.js';

// Reversible encryption for the few values that must be shown again later (the one-time password of a password
// reset request, FE-13). AES-256-GCM; output "v1.<iv>.<tag>.<data>" in base64url.
// ASSUMPTION (FE-13, 31/10/2026): the key is derived from JWT_SECRET so no new .env entry is needed. If JWT_SECRET
// changes, stored values can no longer be read (the admin then resets the password from the account page).
const KEY = Buffer.from(crypto.hkdfSync('sha256', env.jwt.secret, 'educonnect', 'secret-box:v1', 32));

export function seal(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

// Returns null when the value is missing or cannot be decrypted.
export function open(sealed) {
  if (typeof sealed !== 'string') return null;
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || data === undefined) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
