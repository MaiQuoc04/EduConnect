import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { MEMBER_KIND_LABELS } from '../groups/groupLabels.js';
import { memberSubline } from '../groups/memberText.js';
import { dayLabel, dayOf, timeOf } from './chatText.js';

// UC-47 Chat in Group (FE-06, Khanh) – SCR-43 Group Chat / SCR-50 Chat Room: the messages of one group and the
// composer. The server decides who may read or send (active role, data scope, read-only year) and sends only the
// messages since the user first joined the group (business-rules §6). New messages and read receipts arrive over the
// socket ("message:new", "message:read"); "seen by" compares message ids sent by the server, not times.
const MESSAGE_MAX = 2000; // same limit as the server (ASSUMPTION there, plan question Q5)
const SEEN_NAMES = 3;
const NEAR_BOTTOM_PX = 120;
const INPUT_MIN_PX = 36; // = .btn height
const INPUT_MAX_PX = 136; // about six lines of 20px


function memberLabel(member) {
  if (!member) return '';
  return memberSubline(member) || MEMBER_KIND_LABELS[member.kinds?.[0]] || '';
}

// UC-49 1-1 chats (groupType DIRECT): no sender names, "Đã xem" without names, and sending closes when the two are
// no longer in reach or the other account is locked (blockedReason). onPeer(peer) passes the other person's details
// (labels, contacts for teachers / School Manager) to the header.
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
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stickToBottom = useRef(true);
  const prepend = useRef(null); // scroll position kept while older messages are added on top
  const readTimer = useRef(null);
  const id = Number(groupId);

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
      setMessages(data.messages);
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

  // Real time: new messages of this group, read receipts, and a reload after a lost connection comes back.
  useEffect(() => {
    if (!socket) return undefined;
    const onNew = ({ groupId: gid, message }) => {
      if (gid !== id) return;
      const box = listRef.current;
      stickToBottom.current =
        message.senderId === me || !box || box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_BOTTOM_PX;
      setMessages((list) => (list.some((m) => m.messageId === message.messageId) ? list : [...list, message]));
      if (message.senderId !== me) markRead();
    };
    const onRead = ({ groupId: gid, userId, lastReadMessageId }) => {
      if (gid !== id) return;
      setMembers((list) => list.map((m) => (m.userId === userId ? { ...m, lastReadMessageId } : m)));
    };
    socket.on('message:new', onNew);
    socket.on('message:read', onRead);
    socket.io.on('reconnect', loadLatest);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:read', onRead);
      socket.io.off('reconnect', loadLatest);
    };
  }, [socket, id, me, markRead, loadLatest]);

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
  }, [messages]);

  async function loadOlder() {
    if (!messages.length || olderLoading) return;
    setOlderLoading(true);
    try {
      const { data } = await api.get(`/conversations/${id}/messages`, { params: { before: messages[0].messageId } });
      const box = listRef.current;
      prepend.current = { height: box.scrollHeight, top: box.scrollTop };
      setMessages((list) => [...data.messages, ...list]);
      setHasMore(data.hasMore);
    } catch (err) {
      toast(errorText(err));
    } finally {
      setOlderLoading(false);
    }
  }

  async function send() {
    const content = text.trim();
    if (!content || sending) return;
    if (content.length > MESSAGE_MAX) {
      toast(errorText({ code: 'MSG_MESSAGE_TOO_LONG', details: { max: MESSAGE_MAX } }));
      return;
    }
    setSending(true);
    try {
      const { data: message } = await api.post(`/conversations/${id}/messages`, { content });
      stickToBottom.current = true;
      setMessages((list) => (list.some((m) => m.messageId === message.messageId) ? list : [...list, message]));
      setText('');
    } catch (err) {
      toast(errorText(err));
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
              const mine = m.senderId === me;
              const firstOfRun = newDay || prev.senderId !== m.senderId;
              const member = memberById.get(m.senderId);
              return (
                <MessageRow
                  key={m.messageId}
                  message={m}
                  mine={mine}
                  newDay={newDay}
                  firstOfRun={firstOfRun}
                  label={memberLabel(member)}
                  direct={state.direct}
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
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={inputRef}
          className="input chat-input"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={state.canSend ? 'Nhập tin nhắn…' : BLOCKED_TEXT[state.blockedReason] ?? BLOCKED_TEXT.READ_ONLY}
          disabled={!state.canSend}
          aria-label="Nhập tin nhắn"
        />
        {text.length > MESSAGE_MAX - 200 && (
          <span className={`caption chat-count${text.length > MESSAGE_MAX ? ' over' : ''}`}>
            {text.length}/{MESSAGE_MAX}
          </span>
        )}
        <button type="submit" className="btn btn-primary" disabled={!state.canSend || sending || !text.trim()}>
          <Icon name="send" size="sm" />
          Gửi
        </button>
      </form>
    </>
  );
}

function MessageRow({ message: m, mine, newDay, firstOfRun, label, direct }) {
  const name = m.senderNickname ? `${m.senderNickname} (${m.senderName})` : m.senderName;
  return (
    <>
      {newDay && (
        <li className="msg-day">
          <span className="caption">{dayLabel(dayOf(m.sentAt))}</span>
        </li>
      )}
      <li className={`msg${mine ? ' mine' : ''}${firstOfRun ? ' first' : ''}`}>
        {!mine && !direct && (
          <span className="msg-avatar">{firstOfRun && <Avatar src={m.senderAvatarUrl} name={m.senderName} size={32} />}</span>
        )}
        <div className="msg-body">
          {!mine && !direct && firstOfRun && (
            <p className="msg-sender caption">
              <strong>{name}</strong>
              {label && <span className="muted"> · {label}</span>}
              {m.senderStatus === 'LOCKED' && <span className="pill msg-locked">Đã khoá</span>}
            </p>
          )}
          <div className="msg-bubble">
            <p className="msg-text">{m.content}</p>
            <time className="msg-time" dateTime={m.sentAt}>
              {timeOf(m.sentAt)}
            </time>
          </div>
        </div>
      </li>
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
