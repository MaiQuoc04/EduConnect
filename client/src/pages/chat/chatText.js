import { MEMBER_KIND_LABELS } from '../groups/groupLabels.js';
import { memberSubline } from '../groups/memberText.js';

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

// One-line preview of the last message: "Bạn: …" for my own, "<name>: …" for others (nickname inside the class);
// in a 1-1 chat (UC-49) the other person's messages need no name. The line is cut with "…" by CSS.
export function previewText(message, myId, direct = false) {
  if (!message) return 'Chưa có tin nhắn';
  if (message.isDeleted) {
    if (message.senderId === myId) return 'Bạn đã xoá một tin nhắn';
    return direct ? 'Tin nhắn đã được xoá' : `${message.senderNickname || message.senderName} đã xoá một tin nhắn`;
  }
  const text = (message.content ?? '').replace(/\s+/g, ' ').trim() || filesText(message.attachmentCount ?? message.attachments?.length); // list: count; socket: the files
  if (message.senderId === myId) return `Bạn: ${text}`;
  return direct ? text : `${message.senderNickname || message.senderName}: ${text}`;
}

// A message that is only files: "Đã gửi một tệp" / "Đã gửi 3 tệp" (previews, quotes).
export function filesText(count) {
  if (!count) return '';
  return count === 1 ? 'Đã gửi một tệp' : `Đã gửi ${count} tệp`;
}

// UC-49: who someone is to me, e.g. "Giáo viên chủ nhiệm · 10A1" or "Bố của Phạm Gia Bảo · 10A1".
const KIND_ORDER = ['HOMEROOM', 'MANAGER', 'SUBJECT_TEACHER', 'TEACHER', 'STUDENT', 'PARENT'];
export function contactLabel(person) {
  if (!person) return '';
  const kind = KIND_ORDER.find((k) => person.kinds?.includes(k));
  const who = (kind === 'PARENT' && memberSubline(person)) || MEMBER_KIND_LABELS[kind] || '';
  const classes = (person.classes ?? []).map((c) => c.className).join(', ');
  return [who, classes].filter(Boolean).join(' · ');
}

// UC-111: the fixed set of reactions (same codes as the server).
export const REACTIONS = [
  { code: 'LIKE', emoji: '👍', label: 'Thích' },
  { code: 'LOVE', emoji: '❤️', label: 'Yêu thích' },
  { code: 'HAHA', emoji: '😆', label: 'Vui' },
  { code: 'WOW', emoji: '😮', label: 'Ngạc nhiên' },
  { code: 'SAD', emoji: '😢', label: 'Buồn' },
  { code: 'THANKS', emoji: '🙏', label: 'Cảm ơn' },
];
export const REACTION_EMOJI = Object.fromEntries(REACTIONS.map((r) => [r.code, r.emoji]));

export const unreadLabel = (n) => (n > 99 ? '99+' : String(n));
