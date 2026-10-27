// Client copy of the FE-03 text rules (server/src/utils/text.js) so the form shows the same errors as the API
// before sending. Keep both files in sync – the server is still the one that decides.
//
// ASSUMPTION (business-rules.md has no rule for names): letters (Vietnamese included), spaces, and an apostrophe
// or hyphen between letters (e.g. "H'Hen Niê"); no digits, symbols or emoji; each word starts with a capital.

export const LIMITS = Object.freeze({ FULL_NAME_MAX: 150, FULL_NAME_MIN_LETTERS: 2, DEPARTMENT_MAX: 100, DEPARTMENT_MIN: 2, SEARCH_MAX: 100 });

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
export function capitalizeWords(value) {
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

// Department / group name: letters, digits, spaces and . , - ( ) & / ' – e.g. "Tổ Toán - Tin", "Tổ 1 (Khối 10)".
const DEPARTMENT_ALLOWED = /^[\p{L}\p{M}\p{N} .,\-()&/']+$/u;

/** Optional text label. Empty is allowed (→ value ''). */
export function checkDepartment(input, { min = 2, max = 100 } = {}) {
  const value = cleanText(input);
  if (!value) return { value: '', reason: null };
  if (!DEPARTMENT_ALLOWED.test(value)) return { value, reason: NAME_REASON.INVALID_CHAR };
  if (!/\p{L}/u.test(value)) return { value, reason: NAME_REASON.NO_LETTER };
  if (value.replace(/[^\p{L}\p{N}]/gu, '').length < min) return { value, reason: NAME_REASON.TOO_SHORT };
  if (value.length > max) return { value, reason: NAME_REASON.TOO_LONG };
  return { value, reason: null };
}

// Vietnamese letters (both cases) → base latin letter. Used in SQL translate() so search ignores accents
// without depending on the Postgres "unaccent" extension or the database locale.
const VI_FROM =
  'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ' +
  'ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ';
const VI_TO =
  'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd' +
  'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd';

/** Lower case, no Vietnamese accents: "Nguyễn Văn Đức" -> "nguyen van duc". Same result as the SQL fold. */
export function foldVietnamese(value) {
  let out = '';
  for (const ch of String(value).normalize('NFC')) {
    const i = VI_FROM.indexOf(ch);
    out += i >= 0 ? VI_TO[i] : ch;
  }
  return out.toLowerCase();
}

/** Vietnamese mobile number for display: "0914882119" -> "0914 882 119"; other values unchanged. */
export function formatPhone(value) {
  const d = String(value ?? '').replace(/\D/g, '');
  return /^0\d{9}$/.test(d) ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : value;
}

// Vietnamese text for each NAME_REASON (also used by messages.js for MSG_INVALID_NAME / MSG_INVALID_DEPARTMENT).
export const NAME_REASON_TEXT = Object.freeze({
  REQUIRED: 'Vui lòng nhập họ và tên.',
  TOO_SHORT: `Họ và tên cần ít nhất ${LIMITS.FULL_NAME_MIN_LETTERS} chữ cái.`,
  TOO_LONG: `Họ và tên tối đa ${LIMITS.FULL_NAME_MAX} ký tự.`,
  HAS_DIGIT: 'Họ và tên không được chứa chữ số.',
  INVALID_CHAR: "Họ và tên chỉ gồm chữ cái, khoảng trắng, dấu nháy (') hoặc gạch nối (-); không dùng ký tự đặc biệt hay biểu tượng cảm xúc.",
  BAD_PUNCTUATION: "Dấu nháy (') và gạch nối (-) chỉ được đặt giữa hai chữ cái, ví dụ: H'Hen Niê.",
  NO_LETTER: 'Họ và tên phải có chữ cái.',
});
export const DEPARTMENT_REASON_TEXT = Object.freeze({
  TOO_SHORT: `Tên tổ cần ít nhất ${LIMITS.DEPARTMENT_MIN} ký tự.`,
  TOO_LONG: `Tên tổ tối đa ${LIMITS.DEPARTMENT_MAX} ký tự.`,
  INVALID_CHAR: 'Tên tổ chỉ gồm chữ, số, khoảng trắng và các dấu . , - ( ) & / \'.',
  NO_LETTER: 'Tên tổ phải có chữ cái.',
});

/** Full name field → { value, error } (error = Vietnamese text or null). */
export function validateFullName(input) {
  const r = checkPersonName(input, { min: LIMITS.FULL_NAME_MIN_LETTERS, max: LIMITS.FULL_NAME_MAX });
  return { value: r.value, error: r.reason ? NAME_REASON_TEXT[r.reason] : null };
}

/** Department field → { value, error }. Empty is allowed. */
export function validateDepartment(input) {
  const r = checkDepartment(input, { min: LIMITS.DEPARTMENT_MIN, max: LIMITS.DEPARTMENT_MAX });
  return { value: r.value, error: r.reason ? DEPARTMENT_REASON_TEXT[r.reason] : null };
}

/** Search box text sent to the API (cleaned, at most SEARCH_MAX characters). */
export function cleanSearch(input) {
  return cleanText(input).slice(0, LIMITS.SEARCH_MAX);
}
