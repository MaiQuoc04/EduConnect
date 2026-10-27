// Small input helpers shared by the validators (no DB access here).

// Positive integer id, at most 18 digits (BIGINT safe), given as number or numeric string. "0", "01", "1.5", "-1",
// "1e3", true, [] and {} are rejected.
export const isId = (v) => (typeof v === 'number' || typeof v === 'string') && /^[1-9]\d{0,17}$/.test(String(v));

// Real calendar date 'YYYY-MM-DD' between 2000 and 2100 ("2026-02-31", "2026-13-01", "2026-1-5" are rejected).
export function isIsoDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// null / '' / undefined -> null, otherwise the id as a string (BIGINT safe)
export const toNullableId = (v) => (v == null || v === '' ? null : String(v));

export const toPositiveInt = (v, fallback, max = Number.MAX_SAFE_INTEGER) => {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
};

export const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

// Query values must be single strings: "?a=1&a=2" (array) or "?a[b]=1" (object) are not accepted.
export const isQueryValue = (v) => v === undefined || typeof v === 'string';
