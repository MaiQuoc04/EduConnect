// FE-06 draft of one chat (17/11/2026, business-rules §6 "Drafts"), kept in this browser's localStorage so a member who
// moves to another chat, reloads or closes the tab finds what they were writing:
//   text      the message box
//   replyTo   the message being answered (only what the reply bar shows)
//   files     files already uploaded (what /uploads/confirm returned; files still uploading are not kept)
//   outbox    messages that were not sent (failed, or still on their way when the chat closed): shown again as
//             "not sent" with "Thử lại", which sends the same clientMessageId (the server never saves it twice)
// One draft per account and chat: key "educonnect:chat-draft:<userId>:<groupId>". Kept 7 days (Khanh's decision
// 17/11/2026). Nothing is sent to the server. A change is announced with the window event "educonnect:chat-draft"
// ({ detail: { groupId } }) so the chat list can show "Bản nháp: …".

const PREFIX = 'educonnect:chat-draft:';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DRAFT_EVENT = 'educonnect:chat-draft';

const keyOf = (userId, groupId) => `${PREFIX}${userId}:${groupId}`;

const isFile = (f) =>
  f && typeof f.storageKey === 'string' && typeof f.bucket === 'string' && typeof f.fileName === 'string' &&
  typeof f.mimeType === 'string' && Number.isFinite(f.sizeBytes);

function cleanReply(r) {
  if (!r || !Number.isSafeInteger(r.messageId)) return null;
  return {
    messageId: r.messageId,
    senderId: r.senderId,
    senderName: typeof r.senderName === 'string' ? r.senderName : '',
    senderNickname: typeof r.senderNickname === 'string' ? r.senderNickname : null,
    content: typeof r.content === 'string' ? r.content.slice(0, 200) : null,
    attachments: Array.isArray(r.attachments) ? r.attachments.map(() => ({})) : [], // only the count is shown
  };
}

function cleanOutbox(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => m && typeof m.clientMessageId === 'string' && (typeof m.content === 'string' || Array.isArray(m.files)))
    .map((m) => ({
      clientMessageId: m.clientMessageId,
      content: typeof m.content === 'string' ? m.content : '',
      files: Array.isArray(m.files) ? m.files.filter(isFile) : [],
      replyTo: cleanReply(m.replyTo),
      // Whatever it was when saved, it is not on its way any more: "not sent", and maybe saved after all (unsure).
      status: 'failed',
      unsure: m.status === 'sending' || Boolean(m.unsure),
      retryable: m.status === 'sending' || m.retryable !== false,
      error: typeof m.error === 'string' ? m.error : '',
    }));
}

const isEmpty = (d) => !d.text.trim() && !d.files.length && !d.outbox.length;

/** The saved draft { text, replyTo, files, outbox, savedAt } or null (none, too old, unreadable, storage blocked). */
export function readChatDraft(userId, groupId) {
  if (!userId || !groupId) return null;
  try {
    const raw = window.localStorage.getItem(keyOf(userId, groupId));
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const draft = {
      text: typeof saved?.text === 'string' ? saved.text : '',
      replyTo: cleanReply(saved?.replyTo),
      files: Array.isArray(saved?.files) ? saved.files.filter(isFile) : [],
      outbox: cleanOutbox(saved?.outbox),
      savedAt: saved?.savedAt,
    };
    if (!Number.isFinite(draft.savedAt) || Date.now() - draft.savedAt > MAX_AGE_MS || isEmpty(draft)) {
      clearChatDraft(userId, groupId);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

const announce = (groupId) => {
  try {
    window.dispatchEvent(new CustomEvent(DRAFT_EVENT, { detail: { groupId: Number(groupId) } }));
  } catch {
    // no window events (tests): nothing to tell
  }
};

/** Saves the draft; an empty one (no text, file or unsent message) is removed instead. */
export function writeChatDraft(userId, groupId, { text = '', replyTo = null, files = [], outbox = [] }) {
  if (!userId || !groupId) return;
  const draft = { text, replyTo: cleanReply(replyTo), files: files.filter(isFile), outbox: cleanOutbox(outbox) };
  // A reply alone is not worth keeping (nothing was written yet).
  if (isEmpty(draft)) {
    clearChatDraft(userId, groupId);
    return;
  }
  try {
    const raw = JSON.stringify({ ...draft, outbox: outbox.map(({ status, ...m }) => ({ ...m, status })), savedAt: Date.now() });
    if (window.localStorage.getItem(keyOf(userId, groupId))?.replace(/"savedAt":\d+/, '') === raw.replace(/"savedAt":\d+/, '')) {
      return; // unchanged
    }
    window.localStorage.setItem(keyOf(userId, groupId), raw);
    announce(groupId);
  } catch {
    // storage full or blocked (private mode): the chat still works, only without a draft
  }
}

export function clearChatDraft(userId, groupId) {
  try {
    const key = keyOf(userId, groupId);
    if (window.localStorage.getItem(key) === null) return;
    window.localStorage.removeItem(key);
    announce(groupId);
  } catch {
    // storage blocked: nothing was saved either
  }
}

/** One line for the chat list: "Bản nháp: …" text, files, or the unsent messages. */
export function draftPreview(draft) {
  if (!draft) return '';
  const text = draft.text.replace(/\s+/g, ' ').trim();
  if (text) return text;
  if (draft.files.length) return draft.files.length === 1 ? 'Một tệp đính kèm' : `${draft.files.length} tệp đính kèm`;
  return draft.outbox.length === 1 ? 'Một tin nhắn chưa gửi được' : `${draft.outbox.length} tin nhắn chưa gửi được`;
}
