// FE-10 class calendar – shared helpers. Dates are "YYYY-MM-DD", times "YYYY-MM-DDTHH:MM" (Vietnam time, as the
// server sends them); calculations use UTC so the browser's time zone never shifts a day.

export const WEEKDAY_LONG = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];
export const WEEKDAY_SHORT = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

// Category look (event_categories codes – fixed list, business rules §10).
export const CATEGORY_STYLE = {
  TEST: { tone: 'red', icon: 'quiz' },
  DEADLINE: { tone: 'amber', icon: 'assignment_late' },
  PARENT_MEETING: { tone: 'blue', icon: 'groups' },
  CLASS_MEETING: { tone: 'ink', icon: 'diversity_3' },
  OTHER: { tone: 'grey', icon: 'event_note' },
};
export const styleOf = (code) => CATEGORY_STYLE[code] ?? CATEGORY_STYLE.OTHER;

const toDate = (iso) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const toIso = (d) => d.toISOString().slice(0, 10);
export const addDays = (iso, n) => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
};
export const weekdayIndex = (iso) => (toDate(iso).getUTCDay() + 6) % 7; // Monday = 0
export const mondayOf = (iso) => addDays(iso, -weekdayIndex(iso));
export const dm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
export const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export const hm = (local) => (local ? local.slice(11, 16) : '');
export const longDate = (iso) => `${WEEKDAY_LONG[weekdayIndex(iso)]}, ${dmy(iso)}`;
export const isoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '');

// "07:50 – 08:35" / "07:50" / across days "07:50 20/11 – 09:00 21/11".
export function timeRange(ev) {
  if (!ev.endAt) return hm(ev.startAt);
  if (ev.endAt.slice(0, 10) === ev.startAt.slice(0, 10)) return `${hm(ev.startAt)} – ${hm(ev.endAt)}`;
  return `${hm(ev.startAt)} ${dm(ev.startAt)} – ${hm(ev.endAt)} ${dm(ev.endAt)}`;
}

// Week number inside the school year (week of the year's first day = week 1).
export function weekNumber(weekStart, yearStart) {
  if (!weekStart || !yearStart) return null;
  const n = Math.floor((toDate(weekStart) - toDate(mondayOf(yearStart))) / (7 * 86400000)) + 1;
  return n >= 1 ? n : null;
}

// Who sees the event, in words (detail and form).
export function audienceText(ev) {
  const parts = [];
  if (ev.forStudents) parts.push('học sinh');
  if (ev.forParents) parts.push('phụ huynh');
  if (ev.forSubjectTeachers) parts.push('giáo viên bộ môn');
  return parts.length ? `Tất cả ${parts.join(', ')} lớp ${ev.className}` : null;
}
