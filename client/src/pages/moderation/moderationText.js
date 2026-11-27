import { MODERATION_CATEGORY_LABELS, REPORT_REASON_LABELS } from '../../utils/moderation.js';

// Vietnamese texts of the "Quy chuẩn cộng đồng" screen (moderation phase 6, FE-08 Anh). Same words as the server's
// notifications (utils/moderationNotify.js CATEGORY_LABELS) and the shared client labels (utils/moderation.js).

const capital = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/** Categories of a violation: the 5 of the rules, plus the 3 that only come from a report decision. */
export const VIOLATION_CATEGORY_LABELS = Object.freeze({
  ...Object.fromEntries(Object.entries(MODERATION_CATEGORY_LABELS).map(([code, text]) => [code, capital(text)])),
  SPAM: 'Spam, quảng cáo',
  FALSE_INFORMATION: 'Thông tin sai sự thật',
  OTHER: 'Vi phạm khác',
});
export const RULE_CATEGORIES = Object.keys(MODERATION_CATEGORY_LABELS); // the 5 a rule can have
export const VIOLATION_CATEGORIES = Object.keys(VIOLATION_CATEGORY_LABELS);
export const categoryLabel = (code) => VIOLATION_CATEGORY_LABELS[code] ?? code;
export const reasonLabel = (code) => REPORT_REASON_LABELS[code] ?? code;

export const ROLE_TEXT = { SCHOOL_MANAGER: 'Ban giám hiệu', TEACHER: 'Giáo viên', STUDENT: 'Học sinh', PARENT: 'Phụ huynh' };
export const SOURCE_TEXT = { AUTO: 'Tự động', REPORT: 'Qua báo cáo' };
export const CONTENT_TYPE_TEXT = { COMMENT: 'Bình luận', MESSAGE: 'Tin nhắn' };
export const STATUS_TEXT = { ACTIVE: 'Đang ẩn', UNHIDDEN: 'Đã gỡ ẩn' };
export const GROUP_TYPE_TEXT = {
  GENERAL: 'Nhóm lớp',
  STUDENT: 'Nhóm học sinh',
  PARENT: 'Nhóm phụ huynh',
  TEAM_CHAT: 'Nhóm nhỏ',
  TEACHER_SCHOOL: 'Nhóm giáo viên',
  DIRECT: 'Trò chuyện riêng',
};

export const contentTypeOf = (code) => (code === 'MESSAGE' ? 'Tin nhắn' : 'Bình luận');

/** "Bình luận trong bài “…”", "Tin nhắn trong nhóm “10A1”", "Tin nhắn trong một cuộc trò chuyện riêng". */
export function placeText(place) {
  if (!place) return '—';
  if (place.kind === 'SCHOOL_POST') return `Bài trên bảng tin trường “${place.name ?? ''}”`;
  if (place.kind === 'GROUP_POST') return `Bài viết của nhóm “${place.name ?? ''}”`;
  if (place.kind === 'DIRECT_CHAT') return 'Một cuộc trò chuyện riêng';
  return `Nhóm trò chuyện “${place.name ?? ''}”`;
}

/** "Thô tục 4 · Xúc phạm 1" */
export function byCategoryText(byCategory) {
  return Object.entries(byCategory ?? {})
    .map(([code, n]) => `${categoryLabel(code)} ${n}`)
    .join(' · ');
}

// "2026-11-25 19:06:49.75+07" (Vietnam time from the API) -> "19:06, 25/11/2026"; a day "2026-11-25" -> "25/11/2026"
export function formatWhen(value) {
  if (!value) return '';
  const text = String(value);
  const [y, m, d] = text.slice(0, 10).split('-');
  return text.length > 10 ? `${text.slice(11, 16)}, ${d}/${m}/${y}` : `${d}/${m}/${y}`;
}

export const rolesText = (roles) => (roles ?? []).map((r) => ROLE_TEXT[r] ?? r).join(', ');
