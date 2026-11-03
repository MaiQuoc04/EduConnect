// FE-06 display helpers. Times arrive as Vietnam-time strings ("2026-11-04 08:30:12.345+07"); they are only
// formatted here, never compared (the server compares times in SQL).
const VN_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
const today = () => VN_DAY.format(new Date());
const yesterday = () => VN_DAY.format(new Date(Date.now() - 86_400_000));

export const dayOf = (sentAt) => sentAt.slice(0, 10);
export const timeOf = (sentAt) => sentAt.slice(11, 16);

// Day separator in a chat: "Hôm nay", "Hôm qua" or "04/11/2026".
export function dayLabel(day) {
  if (day === today()) return 'Hôm nay';
  if (day === yesterday()) return 'Hôm qua';
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

// Time in the conversation list: "08:30" today, "Hôm qua", else "04/11".
export function shortTime(sentAt) {
  const day = dayOf(sentAt);
  if (day === today()) return timeOf(sentAt);
  if (day === yesterday()) return 'Hôm qua';
  const [, m, d] = day.split('-');
  return `${d}/${m}`;
}

// One-line preview of the last message: "Bạn: …" for my own, "<name>: …" for others (nickname inside the class).
// The line is cut with "…" by CSS (text-overflow: ellipsis).
export function previewText(message, myId) {
  if (!message) return 'Chưa có tin nhắn';
  const who = message.senderId === myId ? 'Bạn' : message.senderNickname || message.senderName;
  return `${who}: ${(message.content ?? '').replace(/\s+/g, ' ').trim()}`;
}

export const unreadLabel = (n) => (n > 99 ? '99+' : String(n));
