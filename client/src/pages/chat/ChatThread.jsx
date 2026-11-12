import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { UPLOAD_TARGETS } from '../../api/uploads.js';
import { fileIcon, useAttachmentUploads } from '../../components/AttachmentPicker.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { MEMBER_KIND_LABELS } from '../groups/groupLabels.js';
import { memberSubline } from '../groups/memberText.js';
import { dayOf, filesText } from './chatText.js';
import DeleteMessageDialog from './DeleteMessageDialog.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import MessageRow from './MessageRow.jsx';

// UC-47 Chat in Group (FE-06, Khanh) – SCR-43 Group Chat / SCR-50 Chat Room: the messages of one group and the
// composer. The server decides who may read or send (active role, data scope, read-only year) and sends only the
// messages since the user first joined the group (business-rules §6). New messages and read receipts arrive over the
// socket ("message:new", "message:read"); "seen by" compares message ids sent by the server, not times.
// UC-110 reply, UC-111 reactions, UC-112 emoji, UC-113 delete message: the composer holds the message being answered;
// reactions and deletions also arrive over the socket ("message:reaction", "message:deleted", "message:hidden").
// Files (12/11/2026): the 📎 button (or pasting a picture) uploads each file straight to storage with the shared FE-08
// upload queue (target 'message', images compressed first); "Gửi" waits until they are up. A message may be files
// only. Links live one hour: a picture that no longer loads asks for that message again (refreshFiles).
const MESSAGE_MAX = 2000; // same limit as the server (ASSUMPTION there, plan question Q5)
const SEEN_NAMES = 3;
const FILE_RETRY_MS = 15_000; // one new link per message at most this often

// Limits of the file button (count, sizes from system_settings, types): read once per page load, shared by every chat.
let limitsRequest = null;
function loadFileLimits() {
  limitsRequest ??= api.get('/conversations/attachment-limits').then((r) => r.data).catch((err) => {
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
};
const BLOCKED_BY_CODE = {
  MSG_GROUP_READ_ONLY: 'READ_ONLY',
  MSG_DIRECT_OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  MSG_DIRECT_LOCKED: 'LOCKED',
};

export default function ChatThread({ groupId, onPeer }) {
  const { user } = useAuth();
  const me = user?.id;
  const socket = useSocket();
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: '', canSend: false, blockedReason: null, direct: false });
  const onPeerRef = useRef(onPeer);
  onPeerRef.current = onPeer;
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // the message being answered
  const [menu, setMenu] = useState(null); // { id, kind: 'react' | 'who' } popup of one message
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [deleting, setDeleting] = useState(null); // { message, forEveryone, expired }
  const [fileLimits, setFileLimits] = useState(null);
  const fileInput = useRef(null);
  const fileRefresh = useRef(new Map()); // messageId -> last time new links were asked for
  const jumpTo = useRef(null); // message to scroll to once it is loaded
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stickToBottom = useRef(true);
  const prepend = useRef(null); // scroll position kept while older messages are added on top
  const readTimer = useRef(null);
  const id = Number(groupId);
  const uploads = useAttachmentUploads({ target: UPLOAD_TARGETS.MESSAGE, groupId: id, limits: fileLimits });

  useEffect(() => {
    let alive = true;
    loadFileLimits().then((limits) => alive && setFileLimits(limits)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function addFiles(list) {
    const notice = uploads.add(list);
    if (notice) toast(notice.replace('Mỗi bài', 'Mỗi tin nhắn'));
  }

  // A picture pasted into the message box is attached (text pastes as usual).
  function onPaste(e) {
    const pasted = [...(e.clipboardData?.files ?? [])];
    if (!pasted.length || !fileLimits || !state.canSend) return;
    e.preventDefault();
    addFiles(pasted);
  }

  // New links for the files of one message (the old ones expired): the page of exactly that message.
  const refreshFiles = useCallback(
    async (messageId) => {
      const last = fileRefresh.current.get(messageId) ?? 0;
      if (Date.now() - last < FILE_RETRY_MS) return;
      fileRefresh.current.set(messageId, Date.now());
      try {
        const { data } = await api.get(`/conversations/${id}/messages`, { params: { before: messageId + 1, limit: 1 } });
        const fresh = data.messages.find((m) => m.messageId === messageId);
        if (!fresh) return;
        setMessages((list) => list.map((m) => (m.messageId === messageId ? { ...m, attachments: fresh.attachments } : m)));
      } catch {
        // keep what is shown; the next reload brings new links
      }
    },
    [id],
  );

  // Tell the server the chat is read up to now – only while the tab is visible, at most once per second.
  const markRead = useCallback(() => {
    if (document.visibilityState !== 'visible' || readTimer.current) return;
    readTimer.current = setTimeout(() => {
      readTimer.current = null;
      api.post(`/conversations/${id}/read`).catch(() => {});
    }, 1000);
  }, [id]);

  const loadLatest = useCallback(async () => {
    try {
      const { data } = await api.get(`/conversations/${id}/messages`);
      stickToBottom.current = true;
      setMessages(data.messages.map(stamp));
      setMembers(data.members);
      setHasMore(data.hasMore);
      setState({
        loading: false,
        error: '',
        canSend: data.canSend,
        blockedReason: data.blockedReason,
        direct: data.groupType === 'DIRECT',
      });
      if (data.peer) onPeerRef.current?.(data.peer);
      markRead();
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorText(err) }));
    }
  }, [id, markRead]);

  useEffect(() => {
    loadLatest();
    return () => clearTimeout(readTimer.current);
  }, [loadLatest]);

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

  // Real time: new messages of this group, read receipts, and a reload after a lost connection comes back.
  useEffect(() => {
    if (!socket) return undefined;
    const onNew = ({ groupId: gid, message }) => {
      if (gid !== id) return;
      const box = listRef.current;
      stickToBottom.current =
        message.senderId === me || !box || box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_BOTTOM_PX;
      setMessages((list) => (list.some((m) => m.messageId === message.messageId) ? list : [...list, stamp(message)]));
      if (message.senderId !== me) markRead();
    };
    const onReaction = ({ groupId: gid, messageId, reactions }) => {
      if (gid !== id) return;
      setMessages((list) => list.map((m) => (m.messageId === messageId ? { ...m, reactions } : m)));
    };
    const onDeleted = ({ groupId: gid, messageId }) => {
      if (gid === id) markDeleted(messageId);
    };
    const onHidden = ({ groupId: gid, messageId }) => {
      if (gid === id) removeFromView(messageId);
    };
    const onRead = ({ groupId: gid, userId, lastReadMessageId }) => {
      if (gid !== id) return;
      setMembers((list) => list.map((m) => (m.userId === userId ? { ...m, lastReadMessageId } : m)));
    };
    socket.on('message:new', onNew);
    socket.on('message:read', onRead);
    socket.on('message:reaction', onReaction);
    socket.on('message:deleted', onDeleted);
    socket.on('message:hidden', onHidden);
    socket.io.on('reconnect', loadLatest);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:read', onRead);
      socket.off('message:reaction', onReaction);
      socket.off('message:deleted', onDeleted);
      socket.off('message:hidden', onHidden);
      socket.io.off('reconnect', loadLatest);
    };
  }, [socket, id, me, markRead, loadLatest, markDeleted, removeFromView]);

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

  // Coming back to the tab counts as reading what arrived meanwhile.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && markRead();
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
  }, [messages]);

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
      const { data } = await api.get(`/conversations/${id}/messages`, {
        params: { before: messages[0].messageId, from: messageId },
      });
      if (!data.messages.some((m) => m.messageId === messageId)) {
        toast(errorText({ code: 'MSG_MESSAGE_NOT_FOUND' }));
        return;
      }
      stickToBottom.current = false;
      jumpTo.current = messageId;
      setMessages((list) => [...data.messages.map(stamp), ...list]);
      setHasMore(data.hasMore);
    } catch (err) {
      toast(errorText(err));
    }
  }

  // UC-111: choosing the reaction one already has removes it; another one replaces it.
  async function react(message, code) {
    setMenu(null);
    const mine = (message.reactions ?? []).find((r) => r.userIds.includes(me))?.code;
    const url = `/conversations/${id}/messages/${message.messageId}/reaction`;
    try {
      const { data } = await (mine === code ? api.delete(url) : api.put(url, { code }));
      setMessages((list) => list.map((m) => (m.messageId === message.messageId ? { ...m, reactions: data.reactions } : m)));
    } catch (err) {
      toast(errorText(err));
    }
  }

  function startReply(message) {
    setMenu(null);
    setReplyTo(message);
    inputRef.current?.focus();
  }

  // UC-113: only the choices open to this message right now.
  function startDelete(message) {
    setMenu(null);
    const own = message.senderId === me && !message.isDeleted;
    const inTime = own && message.deleteUntil > Date.now();
    setDeleting({ message, forEveryone: inTime && state.canSend, expired: own && !inTime });
  }

  async function confirmDelete(scope) {
    const { messageId } = deleting.message;
    await api.delete(`/conversations/${id}/messages/${messageId}`, { params: { scope } });
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
    if (!messages.length || olderLoading) return;
    setOlderLoading(true);
    try {
      const { data } = await api.get(`/conversations/${id}/messages`, { params: { before: messages[0].messageId } });
      const box = listRef.current;
      prepend.current = { height: box.scrollHeight, top: box.scrollTop };
      setMessages((list) => [...data.messages.map(stamp), ...list]);
      setHasMore(data.hasMore);
    } catch (err) {
      toast(errorText(err));
    } finally {
      setOlderLoading(false);
    }
  }

  async function send() {
    const content = text.trim();
    const files = uploads.uploaded;
    if ((!content && !files.length) || sending) return;
    if (uploads.busy) {
      toast('Đang tải tệp lên. Vui lòng chờ tải xong rồi gửi.');
      return;
    }
    if (content.length > MESSAGE_MAX) {
      toast(errorText({ code: 'MSG_MESSAGE_TOO_LONG', details: { max: MESSAGE_MAX } }));
      return;
    }
    setSending(true);
    try {
      const { data: message } = await api.post(`/conversations/${id}/messages`, {
        ...(content ? { content } : {}),
        ...(files.length ? { attachments: files } : {}),
        ...(replyTo ? { replyToMessageId: replyTo.messageId } : {}),
      });
      uploads.items.forEach((item) => uploads.remove(item.id)); // sent (failed ones are dropped too)
      stickToBottom.current = true;
      setMessages((list) => (list.some((m) => m.messageId === message.messageId) ? list : [...list, stamp(message)]));
      setText('');
      setReplyTo(null);
    } catch (err) {
      toast(errorText(err));
      if (err.code === 'MSG_REPLY_INVALID') setReplyTo(null);
      if (BLOCKED_BY_CODE[err.code]) {
        setState((s) => ({ ...s, canSend: false, blockedReason: BLOCKED_BY_CODE[err.code] }));
      }
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

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
  }, [text]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);
  const nameOf = (userId) => {
    const member = memberById.get(userId);
    return member ? member.nickname || member.fullName : 'Thành viên cũ';
  };

  // "Seen by" under the last message: members other than its sender (and me) who had joined before it was sent
  // and have read up to it.
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

  return (
    <>
      <div className="chat-messages" ref={listRef}>
        {!messages.length ? (
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
              const firstOfRun = newDay || prev.senderId !== m.senderId;
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
            {last && (seenBy.length > 0 || last.senderId === me) && (
              <li className={`msg-seen caption muted${last.senderId === me ? ' mine' : ''}`}>
                {!seenBy.length ? 'Đã gửi' : state.direct ? <><Icon name="done_all" size="sm" /> Đã xem</> : <SeenBy people={seenBy} />}
              </li>
            )}
          </ol>
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
      {uploads.items.length > 0 && (
        <ul className="chat-files" aria-label="Tệp sẽ gửi kèm">
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
          disabled={!state.canSend || !fileLimits || uploads.items.length >= (fileLimits?.maxFiles ?? 0)}
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
        />
        {text.length > MESSAGE_MAX - 200 && (
          <span className={`caption chat-count${text.length > MESSAGE_MAX ? ' over' : ''}`}>
            {text.length}/{MESSAGE_MAX}
          </span>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!state.canSend || sending || uploads.busy || (!text.trim() && !uploads.uploaded.length)}
          title={uploads.busy ? 'Đang tải tệp lên…' : undefined}
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
