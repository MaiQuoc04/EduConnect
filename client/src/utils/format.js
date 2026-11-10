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

// 8600000 -> "8,2 MB", 79872 -> "78 KB", 512 -> "512 B" (1 KB = 1024 B, Vietnamese decimal comma).
export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;
}
