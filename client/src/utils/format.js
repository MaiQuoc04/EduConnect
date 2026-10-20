// "2026-10-21" or "2026-10-21 08:30:00" -> "21/10/2026"
export function formatDate(value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : String(value);
}

// School year shown on the login page: a year starts in September.
export function currentSchoolYearLabel(now = new Date()) {
  const y = now.getFullYear();
  return now.getMonth() >= 8 ? `${y}–${y + 1}` : `${y - 1}–${y}`;
}
