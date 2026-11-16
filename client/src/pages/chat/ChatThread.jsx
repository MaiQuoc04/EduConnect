import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { UPLOAD_TARGETS } from '../../api/uploads.js';
import { fileIcon, useAttachmentUploads } from '../../components/AttachmentPicker.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket, useSocketStatus } from '../../context/SocketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { MEMBER_KIND_LABELS } from '../groups/groupLabels.js';
import { memberSubline } from '../groups/memberText.js';
import { readChatDraft, writeChatDraft } from './chatDraft.js';
import { dayOf, filesText } from './chatText.js';
import DeleteMessageDialog from './DeleteMessageDialog.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import MessageRow, { OutboxRow } from './MessageRow.jsx';

// UC-47 Chat in Group (FE-06, Khanh) – SCR-43 Group Chat / SCR-50 Chat Room: the messages of one group and the
// composer. The server decides who may read or send (active role, data scope, read-only year) and sends only the
// messages since the user first joined the group (business-rules §6). New messages and read receipts arrive over the
// socket ("message:new", "message:read"); "seen by" compares message ids sent by the server, not times.
// UC-110 reply, UC-111 reactions, UC-112 emoji, UC-113 delete message: the composer holds the message being answered;
// reactions and deletions also arrive over the socket ("message:reaction", "message:deleted", "message:hidden").
// Files (12/11/2026): the 📎 button (or pasting a picture) uploads each file straight to storage with the shared FE-08
// upload queue (target 'message', images compressed first); "Gửi" waits until they are up. A message may be files
// only. Links live one hour: a picture that no longer loads asks for that message again (refreshFiles).
//
// 17/11/2026 (business-rules §6 "Sending", "Drafts", "Real time"):
//   * Sending: a message shows at once in the outbox (dim, "Đang gửi…") and is sent in order, one at a time, with a
//     random clientMessageId; the server never saves the same id twice, so "Thử lại" after a timeout or a lost
//     connection is safe. A failed message stays with "Thử lại" / "Sửa" / "Xoá"; no answer in time = "maybe sent".
//   * Draft: the text, the reply, the uploaded files and the unsent messages are kept per chat (chatDraft.js).
//   * Connection: a bar after 3 s without the socket; on every (re)connection the chat reads what it missed (catchUp):
//     the messages after the last one shown plus the latest page merged in (deletions, reactions), keeping the older
//     messages already loaded and the scroll position.
//   * Reading: new messages while the user reads older ones do not move the list; "↓ n tin nhắn mới" takes them down.
//     The chat counts as read only when its end is on screen in a visible tab.
//   * chat:access-changed: who may write changed (a class change, a 1-1 chat out of reach) → canSend is read again.
const MESSAGE_MAX = 2000; // same limit and count as the server (UTF-16 length after trim)
const SEEN_NAMES = 3;
const FILE_RETRY_MS = 15_000; // one new link per message at most this often
const SEND_TIMEOUT_MS = 15_000; // business-rules §6 (Khanh 17/11/2026)
const LOAD_TIMEOUT_MS = 20_000;
const CATCH_UP_MAX = 100; // more missed than this: the latest page replaces the list
const DRAFT_SAVE_MS = 500;

// Limits of the file button (count, sizes from system_settings, types): read once per page load, shared by every chat.
let limitsRequest = null;
function loadFileLimits() {
  limitsRequest ??= api
    .get('/conversations/attachment-limits', { timeout: LOAD_TIMEOUT_MS })
    .then((r) => r.data)
    .catch((err) => {
      limitsRequest = null; // try again next time
      throw err;
    });
  return limitsRequest;
}
const NEAR_BOTTOM_PX = 120;
const INPUT_MIN_PX = 36; // = .btn height
const INPUT_MAX_PX = 136; // about six lines of 20px

// When the user's own message can no longer be deleted for everyone, from the seconds left the server sent. Only
// decides which choices to show; the server checks the time again.
const stamp = (m) => ({ ...m, deleteUntil: Date.now() + (m.deleteSecondsLeft ?? 0) * 1000 });

// Messages by id, oldest first: socket and API answers may arrive in any order.
function mergeMessages(list, incoming) {
  if (!incoming.length) return list;
  const byId = new Map(list.map((m) => [m.messageId, m]));
  for (const m of incoming) byId.set(m.messageId, m);
  return [...byId.values()].sort((a, b) => a.messageId - b.messageId);
}

// The latest page read again: from its first message on, it replaces what is shown (a message deleted for me is gone,
// one deleted for everyone shows its placeholder, reactions are current); older messages stay as they are.
function mergeLatest(list, page) {
  if (!page.length) return list;
  const from = page[0].messageId;
  return mergeMessages(
    list.filter((m) => m.messageId < from),
    page,
  );
}

// A random UUID v4 for clientMessageId (crypto.randomUUID needs https or localhost; getRandomValues works everywhere).
function newClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// What the reply bar and an outbox message keep of the message being answered.
const replyPart = (m) =>
  m && {
    messageId: m.messageId,
    senderId: m.senderId,
    senderName: m.senderName,
    senderNickname: m.senderNickname,
    content: m.content,
    attachments: m.attachments ?? [],
  };

function memberLabel(member) {
  if (!member) return '';
  return memberSubline(member) || MEMBER_KIND_LABELS[member.kinds?.[0]] || '';
}

// UC-49 1-1 chats (groupType DIRECT): no sender names, "Đã xem" without names, and sending closes when the two are
// no longer in reach or the other account is locked (blockedReason). onPeer(peer) passes the other person's details
// (labels) to the header.
const BLOCKED_TEXT = {
  READ_ONLY: 'Nhóm chỉ còn để xem lại',
  OUT_OF_SCOPE: 'Bạn không còn nhắn tin được với người này',
  LOCKED: 'Tài khoản này đã bị khoá',
  NOT_MEMBER: 'Bạn không còn trong cuộc trò chuyện này',
};
const BLOCKED_BY_CODE = {
  MSG_GROUP_READ_ONLY: 'READ_ONLY',
  MSG_DIRECT_OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  MSG_DIRECT_LOCKED: 'LOCKED',
  MSG_CHAT_NOT_MEMBER: 'NOT_MEMBER',
};

// Why a message was not sent, and whether sending it again can help.
function sendFailure(err) {
  if (BLOCKED_BY_CODE[err.code]) return { error: errorText(err), retryable: false, unsure: false };
  if (err.status === 0) {
    // No answer: the server may have saved it. "Thử lại" sends the same clientMessageId, so never twice.
    return { error: 'Chưa rõ đã gửi được chưa.', retryable: true, unsure: true };
  }
  if (err.status >= 500 || err.status === 429) return { error: errorText(err), retryable: true, unsure: false };
  return { error: errorText(err), retryable: err.code === 'MSG_REPLY_INVALID', unsure: false };
}

export default function ChatThread({ groupId, onPeer }) {
  const { user } = useAuth();
  const me = user?.id;
  const socket = useSocket();
  const socketStatus = useSocketStatus();
  const toast = useToast();
  const id = Number(groupId);
  const url = `/conversations/${id}/messages`;
  const [restored] = useState(() => readChatDraft(me, id));
  const [state, setState] = useState({ loading: true, error: '', canSend: false, blockedReason: null, direct: false });
  const onPeerRef = useRef(onPeer);
  onPeerRef.current = onPeer;
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [text, setText] = useState(restored?.text ?? '');
  const [replyTo, setReplyTo] = useState(restored?.replyTo ?? null); // the message being answered
  const [draftFiles, setDraftFiles] = useState(restored?.files ?? []); // uploaded before, kept by the draft
  const [outbox, setOutbox] = useState(restored?.outbox ?? []); // my messages not confirmed by the server yet
  const [menu, setMenu] = useState(null); // { id, kind: 'react' | 'who' } popup of one message
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [deleting, setDeleting] = useState(null); // { message, forEveryone, expired }
  const [fileLimits, setFileLimits] = useState(null);
  const [unseen, setUnseen] = useState(0); // new messages below while reading older ones
  const [syncError, setSyncError] = useState(false); // catching up failed; trying again
  const fileInput = useRef(null);
  const fileRefresh = useRef(new Map()); // messageId -> last time new links were asked for
  const jumpTo = useRef(null); // message to scroll to once it is loaded
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stickToBottom = useRef(true);
  const prepend = useRef(null); // scroll position kept while older messages are added on top
  const readTimer = useRef(null);
  const readOwed = useRef(false); // something arrived that is not read yet (end of the chat not on screen)
  const loaded = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const outboxRef = useRef(outbox);
  outboxRef.current = outbox;
  const sendQueue = useRef(Promise.resolve());
  const sendLock = useRef(false);
  const reacting = useRef(new Set());
  const olderLock = useRef(false);
  const catchUpTimer = useRef(null);
  const catchUpDelay = useRef(2000);
  const alive = useRef(true);
  const uploads = useAttachmentUploads({
    target: UPLOAD_TARGETS.MESSAGE,
    groupId: id,
    limits: fileLimits,
    existingCount: draftFiles.length,
  });

  useEffect(() => {
    alive.current = true;
    loadFileLimits()
      .then((limits) => alive.current && setFileLimits(limits))
      .catch(() => {});
    return () => {
      alive.current = false;
      clearTimeout(catchUpTimer.current);
    };
  }, []);

  // ---- draft (chatDraft.js) -------------------------------------------------------------------------------------
  const draft = { text, replyTo, files: [...draftFiles, ...uploads.uploaded], outbox };
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const draftJson = JSON.stringify(draft);
  useEffect(() => {
    const timer = setTimeout(() => writeChatDraft(me, id, JSON.parse(draftJson)), DRAFT_SAVE_MS);
    return () => clearTimeout(timer);
  }, [draftJson, me, id]);
  // Leaving the chat (another chat, another page): saved at once, what is still on its way included.
  useEffect(() => () => writeChatDraft(me, id, draftRef.current), [me, id]);
  useEffect(() => {
    const save = () => writeChatDraft(me, id, draftRef.current);
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
  }, [me, id]);

  function addFiles(list) {
    const notice = uploads.add(list);
    if (notice) toast(notice.replace('Mỗi bài', 'Mỗi tin nhắn'));
  }

  // A picture pasted into the message box is attached; text pasted with it (Word, a web page) still goes in the box.
  function onPaste(e) {
    const pasted = [...(e.clipboardData?.files ?? [])];
    if (!pasted.length || !fileLimits || !state.canSend) return;
    if (!e.clipboardData.getData('text/plain')) e.preventDefault();
    addFiles(pasted);
  }

  // New links for the files of one message (the old ones expired): the page of exactly that message.
  const refreshFiles = useCallback(
    async (messageId) => {
      const last = fileRefresh.current.get(messageId) ?? 0;
      if (Date.now() - last < FILE_RETRY_MS) return;
      fileRefresh.current.set(messageId, Date.now());
      try {
        const { data } = await api.get(url, { params: { before: messageId + 1, limit: 1 }, timeout: LOAD_TIMEOUT_MS });
        const fresh = data.messages.find((m) => m.messageId === messageId);
        if (!fresh) return;
        setMessages((list) => list.map((m) => (m.messageId === messageId ? { ...m, attachments: fresh.attachments } : m)));
      } catch {
        // keep what is shown; the next reload brings new links
      }
    },
    [url],
  );

  // ---- reading --------------------------------------------------------------------------------------------------
  const nearBottom = useCallback(() => {
    const box = listRef.current;
    return !box || box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  // Tell the server the chat is read up to now – only while the tab is visible and the end of the chat is on screen
  // (or about to be), at most once per second. Otherwise it is owed until the user gets there.
  const markRead = useCallback(() => {
    if (document.visibilityState !== 'visible' || !(stickToBottom.current || nearBottom())) {
      readOwed.current = true;
      return;
    }
    readOwed.current = false;
    if (readTimer.current) return;
    readTimer.current = setTimeout(() => {
      readTimer.current = null;
      api.post(`/conversations/${id}/read`, null, { timeout: LOAD_TIMEOUT_MS }).catch(() => {});
    }, 1000);
  }, [id, nearBottom]);

  function onScroll() {
    const near = nearBottom();
    stickToBottom.current = near; // a later update (reaction, deletion) does not pull a reader down
    if (near) {
      setUnseen(0);
      if (readOwed.current) markRead();
    }
  }

  function scrollDown() {
    const box = listRef.current;
    stickToBottom.current = true;
    setUnseen(0);
    if (box) box.scrollTop = box.scrollHeight;
    markRead();
  }

  // ---- loading --------------------------------------------------------------------------------------------------
  // Messages of the outbox the server already has (a reload after "maybe sent") leave it.
  const dropSaved = useCallback((list) => {
    const saved = new Set(list.map((m) => m.clientMessageId).filter(Boolean));
    if (saved.size) setOutbox((box) => box.filter((m) => !saved.has(m.clientMessageId)));
  }, []);

  const applyHeader = useCallback((data) => {
    setMembers(data.members);
    setState({
      loading: false,
      error: '',
      canSend: data.canSend,
      blockedReason: data.blockedReason,
      direct: data.groupType === 'DIRECT',
    });
    if (data.peer) onPeerRef.current?.(data.peer);
  }, []);

  const loadLatest = useCallback(async () => {
    try {
      const { data } = await api.get(url, { timeout: LOAD_TIMEOUT_MS });
      stickToBottom.current = true;
      setUnseen(0);
      setMessages(data.messages.map(stamp));
      setHasMore(data.hasMore);
      applyHeader(data);
      dropSaved(data.messages);
      loaded.current = true;
      markRead();
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorText(err) }));
    }
  }, [url, applyHeader, dropSaved, markRead]);

  useEffect(() => {
    loadLatest();
    return () => clearTimeout(readTimer.current);
  }, [loadLatest]);

  // After a lost connection (or a role switch, or the socket connecting after the first load): what was missed.
  // Never replaces the chat with an error: on failure it tries again later (2 s, 4 s … 30 s) while showing a note.
  const catchUp = useCallback(async () => {
    if (!loaded.current) return;
    clearTimeout(catchUpTimer.current);
    try {
      const list = messagesRef.current;
      const lastId = list.at(-1)?.messageId ?? 0;
      const { data: latest } = await api.get(url, { timeout: LOAD_TIMEOUT_MS });
      let missed = [];
      let reset = false;
      // A gap between what is shown and the latest page: the messages in between, or the latest page alone.
      if (list.length && latest.messages.length && latest.messages[0].messageId > lastId + 1 && latest.hasMore) {
        const { data: after } = await api.get(url, {
          params: { after: lastId, limit: CATCH_UP_MAX },
          timeout: LOAD_TIMEOUT_MS,
        });
        if (after.hasMore) reset = true;
        else missed = after.messages;
      }
      if (!alive.current) return;
      const page = latest.messages.map(stamp);
      const fresh = [...missed, ...latest.messages].filter((m) => m.messageId > lastId);
      const near = nearBottom();
      stickToBottom.current = reset || near;
      if (reset) {
        setMessages(page);
        setHasMore(latest.hasMore);
        setUnseen(0);
      } else {
        setMessages((cur) => mergeLatest(mergeMessages(cur, missed.map(stamp)), page));
        const fromOthers = fresh.filter((m) => m.senderId !== me).length;
        if (!near && fromOthers) setUnseen((n) => n + fromOthers);
      }
      applyHeader(latest);
      dropSaved(fresh);
      if (fresh.some((m) => m.senderId !== me)) markRead();
      setSyncError(false);
      catchUpDelay.current = 2000;
    } catch {
      if (!alive.current) return;
      setSyncError(true);
      catchUpTimer.current = setTimeout(() => catchUp(), catchUpDelay.current);
      catchUpDelay.current = Math.min(catchUpDelay.current * 2, 30_000);
    }
  }, [url, me, nearBottom, applyHeader, dropSaved, markRead]);

  // A message deleted for everyone: only the placeholder is left, and quotes of it no longer show its text.
  const markDeleted = useCallback((messageId) => {
    setMessages((list) =>
      list.map((m) => {
        if (m.messageId === messageId) return { ...m, isDeleted: true, content: null, reactions: [], replyTo: null };
        if (m.replyTo?.messageId === messageId) return { ...m, replyTo: { state: 'DELETED', messageId } };
        return m;
      }),
    );
    setReplyTo((r) => (r?.messageId === messageId ? null : r));
  }, []);

  // A message deleted for me: gone from this view, in quotes too.
  const removeFromView = useCallback((messageId) => {
    setMessages((list) =>
      list
        .filter((m) => m.messageId !== messageId)
        .map((m) => (m.replyTo?.messageId === messageId ? { ...m, replyTo: { state: 'HIDDEN', messageId } } : m)),
    );
    setReplyTo((r) => (r?.messageId === messageId ? null : r));
  }, []);

  // ---- real time ------------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!socket) return undefined;
    const onNew = ({ groupId: gid, message }) => {
      if (gid !== id) return;
      // Sent from this tab: it replaces its outbox copy and the list goes down. From another tab or person: the list
      // goes down only when the end was already on screen.
      const ownHere = Boolean(message.clientMessageId) && outboxRef.current.some((m) => m.clientMessageId === message.clientMessageId);
      const near = nearBottom();
      stickToBottom.current = ownHere || near;
      setMessages((list) => mergeMessages(list, [stamp(message)]));
      if (ownHere) setOutbox((box) => box.filter((m) => m.clientMessageId !== message.clientMessageId));
      if (message.senderId !== me) {
        if (!near) setUnseen((n) => n + 1);
        markRead();
      }
    };
    const onReaction = ({ groupId: gid, messageId, reactions }) => {
      if (gid !== id) return;
      setMessages((list) => list.map((m) => (m.messageId === messageId ? { ...m, reactions } : m)));
    };
    const onDeleted = ({ groupId: gid, messageId }) => {
      if (gid !== id) return;
      markDeleted(messageId);
      markRead(); // seen here, as a new message would be: it does not stay unread in the list
    };
    const onHidden = ({ groupId: gid, messageId }) => {
      if (gid === id) removeFromView(messageId);
    };
    const onRead = ({ groupId: gid, userId, lastReadMessageId }) => {
      if (gid !== id) return;
      setMembers((list) => list.map((m) => (m.userId === userId ? { ...m, lastReadMessageId } : m)));
    };
    const onAccess = ({ groupId: gid }) => gid === id && catchUp();
    socket.on('message:new', onNew);
    socket.on('message:read', onRead);
    socket.on('message:reaction', onReaction);
    socket.on('message:deleted', onDeleted);
    socket.on('message:hidden', onHidden);
    socket.on('chat:access-changed', onAccess);
    socket.on('connect', catchUp);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:read', onRead);
      socket.off('message:reaction', onReaction);
      socket.off('message:deleted', onDeleted);
      socket.off('message:hidden', onHidden);
      socket.off('chat:access-changed', onAccess);
      socket.off('connect', catchUp);
    };
  }, [socket, id, me, nearBottom, markRead, catchUp, markDeleted, removeFromView]);

  // A click anywhere else closes the small popups.
  useEffect(() => {
    if (!menu && !emojiOpen) return undefined;
    const close = () => {
      setMenu(null);
      setEmojiOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menu, emojiOpen]);

  // Coming back to the tab counts as reading what arrived meanwhile – when the end of the chat is on screen.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && readOwed.current && markRead();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markRead]);

  useLayoutEffect(() => {
    const box = listRef.current;
    if (!box) return;
    if (prepend.current) {
      box.scrollTop = box.scrollHeight - prepend.current.height + prepend.current.top;
      prepend.current = null;
    } else if (stickToBottom.current) {
      box.scrollTop = box.scrollHeight;
    }
    if (jumpTo.current) {
      showMessage(jumpTo.current);
      jumpTo.current = null;
    }
  }, [messages, outbox]);

  function showMessage(messageId) {
    const row = document.getElementById(`msg-${messageId}`);
    const box = listRef.current;
    if (!row || !box) return false;
    stickToBottom.current = false;
    // Only the message list scrolls (scrollIntoView would move the whole page too).
    const middle = (box.clientHeight - row.offsetHeight) / 2;
    box.scrollTop += row.getBoundingClientRect().top - box.getBoundingClientRect().top - middle;
    row.classList.remove('msg-flash');
    void row.offsetWidth; // restart the highlight when the same message is shown twice
    row.classList.add('msg-flash');
    return true;
  }

  // Bấm vào trích dẫn: go to the original, loading the older messages up to it when it is not on screen.
  async function jump(messageId) {
    if (showMessage(messageId) || !messages.length) return;
    try {
      const { data } = await api.get(url, {
        params: { before: messages[0].messageId, from: messageId },
        timeout: LOAD_TIMEOUT_MS,
      });
      if (!data.messages.some((m) => m.messageId === messageId)) {
        toast(errorText({ code: 'MSG_MESSAGE_NOT_FOUND' }));
        return;
      }
      stickToBottom.current = false;
      jumpTo.current = messageId;
      setMessages((list) => mergeMessages(list, data.messages.map(stamp)));
      setHasMore(data.hasMore);
    } catch (err) {
      toast(errorText(err));
    }
  }

  // UC-111: choosing the reaction one already has removes it; another one replaces it. One request per message at a
  // time (quick clicks are ignored until the answer is back).
  async function react(message, code) {
    setMenu(null);
    if (reacting.current.has(message.messageId)) return;
    reacting.current.add(message.messageId);
    const mine = (message.reactions ?? []).find((r) => r.userIds.includes(me))?.code;
    const reactionUrl = `${url}/${message.messageId}/reaction`;
    try {
      const { data } = await (mine === code
        ? api.delete(reactionUrl, { timeout: SEND_TIMEOUT_MS })
        : api.put(reactionUrl, { code }, { timeout: SEND_TIMEOUT_MS }));
      setMessages((list) => list.map((m) => (m.messageId === message.messageId ? { ...m, reactions: data.reactions } : m)));
    } catch (err) {
      toast(errorText(err));
    } finally {
      reacting.current.delete(message.messageId);
    }
  }

  function startReply(message) {
    setMenu(null);
    setReplyTo(replyPart(message));
    inputRef.current?.focus();
  }

  // UC-113: only the choices open to this message right now.
  function startDelete(message) {
    setMenu(null);
    if (message.isDeleted) return; // already deleted for everyone: nothing left to delete
    const own = message.senderId === me && !message.isDeleted;
    const inTime = own && message.deleteUntil > Date.now();
    setDeleting({ message, forEveryone: inTime && state.canSend, expired: own && !inTime });
  }

  async function confirmDelete(scope) {
    const { messageId } = deleting.message;
    await api.delete(`${url}/${messageId}`, { params: { scope }, timeout: SEND_TIMEOUT_MS });
    if (scope === 'everyone') markDeleted(messageId);
    else removeFromView(messageId);
    setDeleting(null);
    toast(scope === 'everyone' ? 'Đã xoá tin nhắn ở phía mọi người.' : 'Đã xoá tin nhắn ở phía bạn.');
  }

  // UC-112: put the emoji where the cursor is.
  function insertEmoji(emoji) {
    const box = inputRef.current;
    const start = box?.selectionStart ?? text.length;
    const end = box?.selectionEnd ?? start;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  async function loadOlder() {
    if (!messages.length || olderLock.current) return;
    olderLock.current = true;
    setOlderLoading(true);
    try {
      const { data } = await api.get(url, { params: { before: messages[0].messageId }, timeout: LOAD_TIMEOUT_MS });
      const box = listRef.current;
      prepend.current = { height: box.scrollHeight, top: box.scrollTop };
      setMessages((list) => mergeMessages(list, data.messages.map(stamp)));
      setHasMore(data.hasMore);
    } catch (err) {
      toast(errorText(err));
    } finally {
      olderLock.current = false;
      setOlderLoading(false);
    }
  }

  // ---- sending --------------------------------------------------------------------------------------------------
  // One message on its way (the queue keeps them in the order they were written).
  async function deliver(item) {
    try {
      const { data: message } = await api.post(
        url,
        {
          ...(item.content ? { content: item.content } : {}),
          ...(item.files.length ? { attachments: item.files } : {}),
          ...(item.replyTo ? { replyToMessageId: item.replyTo.messageId } : {}),
          clientMessageId: item.clientMessageId,
        },
        { timeout: SEND_TIMEOUT_MS },
      );
      if (!alive.current) return; // the draft keeps it as "maybe sent"; the next load clears it (dropSaved)
      stickToBottom.current = true;
      setMessages((list) => mergeMessages(list, [stamp(message)]));
      setOutbox((box) => box.filter((m) => m.clientMessageId !== item.clientMessageId));
    } catch (err) {
      if (!alive.current) return;
      const failure = sendFailure(err);
      setOutbox((box) =>
        box.map((m) =>
          m.clientMessageId === item.clientMessageId
            ? { ...m, status: 'failed', ...failure, replyTo: err.code === 'MSG_REPLY_INVALID' ? null : m.replyTo }
            : m,
        ),
      );
      if (BLOCKED_BY_CODE[err.code]) {
        setState((s) => ({ ...s, canSend: false, blockedReason: BLOCKED_BY_CODE[err.code] }));
      }
    }
  }

  function enqueue(item) {
    sendQueue.current = sendQueue.current.then(() => deliver(item));
  }

  function send() {
    const content = text.normalize('NFC').trim();
    const files = [...draftFiles, ...uploads.uploaded];
    if (sendLock.current || (!content && !files.length) || !state.canSend) return;
    if (uploads.busy) {
      toast('Đang tải tệp lên. Vui lòng chờ tải xong rồi gửi.');
      return;
    }
    if (content.length > MESSAGE_MAX) {
      toast(errorText({ code: 'MSG_MESSAGE_TOO_LONG', details: { max: MESSAGE_MAX } }));
      return;
    }
    // Two Enter presses (or clicks) handled before React has emptied the box send one message.
    sendLock.current = true;
    setTimeout(() => {
      sendLock.current = false;
    }, 0);
    const item = { clientMessageId: newClientId(), content, files, replyTo, status: 'sending' };
    setOutbox((box) => [...box, item]);
    setText('');
    setReplyTo(null);
    setDraftFiles([]);
    uploads.items.forEach((i) => uploads.remove(i.id)); // in the message now (failed uploads are dropped too)
    stickToBottom.current = true;
    setUnseen(0);
    enqueue(item);
    inputRef.current?.focus();
  }

  function retry(clientMessageId) {
    const item = outbox.find((m) => m.clientMessageId === clientMessageId);
    if (!item || item.status === 'sending' || !state.canSend) return;
    const again = { ...item, status: 'sending', error: '' };
    setOutbox((box) => box.map((m) => (m.clientMessageId === clientMessageId ? again : m)));
    enqueue(again);
  }

  // "Sửa": an unsent message goes back into the box to be changed (only when the box is empty, nothing is lost).
  function editUnsent(clientMessageId) {
    const item = outbox.find((m) => m.clientMessageId === clientMessageId);
    if (!item) return;
    if (text.trim() || draftFiles.length || uploads.items.length) {
      toast('Hãy gửi hoặc xoá nội dung đang soạn trước.');
      return;
    }
    setOutbox((box) => box.filter((m) => m.clientMessageId !== clientMessageId));
    setText(item.content);
    setDraftFiles(item.files);
    setReplyTo(item.replyTo);
    inputRef.current?.focus();
  }

  const dropUnsent = (clientMessageId) => setOutbox((box) => box.filter((m) => m.clientMessageId !== clientMessageId));

  function onKeyDown(e) {
    // Enter sends, Shift+Enter starts a new line; never while a Vietnamese input method is still composing.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  // One line tall like the "Gửi" button; grows with the text up to about six lines, then scrolls.
  useLayoutEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = '0px';
    const needed = box.scrollHeight + 2; // + top and bottom border (border-box)
    box.style.height = `${Math.min(Math.max(needed, INPUT_MIN_PX), INPUT_MAX_PX)}px`;
    box.style.overflowY = needed > INPUT_MAX_PX ? 'auto' : 'hidden';
  }, [text, state.loading]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);
  const nameOf = (userId) => {
    const member = memberById.get(userId);
    return member ? member.nickname || member.fullName : 'Thành viên cũ';
  };

  // "Seen by" under the last message: members other than its sender (and me) who had joined before it was sent
  // and have read up to it. Not while a message of mine is still in the outbox (it would sit under that one).
  const last = messages.at(-1);
  const seenBy = last
    ? members.filter(
        (m) =>
          m.userId !== last.senderId &&
          m.userId !== me &&
          m.joinedAfterMessageId < last.messageId &&
          m.lastReadMessageId >= last.messageId,
      )
    : [];

  if (state.loading) return <p className="loading chat-list-note">Đang tải tin nhắn…</p>;
  if (state.error) {
    return (
      <div className="chat-empty">
        <p className="form-error">{state.error}</p>
        <button type="button" className="btn btn-secondary" onClick={loadLatest}>
          Thử lại
        </button>
      </div>
    );
  }

  const trimmedLength = text.trim().length;
  const tooLong = trimmedLength > MESSAGE_MAX;
  const nothingToSend = !text.trim() && !draftFiles.length && !uploads.uploaded.length;

  return (
    <>
      <ConnectionBar status={socket ? socketStatus : 'connected'} syncError={syncError} />
      <div className="chat-messages-wrap">
        <div className="chat-messages" ref={listRef} onScroll={onScroll}>
          {!messages.length && !outbox.length ? (
            <div className="chat-empty">
              <span className="gd-pending-icon" aria-hidden="true">
                <Icon name="forum" />
              </span>
              <p className="muted">Chưa có tin nhắn nào{state.canSend ? '. Hãy gửi lời chào đầu tiên.' : '.'}</p>
            </div>
          ) : (
            <ol className="msg-list" aria-label="Tin nhắn">
              <li className="msg-top">
                {hasMore ? (
                  <button type="button" className="btn btn-tertiary" onClick={loadOlder} disabled={olderLoading}>
                    {olderLoading ? 'Đang tải…' : 'Xem tin nhắn cũ hơn'}
                  </button>
                ) : (
                  <span className="caption muted">Tin nhắn từ khi bạn vào nhóm</span>
                )}
              </li>
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const newDay = !prev || dayOf(prev.sentAt) !== dayOf(m.sentAt);
                const firstOfRun = newDay || prev.senderId !== m.senderId || prev.type === 'SYSTEM';
                const member = memberById.get(m.senderId);
                return (
                  <MessageRow
                    key={m.messageId}
                    message={m}
                    me={me}
                    newDay={newDay}
                    firstOfRun={firstOfRun}
                    label={memberLabel(member)}
                    direct={state.direct}
                    canAct={state.canSend}
                    menu={menu}
                    nameOf={nameOf}
                    onMenu={setMenu}
                    onReact={react}
                    onReply={startReply}
                    onDelete={startDelete}
                    onJump={jump}
                    onFilesExpired={refreshFiles}
                  />
                );
              })}
              {last && !outbox.length && (seenBy.length > 0 || last.senderId === me) && (
                <li className={`msg-seen caption muted${last.senderId === me ? ' mine' : ''}`}>
                  {!seenBy.length ? 'Đã gửi' : state.direct ? <><Icon name="done_all" size="sm" /> Đã xem</> : <SeenBy people={seenBy} />}
                </li>
              )}
              {outbox.map((m) => (
                <OutboxRow
                  key={m.clientMessageId}
                  message={m}
                  me={me}
                  canSend={state.canSend}
                  onRetry={retry}
                  onEdit={editUnsent}
                  onDrop={dropUnsent}
                />
              ))}
            </ol>
          )}
        </div>
        {unseen > 0 && (
          <button type="button" className="chat-new-pill" onClick={scrollDown}>
            <Icon name="arrow_downward" size="sm" />
            {unseen === 1 ? '1 tin nhắn mới' : `${unseen > 99 ? '99+' : unseen} tin nhắn mới`}
          </button>
        )}
      </div>
      {replyTo && (
        <div className="chat-reply-bar">
          <span className="chat-reply-text">
            <strong>
              Đang trả lời {replyTo.senderId === me ? 'chính bạn' : replyTo.senderNickname || replyTo.senderName}
            </strong>
            <span className="caption muted">{replyTo.content || filesText(replyTo.attachments?.length)}</span>
          </span>
          <button type="button" className="btn btn-icon" onClick={() => setReplyTo(null)} aria-label="Huỷ trả lời">
            <Icon name="close" size="sm" />
          </button>
        </div>
      )}
      {(draftFiles.length > 0 || uploads.items.length > 0) && (
        <ul className="chat-files" aria-label="Tệp sẽ gửi kèm">
          {draftFiles.map((f) => (
            <li key={f.storageKey} className="chat-file is-done" title={f.fileName}>
              <span className="chat-file-thumb">
                <Icon name={fileIcon(f.mimeType)} />
              </span>
              <span className="chat-file-name caption">{f.fileName}</span>
              <button
                type="button"
                className="btn btn-icon"
                onClick={() => setDraftFiles((list) => list.filter((x) => x.storageKey !== f.storageKey))}
                aria-label={`Gỡ ${f.fileName}`}
                title="Gỡ tệp"
              >
                <Icon name="close" size="sm" />
              </button>
            </li>
          ))}
          {uploads.items.map((item) => (
            <li key={item.id} className={`chat-file is-${item.status}`} title={item.error || item.name}>
              <span className="chat-file-thumb">
                {item.previewUrl ? <img src={item.previewUrl} alt="" /> : <Icon name={fileIcon(item.mimeType)} />}
                {(item.status === 'uploading' || item.status === 'compressing' || item.status === 'waiting') && (
                  <span className="chat-file-progress" aria-hidden="true">
                    {item.status === 'uploading' ? `${Math.round((item.progress ?? 0) * 100)}%` : '…'}
                  </span>
                )}
              </span>
              <span className="chat-file-name caption">{item.status === 'error' ? item.error : item.name}</span>
              {item.status === 'error' && item.retryable && (
                <button type="button" className="btn btn-icon" onClick={() => uploads.retry(item.id)} aria-label={`Thử lại ${item.name}`}>
                  <Icon name="refresh" size="sm" />
                </button>
              )}
              <button type="button" className="btn btn-icon" onClick={() => uploads.remove(item.id)} aria-label={`Gỡ ${item.name}`} title="Gỡ tệp">
                <Icon name="close" size="sm" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="chat-emoji">
          <button
            type="button"
            className="btn btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              setEmojiOpen((v) => !v);
            }}
            disabled={!state.canSend}
            aria-label="Chọn biểu tượng"
            title="Chọn biểu tượng"
          >
            <Icon name="mood" />
          </button>
          {emojiOpen && <EmojiPicker onPick={insertEmoji} />}
        </div>
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => fileInput.current?.click()}
          disabled={
            !state.canSend || !fileLimits || draftFiles.length + uploads.items.length >= (fileLimits?.maxFiles ?? 0)
          }
          aria-label="Gửi tệp"
          title={
            fileLimits
              ? `Gửi ảnh, video hoặc tài liệu (ảnh, tài liệu tối đa ${fileLimits.maxFileMb} MB; video tối đa ${fileLimits.maxVideoMb} MB)`
              : 'Gửi tệp'
          }
        >
          <Icon name="attach_file" />
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          accept={fileLimits?.types.flatMap((t) => [t.mimeType, ...t.extensions]).join(',') ?? ''}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <textarea
          ref={inputRef}
          className="input chat-input"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={state.canSend ? 'Nhập tin nhắn…' : BLOCKED_TEXT[state.blockedReason] ?? BLOCKED_TEXT.READ_ONLY}
          disabled={!state.canSend}
          aria-label="Nhập tin nhắn"
          aria-invalid={tooLong || undefined}
        />
        {trimmedLength > MESSAGE_MAX - 200 && (
          <span className={`caption chat-count${tooLong ? ' over' : ''}`} aria-live="polite">
            {trimmedLength}/{MESSAGE_MAX}
          </span>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!state.canSend || uploads.busy || nothingToSend || tooLong}
          title={uploads.busy ? 'Đang tải tệp lên…' : tooLong ? `Tin nhắn có tối đa ${MESSAGE_MAX} ký tự` : undefined}
        >
          <Icon name="send" size="sm" />
          Gửi
        </button>
      </form>
      {deleting && (
        <DeleteMessageDialog
          forEveryone={deleting.forEveryone}
          expired={deleting.expired}
          onDelete={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

// "Mất kết nối…" after 3 s without the socket (short drops do not flash), "Đã kết nối lại" for 2 s after it comes back.
const LOST_AFTER_MS = 3000;
const BACK_FOR_MS = 2000;
function ConnectionBar({ status, syncError }) {
  const [shown, setShown] = useState(null); // null | 'lost' | 'back'
  const wasLost = useRef(false);
  useEffect(() => {
    if (status === 'connected') {
      if (!wasLost.current) return undefined;
      wasLost.current = false;
      setShown('back');
      const timer = setTimeout(() => setShown(null), BACK_FOR_MS);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      wasLost.current = true;
      setShown('lost');
    }, LOST_AFTER_MS);
    return () => clearTimeout(timer);
  }, [status]);

  if (shown === 'lost') {
    return (
      <p className="chat-conn is-lost" role="status">
        <Icon name="wifi_off" size="sm" />
        Mất kết nối. Đang thử kết nối lại… Tin nhắn mới sẽ hiện khi có kết nối.
      </p>
    );
  }
  if (syncError) {
    return (
      <p className="chat-conn is-lost" role="status">
        <Icon name="sync_problem" size="sm" />
        Chưa tải được tin nhắn mới. Đang thử lại…
      </p>
    );
  }
  if (shown === 'back') {
    return (
      <p className="chat-conn is-back" role="status">
        <Icon name="wifi" size="sm" />
        Đã kết nối lại
      </p>
    );
  }
  return null;
}

function SeenBy({ people }) {
  const names = people.slice(0, SEEN_NAMES).map((p) => p.nickname || p.fullName);
  const rest = people.length - names.length;
  return (
    <span title={people.map((p) => p.fullName).join(', ')}>
      <Icon name="done_all" size="sm" /> Đã xem: {names.join(', ')}
      {rest > 0 && ` và ${rest} người khác`}
    </span>
  );
}
