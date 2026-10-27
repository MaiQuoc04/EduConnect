// Small input helpers shared by the validators (no DB access here).

export const isId = (v) => /^\d{1,18}$/.test(String(v ?? ''));
export const isIsoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) && !Number.isNaN(Date.parse(String(v)));

// null / '' / undefined -> null, otherwise the id as a string (BIGINT safe)
export const toNullableId = (v) => (v == null || v === '' ? null : String(v));

// trims and collapses inner whitespace: "  Phạm   Thu Hà " -> "Phạm Thu Hà"
export const normalizeSpaces = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

export const toPositiveInt = (v, fallback) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};
