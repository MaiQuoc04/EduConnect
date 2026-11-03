// Phone numbers (business rules §3, 01/11/2026): stored as "0" + 9 digits. Input may contain spaces, dots or dashes
// and may start with +84; both are normalised before checking or comparing.
export const PHONE_RE = /^0\d{9}$/;

export function normalizePhone(value) {
  const compact = String(value).replace(/[\s.-]/g, '');
  return compact.startsWith('+84') ? `0${compact.slice(3)}` : compact;
}

// A sign-in name is a username, an email or a phone number. Something that looks like a phone number
// ("+84 905 000 041", "0905.000.041") is normalised so it matches the stored phone; anything else is only trimmed.
export function normalizeSignInName(value) {
  const trimmed = String(value).trim();
  return /^\+?[\d\s.-]+$/.test(trimmed) ? normalizePhone(trimmed) : trimmed;
}
