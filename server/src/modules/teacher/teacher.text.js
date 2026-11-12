// FE-03 text helpers: name cleaning / checking and accent-insensitive search. Accents and phone numbers reuse the
// shared utils (utils/username.js removeAccents, utils/phone.js normalizePhone); only what is new for FE-03 is here.
// client/src/utils/teacherValidation.js mirrors the name rules – keep both in sync.
//
// Person name (business-rules §4 "Teachers"): letters of any language (Vietnamese diacritics included), spaces, and
// an apostrophe or hyphen between letters ("H'Hen Niê"). No digits, no symbols, no emoji. Each word starts with a
// capital letter.
import { normalizePhone } from '../../utils/phone.js';
import { foldVietnamese } from '../../utils/search.js';

// Zero-width spaces/joiners, BOM, soft hyphen, bidi marks and control characters: invisible, never wanted.
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F­​-‏‪-‮⁠-⁤﻿]/g;
const APOSTROPHES = /[‘’ʼ`´]/g; // ‘ ’ ʼ ` ´ → '
const DASHES = /[‐-―−]/g; // ‐ ‑ ‒ – — ― − → -

export const NAME_REASON = Object.freeze({
  REQUIRED: 'REQUIRED',
  TOO_SHORT: 'TOO_SHORT',
  TOO_LONG: 'TOO_LONG',
  HAS_DIGIT: 'HAS_DIGIT',
  INVALID_CHAR: 'INVALID_CHAR',
  BAD_PUNCTUATION: 'BAD_PUNCTUATION',
  NO_LETTER: 'NO_LETTER',
});

/** NFC (one code point per Vietnamese letter), no invisible chars, unified quotes/dashes, single spaces, trimmed. */
export function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(APOSTROPHES, "'")
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// Department name (UC-114): letters, digits, spaces and . , - – ( ) & / ' – e.g. "Tổ Toán – Tin", "Tổ 1 (Khối 10)".
// Dashes are kept as typed (the existing names use "–"); invisible characters and extra spaces are removed.
const DEPARTMENT_ALLOWED = /^[\p{L}\p{M}\p{N} .,\-‐-―()&/']+$/u;

/** Returns { value, reason }: value = the cleaned name, reason = a NAME_REASON code when the name is not usable. */
export function checkDepartmentName(input, { min = 2, max = 100 } = {}) {
  const value = typeof input === 'string'
    ? input.normalize('NFC').replace(INVISIBLE, '').replace(APOSTROPHES, "'").replace(/\s+/g, ' ').trim()
    : '';
  if (!value) return { value, reason: NAME_REASON.REQUIRED };
  if (!DEPARTMENT_ALLOWED.test(value)) return { value, reason: NAME_REASON.INVALID_CHAR };
  if (!/\p{L}/u.test(value)) return { value, reason: NAME_REASON.NO_LETTER };
  if (value.replace(/[^\p{L}\p{N}]/gu, '').length < min) return { value, reason: NAME_REASON.TOO_SHORT };
  if (value.length > max) return { value, reason: NAME_REASON.TOO_LONG };
  return { value, reason: null };
}

/** Key to compare department names: no accents, no case, every dash the same, single spaces. */
export const departmentKey = (name) => foldVietnamese(String(name).replace(DASHES, '-')).replace(/\s+/g, ' ').trim();

// "phạm  thu hà" -> "Phạm Thu Hà"; "h'hen niê" -> "H'hen Niê" (only the first letter of each word changes).
function capitalizeWords(value) {
  return value.replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toLocaleUpperCase('vi'));
}

const NAME_ALLOWED = /^[\p{L}\p{M}' -]+$/u;
const NAME_SHAPE = /^\p{L}[\p{L}\p{M}]*(?:['-]\p{L}[\p{L}\p{M}]*)*(?: \p{L}[\p{L}\p{M}]*(?:['-]\p{L}[\p{L}\p{M}]*)*)*$/u;

/**
 * Person name. Returns { value, reason }: value is the cleaned, capitalised name when valid, reason is a
 * NAME_REASON code when not.
 */
export function checkPersonName(input, { min = 2, max = 150 } = {}) {
  const value = cleanText(input);
  if (!value) return { value, reason: NAME_REASON.REQUIRED };
  // symbols first ("<script>alert(1)</script>" is about symbols, not about the digit)
  if (!/^[\p{L}\p{M}\p{N}' -]+$/u.test(value)) return { value, reason: NAME_REASON.INVALID_CHAR };
  if (/\p{N}/u.test(value)) return { value, reason: NAME_REASON.HAS_DIGIT };
  if (!NAME_ALLOWED.test(value)) return { value, reason: NAME_REASON.INVALID_CHAR };
  if (!/\p{L}/u.test(value)) return { value, reason: NAME_REASON.NO_LETTER };
  if (!NAME_SHAPE.test(value)) return { value, reason: NAME_REASON.BAD_PUNCTUATION };
  const letters = value.replace(/[^\p{L}]/gu, '').length;
  if (letters < min) return { value, reason: NAME_REASON.TOO_SHORT };
  if (value.length > max) return { value, reason: NAME_REASON.TOO_LONG };
  return { value: capitalizeWords(value), reason: null };
}

// ── Search helpers ──────────────────────────────────────────────────────────

// Accent-insensitive search helpers moved to the shared utils/search.js (business-rules §16); re-exported here so the
// teacher module keeps its imports.
export { escapeLike, foldVietnamese, VI_TRANSLATE } from '../../utils/search.js';

/**
 * Phone digits for searching: "0914 882 119", "0914.882.119", "+84 914 882 119" → "0914882119" (utils/phone.js).
 * Returns '' when the text is not a phone-like string (letters present or fewer than 3 digits).
 */
export function phoneSearchDigits(value) {
  const text = String(value).trim();
  if (!/^\+?[\d\s.\-()]+$/.test(text)) return '';
  let digits = normalizePhone(text.replace(/[()]/g, '')).replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`; // "84 914 882 119" without +
  return digits.length >= 3 ? digits : '';
}

