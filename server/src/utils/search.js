import { removeAccents } from './username.js';

// Shared search for list screens (business-rules §16): case- and accent-insensitive "contains", done with SQL
// translate() so it needs no Postgres extension (no unaccent) and works on every database, local ones included.
//   const fold = (column) => `lower(translate(${column}, $4, $5))`;   // params: VI_TRANSLATE.from, VI_TRANSLATE.to
//   WHERE ${fold('u.full_name')} LIKE $1                              // $1 = containsPattern(search)
// PostgreSQL's LIKE escapes with a backslash by default, which is what escapeLike() writes.

// Vietnamese letters (both cases) → base latin letter, for SQL translate().
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

/** Escapes LIKE wildcards so "%" and "_" typed by a user are matched literally. */
export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** The LIKE pattern for "contains what the user typed", folded and escaped; null when nothing was typed. */
export function containsPattern(value, max = 100) {
  const text = typeof value === 'string' ? foldVietnamese(value.trim()).slice(0, max) : '';
  return text ? `%${escapeLike(text)}%` : null;
}
