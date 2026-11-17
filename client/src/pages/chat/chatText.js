import { MEMBER_KIND_LABELS } from '../groups/groupLabels.js';
import { RELATIONSHIP_LABELS } from '../../messages.js';
import { memberSubline } from '../groups/memberText.js';

// FE-06 display helpers. Times arrive as Vietnam-time strings ("2026-11-04 08:30:12.345+07"); they are only
// formatted here, never compared (the server compares times in SQL).
const VN_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
const today = () => VN_DAY.format(new Date());
const yesterday = () => VN_DAY.format(new Date(Date.now() - 86_400_000));

export const dayOf = (sentAt) => sentAt.slice(0, 10);

// A Vietnam-time string from the API as milliseconds, only to ORDER chats (latest activity first): a new message, or
// a message deleted for everyone (15/11/2026, business-rules §6).
export function timeKey(value) {
  if (!value) return 0;
  const iso = value.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d{2})$/, '$1:00');
  return Date.parse(iso) || 0;
}
export const activityOf = (message) => message?.activityAt ?? message?.sentAt ?? null;
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
  if (message.type === 'SYSTEM') return systemText(message, myId);
  if (message.isDeleted) {
    if (message.senderId === myId) return 'Bạn đã xoá một tin nhắn';
    return direct ? 'Tin nhắn đã được xoá' : `${message.senderNickname || message.senderName} đã xoá một tin nhắn`;
  }
  const text = (message.content ?? '').replace(/\s+/g, ' ').trim() || filesText(message.attachmentCount ?? message.attachments?.length); // list: count; socket: the files
  if (message.senderId === myId) return `Bạn: ${text}`;
  return direct ? text : `${message.senderNickname || message.senderName}: ${text}`;
}

// A team's system line (15/11/2026, business-rules §4 / §6): "Bạn đã rời nhóm", "Lan đã chuyển quyền trưởng nhóm
// cho bạn"… message: { event, senderId, senderName, targetUserId, targetName, content }.
export function systemText(message, myId) {
  const who = message.senderId === myId ? 'Bạn' : message.senderNickname || message.senderName || 'Một thành viên';
  const target = message.targetUserId === myId ? 'bạn' : message.targetName || 'một thành viên';
  switch (message.event) {
    case 'TEAM_CREATED':
      return `${who} đã tạo nhóm`;
    case 'TEAM_RENAMED':
      return `${who} đã đổi tên nhóm thành “${message.content ?? ''}”`;
    case 'MEMBER_LEFT':
      return `${who} đã rời nhóm`;
    case 'MEMBER_REMOVED':
      return message.senderId === myId ? 'Bạn không còn trong nhóm' : `${who} không còn trong nhóm`;
    case 'LEADER_CHANGED':
      return `${who} đã chuyển quyền trưởng nhóm cho ${target}`;
    case 'MEMBER_ADDED': // 17/11/2026: the leader added someone
      return `${who} đã thêm ${target} vào nhóm`;
    case 'MEMBER_KICKED': // 17/11/2026: the leader removed someone
      return `${who} đã xoá ${target} khỏi nhóm`;
    default:
      return 'Nhóm có thay đổi';
  }
}

// A message that is only files: "Đã gửi một tệp" / "Đã gửi 3 tệp" (previews, quotes).
export function filesText(count) {
  if (!count) return '';
  return count === 1 ? 'Đã gửi một tệp' : `Đã gửi ${count} tệp`;
}

// UC-49: who someone is to me, e.g. "Giáo viên chủ nhiệm · 10A1" or "Bố của Phạm Gia Bảo · 10A1".
const KIND_ORDER = ['HOMEROOM', 'MANAGER', 'SUBJECT_TEACHER', 'TEACHER', 'STUDENT', 'PARENT'];
// A parent (17/11/2026): each child with their class – "Mẹ của Lê Minh Tuấn (10A1) · Mẹ của Phạm Gia Khánh (11D1)" –
// and only the classes not already named after a child.
export function contactLabel(person) {
  if (!person) return '';
  const kind = KIND_ORDER.find((k) => person.kinds?.includes(k));
  const children = kind === 'PARENT' ? [...(person.children ?? [])].sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi')) : [];
  const named = new Set(children.map((c) => c.classId).filter(Boolean));
  const who = children.length
    ? children
        .map((c) => `${RELATIONSHIP_LABELS[c.relationship] ?? 'Phụ huynh'} của ${c.fullName}${c.className ? ` (${c.className})` : ''}`)
        .join(' · ')
    : (kind === 'PARENT' && memberSubline(person)) || MEMBER_KIND_LABELS[kind] || '';
  const classes = (person.classes ?? [])
    .filter((c) => !named.has(c.classId))
    .map((c) => c.className)
    .join(', ');
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
