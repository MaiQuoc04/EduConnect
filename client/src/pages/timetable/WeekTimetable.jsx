// Shared views of FE-10 (Stitch "Ink & Paper" designs): week grid (SCR-29 / SCR-45 "Tuần"), day timeline with the
// week matrix (SCR-45 "Hôm nay"), lesson detail (SCR-46 / SCR-58). Used by the class timetable and the teaching
// schedule. Phones (≤ 720px, required for Timetable View) always get the day timeline.

export const WEEKDAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
export const WEEKDAY_LONG = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];
export const dm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
export const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export const isMorning = (period) => period <= 5;

const dayIndex = (iso) => (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
// Week number inside the school year (week of the year's first day = week 1).
export function weekNumber(weekStart, yearStart) {
  if (!weekStart || !yearStart) return null;
  const monday = new Date(`${yearStart}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const n = Math.floor((new Date(`${weekStart}T00:00:00Z`) - monday) / (7 * 86400000)) + 1;
  return n >= 1 ? n : null;
}

// "Toán" -> "Toán", "Ngữ văn" -> "NV", "Giáo dục thể chất" -> "GDTC" (week matrix cells).
export function shortName(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].length <= 4 ? words[0] : words[0].slice(0, 3);
  return words.map((w) => w[0].toUpperCase()).join('').slice(0, 4);
}

// Clash items of a save / import (one per date) grouped per weekday + period + teacher + other class.
export function groupClashes(items = []) {
  const groups = new Map();
  for (const p of items) {
    const k = `${dayIndex(p.date)}|${p.period}|${p.teacher}|${p.otherClass}`;
    const g = groups.get(k);
    if (g) {
      g.count += 1;
      if (p.date < g.from) g.from = p.date;
      if (p.date > g.to) g.to = p.date;
    } else groups.set(k, { ...p, weekday: dayIndex(p.date), from: p.date, to: p.date, count: 1 });
  }
  return [...groups.values()].sort((a, b) => a.weekday - b.weekday || a.period - b.period);
}
export const clashWhen = (g) =>
  `${WEEKDAY_LONG[g.weekday]} · Tiết ${g.period}${g.count > 1 ? ` (${g.count} tuần, ${dm(g.from)} – ${dm(g.to)})` : ` (${dm(g.from)})`}`;

export function initials(name = '') {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return w.slice(-2).map((x) => x[0].toUpperCase()).join('');
}
