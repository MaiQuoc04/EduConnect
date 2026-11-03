// FE-03 text helpers: name cleaning / checking and accent-insensitive search. Accents and phone numbers reuse the
// shared utils (utils/username.js removeAccents, utils/phone.js normalizePhone); only what is new for FE-03 is here.
// client/src/utils/teacherValidation.js mirrors the name rules – keep both in sync.
//
// Person name (business-rules §4 "Teachers"): letters of any language (Vietnamese diacritics included), spaces, and
// an apostrophe or hyphen between letters ("H'Hen Niê"). No digits, no symbols, no emoji. Each word starts with a
// capital letter.
import { normalizePhone } from '../../utils/phone.js';
import { removeAccents } from '../../utils/username.js';

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

// Vietnamese letters (both cases) → base latin letter. Used in SQL translate() so search ignores accents
// without depending on the Postgres "unaccent" extension or the database locale. In JS the same result comes from
// removeAccents() (utils/username.js).
const VI_FROM =
  'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ' +
  'ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ';
const VI_TO =
  'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd' +
  'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd';
export const VI_TRANSLATE = { from: VI_FROM, to: VI_TO };

/** Lower case, no Vietnamese accents: "Nguyễn Văn Đức" -> "nguyen van duc". Same result as the SQL fold. */
export function foldVietnamese(value) {
  return removeAccents(String(value).normalize('NFC')).toLowerCase();
}

/** Escapes LIKE wildcards so "%" and "_" typed by a user are matched literally (used with ESCAPE '\'). */
export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (c) => `\\${c}`);
}

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

