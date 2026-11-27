/*
 * Automatic content check (moderation, docs/moderation-plan.md "Luồng tự động"): the Vietnamese texts of the feeds
 * (CommentThread) and the chat (pages/chat). First the name of each category a comment or message can be hidden for. Same codes as moderation_rules_category_check and the same words as
 * the server's notification (server/src/utils/moderationNotify.js CATEGORY_LABELS). Lower case: they are read inside
 * a sentence ("…vi phạm quy chuẩn cộng đồng: ngôn từ thô tục.").
 */
export const MODERATION_CATEGORY_LABELS = Object.freeze({
  VIOLENCE: 'bạo lực, đe doạ',
  SEXUAL: 'nội dung tình dục',
  DISCRIMINATION: 'kỳ thị',
  HARASSMENT: 'xúc phạm, quấy rối',
  INAPPROPRIATE_LANGUAGE: 'ngôn từ thô tục',
});

function hiddenNotice(noun, category) {
  const label = MODERATION_CATEGORY_LABELS[category];
  return label
    ? `${noun} của bạn đã bị ẩn vì vi phạm quy chuẩn cộng đồng: ${label}.`
    : `${noun} của bạn đã bị ẩn vì vi phạm quy chuẩn cộng đồng.`;
}

/** "Bình luận của bạn đã bị ẩn vì vi phạm quy chuẩn cộng đồng: <loại>." – shown under the box the comment was sent from. */
export const hiddenCommentNotice = (category) => hiddenNotice('Bình luận', category);

/** "Tin nhắn của bạn đã bị ẩn vì vi phạm quy chuẩn cộng đồng: <loại>." – shown above the chat box after sending. */
export const hiddenMessageNotice = (category) => hiddenNotice('Tin nhắn', category);

/** What the other members see instead of a message hidden by the automatic check (isModerated). */
export const MODERATED_MESSAGE_TEXT = 'Tin nhắn đã bị ẩn do vi phạm quy chuẩn cộng đồng';

/** What the author sees by default of their own comment hidden by the automatic check (components/HiddenContent). */
export const MODERATED_COMMENT_TEXT = 'Bình luận đã bị ẩn do vi phạm quy chuẩn cộng đồng';

/** Under the original text once the author chose to show their own hidden message / comment. */
export const OWN_HIDDEN_NOTE = 'Chỉ bạn xem được nội dung này';

/** The last message of a chat in the conversation list when it was hidden (never its text, not even for the sender). */
export const MODERATED_PREVIEW_TEXT = 'Tin nhắn đã bị ẩn';

/** The small line always shown under the chat box. */
export const CHAT_MODERATION_NOTE =
  'Tin nhắn được kiểm tự động theo quy chuẩn cộng đồng của trường. Khi có báo cáo, Ban giám hiệu có thể xem nội dung hội thoại liên quan.';

/**
 * Reasons of a report (comments and chat messages, moderation phase 5): the codes of comment_reports_reason_check /
 * message_reports_reason_check. Shared by the three report dialogs and the report queues (CommentThread re-exports it
 * as REPORT_REASONS for the pages that already import it from there).
 */
export const SUPPORT_REASON = 'NEEDS_SUPPORT';
export const REPORT_REASONS = Object.freeze([
  { code: 'INAPPROPRIATE_LANGUAGE', label: 'Ngôn từ không phù hợp' },
  { code: 'HARASSMENT', label: 'Quấy rối, xúc phạm hoặc bắt nạt' },
  { code: 'SPAM', label: 'Spam, quảng cáo hoặc nội dung lặp lại' },
  { code: 'FALSE_INFORMATION', label: 'Thông tin sai sự thật' },
  { code: SUPPORT_REASON, label: 'Cần được hỗ trợ' },
  { code: 'OTHER', label: 'Lý do khác' },
]);
export const REPORT_REASON_LABELS = Object.freeze(Object.fromEntries(REPORT_REASONS.map((r) => [r.code, r.label])));

/** Shown at once when "Cần được hỗ trợ" is chosen, and again after such a report is sent. */
export const SUPPORT_HINT =
  'Nếu bạn hoặc bạn mình đang gặp nguy hiểm, hãy báo ngay thầy cô hoặc gọi Tổng đài quốc gia bảo vệ trẻ em 111.';

/** The "Kết quả hỗ trợ" a moderator must write when deciding content with a "Cần được hỗ trợ" report. */
export const MAX_SUPPORT_NOTE_LENGTH = 1000;

/*
 * Group posts stopped when posted or edited (approvalStatus 'BLOCKED', 27/11/2026): seen by their author only, with
 * post.moderation = { category, terms } (the words to change, checked again by the server when the post is read).
 */
export const BLOCKED_POST_LABEL = 'Chưa đăng – vi phạm quy chuẩn cộng đồng';

/** "Bài viết có từ ngữ vi phạm quy chuẩn cộng đồng (<loại>). Hãy sửa lại để đăng." */
export function blockedPostNotice(category) {
  const label = MODERATION_CATEGORY_LABELS[category];
  return label
    ? `Bài viết có từ ngữ vi phạm quy chuẩn cộng đồng (${label}). Hãy sửa lại để đăng.`
    : 'Bài viết có từ ngữ vi phạm quy chuẩn cộng đồng. Hãy sửa lại để đăng.';
}

/** "Từ ngữ cần sửa: a, b" – '' when the server names none (the rules changed since). */
export const blockedPostTerms = (terms) => (terms?.length ? `Từ ngữ cần sửa: ${terms.join(', ')}` : '');

/*
 * A BLOCKED post whose words no longer match any rule (terms empty: the rules changed). In the form, buttonLabel is
 * the save button as shown ("Gửi duyệt" / "Đăng bài"); elsewhere (card, SCR-37) the author is sent to "Sửa".
 */
export const blockedPostRecheck = (buttonLabel) =>
  buttonLabel
    ? `Quy chuẩn đã được cập nhật. Hãy bấm ${buttonLabel} để kiểm tra lại.`
    : 'Quy chuẩn đã được cập nhật. Hãy bấm Sửa rồi đăng lại.';
