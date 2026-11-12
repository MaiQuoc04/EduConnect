// FE-07 shared helpers. Times are "YYYY-MM-DDTHH:MM" Vietnam time as the server sends them.

const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
export const hm = (t) => (t ? t.slice(11, 16) : '');
export const dmy = (t) => (t ? `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}` : '');
export const dm = (t) => (t ? `${t.slice(8, 10)}/${t.slice(5, 7)}` : '');
export const weekday = (t) => WEEKDAY[new Date(`${t.slice(0, 10)}T00:00:00Z`).getUTCDay()];
export const at = (t) => (t ? `${hm(t)} · ${dmy(t)}` : '');

// "07:00 – 17:30 · 28/10/2026" / across days "07:00 28/11 – 16:00 29/11/2026" / no end "07:00 · 28/10/2026".
export function whenText(a) {
  if (!a.endAt) return at(a.startAt);
  if (a.endAt.slice(0, 10) === a.startAt.slice(0, 10)) return `${hm(a.startAt)} – ${hm(a.endAt)} · ${dmy(a.startAt)}`;
  return `${hm(a.startAt)} ${dm(a.startAt)} – ${hm(a.endAt)} ${dmy(a.endAt)}`;
}

// Days (rounded up) from now to a local time, both "YYYY-MM-DDTHH:MM"; the browser's clock is close enough for a hint.
export function daysLeft(t) {
  const ms = Date.parse(`${t}:00+07:00`) - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86400000);
}

// One state per activity for chips and filters.
//   cancelled | ended | ongoing | closed (deadline passed, not started) | full | open
export function stateOf(a) {
  if (a.status === 'CANCELLED') return { key: 'cancelled', label: 'Đã huỷ', tone: 'red' };
  if (a.ended) return { key: 'ended', label: 'Đã diễn ra', tone: 'grey' };
  if (a.started) return { key: 'ongoing', label: 'Đang diễn ra', tone: 'blue' };
  if (!a.beforeDeadline) return { key: 'closed', label: 'Hết hạn đăng ký', tone: 'amber' };
  if (a.capacity && a.registeredCount >= a.capacity) return { key: 'full', label: 'Đã đủ chỉ tiêu', tone: 'amber' };
  return { key: 'open', label: 'Đang mở đăng ký', tone: 'green' };
}

export const countText = (a) => (a.capacity ? `${a.registeredCount}/${a.capacity}` : `${a.registeredCount}`);

export const REG_STATUS = {
  REGISTERED: { label: 'Đã đăng ký', tone: 'green' },
  CANCELLED: { label: 'Đã huỷ đăng ký', tone: 'red' },
  NONE: { label: 'Chưa đăng ký', tone: 'grey' },
};
