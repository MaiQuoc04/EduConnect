// Vietnamese name ordering for list screens (UC-07 students; also meant for UC-15 teachers, UC-105 parents and
// the Group Member List). Vietnamese names are "Family Middle Given" (Nguyễn Văn An), and lists are sorted by the
// given name – the LAST word – then by the rest, so "Nguyễn Văn An" comes before "Trần Bảo".
//
// Comparison uses the ICU collation "vi-VN-x-icu", which orders Vietnamese letters and tone marks correctly
// (a < ă < â, d < đ, o < ô < ơ, u < ư). It exists on the Supabase PostgreSQL 17 database (checked 26/10/2026).
// ASSUMPTION: every database the server runs on (local Docker / installer builds too) has PostgreSQL built with
// ICU; without it this collation does not exist and the query fails with "collation does not exist".

const VI_COLLATION = '"vi-VN-x-icu"';
const COLUMN_RE = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;

/**
 * Builds the ORDER BY terms that sort a full-name column the Vietnamese way: given name (last word) first,
 * then the whole name (family + middle name decides between people with the same given name).
 * Extra spaces anywhere in the name (leading, trailing, several in a row) are ignored.
 *
 * Put it inside your own ORDER BY and add a unique column last so paging is stable:
 *   `ORDER BY c.class_name, ${vietnameseNameOrder('u.full_name')}, s.student_id`
 *
 * @param {string} column SQL column reference written by the developer, e.g. 'u.full_name'.
 *   Never pass user input: it is inserted into the SQL text (only simple "alias.column" names are accepted).
 * @returns {string} SQL fragment: "<given name> COLLATE "vi-VN-x-icu", <normalised full name> COLLATE "vi-VN-x-icu""
 */
export function vietnameseNameOrder(column) {
  if (!COLUMN_RE.test(column)) throw new Error(`vietnameseNameOrder: invalid column reference "${column}"`);
  const givenName = `substring(${column} from '(\\S+)\\s*$')`;
  const normalised = `btrim(regexp_replace(${column}, '\\s+', ' ', 'g'))`;
  return `${givenName} COLLATE ${VI_COLLATION}, ${normalised} COLLATE ${VI_COLLATION}`;
}
