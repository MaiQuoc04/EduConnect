import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { errorText } from '../../messages.js';
import { fold } from '../subjects/subjectText.js';
import { GROUP_TYPE_ICONS, GROUP_TYPE_LABELS } from '../groups/groupLabels.js';
import ChatThread from './ChatThread.jsx';
import { previewText, shortTime, unreadLabel } from './chatText.js';

// "Trò chuyện" – split view: my groups on the left (~3/10), the chosen group's chat on the right (~7/10).
// Shell built in FE-04 from the UC-29 group list; FE-06 Messaging (Khanh) fills the right pane with UC-47 Chat in
// Group (ChatThread.jsx, SCR-43 / SCR-50). UC-48 View Conversation List (SCR-49): under each chat's name its latest
// message (bold while unread, cut with "…") and the number of unread messages, from GET /conversations, kept up to
// date by the socket; opening a chat clears its count. 1-1 chats arrive with UC-49. The server checks who may chat.
// The School Manager sees no class chat (business-rules §2): the list keeps only the school-wide teacher group.
// Opened from a group or from "Nhóm của tôi", the router state { backTo, backLabel } (groupLabels.js) adds a
// "Quay lại" button at the top left; it is passed on while the user switches chats so the way back stays.
export default function ChatPage() {
  const { groupId } = useParams();
  const back = useLocation().state;
  const backState = back?.backTo ? back : undefined;
  const [list, setList] = useState({ loading: true, data: null, error: '' });
  const [query, setQuery] = useState('');
  const { activeRole, user } = useAuth();
  const me = user?.id;
  const manager = activeRole === 'SCHOOL_MANAGER';
  const socket = useSocket();
  // UC-48 summaries by groupId: { unreadCount, lastMessage }.
  const [summaries, setSummaries] = useState({});
  const openId = groupId ? Number(groupId) : null;
  const openRef = useRef(openId);
  openRef.current = openId;

  const loadGroups = useCallback(() => {
    api
      .get('/groups')
      .then(({ data }) => setList({ loading: false, data, error: '' }))
      .catch((err) => setList({ loading: false, data: null, error: errorText(err) }));
  }, []);
  const loadSummaries = useCallback(() => {
    api
      .get('/conversations')
      .then(({ data }) => setSummaries(Object.fromEntries(data.map((c) => [c.groupId, c]))))
      .catch(() => {}); // the list still works without previews
  }, []);

  useEffect(() => {
    loadGroups();
    loadSummaries();
  }, [loadGroups, loadSummaries]);

  // Opening a chat reads it (ChatThread tells the server); clear its count at once.
  useEffect(() => {
    if (openId === null) return;
    setSummaries((all) => (all[openId]?.unreadCount ? { ...all, [openId]: { ...all[openId], unreadCount: 0 } } : all));
  }, [openId]);

  // Real time: a new message becomes the preview and, unless it is mine or its chat is open, adds one unread.
  // My own read receipt (this or another tab) clears the count. A chat not in the list yet (e.g. a new team)
  // reloads both lists.
  useEffect(() => {
    if (!socket) return undefined;
    const onNew = ({ groupId: gid, message }) => {
      setSummaries((all) => {
        const cur = all[gid];
        if (!cur) {
          setTimeout(() => {
            loadGroups();
            loadSummaries();
          });
          return all;
        }
        const counts = message.senderId !== me && gid !== openRef.current;
        return { ...all, [gid]: { ...cur, lastMessage: message, unreadCount: cur.unreadCount + (counts ? 1 : 0) } };
      });
    };
    const onRead = ({ groupId: gid, userId }) => {
      if (userId !== me) return;
      setSummaries((all) => (all[gid]?.unreadCount ? { ...all, [gid]: { ...all[gid], unreadCount: 0 } } : all));
    };
    socket.on('message:new', onNew);
    socket.on('message:read', onRead);
    socket.io.on('reconnect', loadSummaries);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:read', onRead);
      socket.io.off('reconnect', loadSummaries);
    };
  }, [socket, me, loadGroups, loadSummaries]);

  // One section per class (its groups, then my teams), then the school-wide teacher group.
  const sections = useMemo(() => {
    const data = list.data;
    if (!data) return [];
    const q = fold(query.trim());
    const keep = (title) => !q || fold(title).includes(q);
    const result = (manager ? [] : data.classes).map((c) => ({
      key: `c${c.classId}`,
      title: `Lớp ${c.className}`,
      items: [
        ...c.groups.map((g) => ({ ...g, title: GROUP_TYPE_LABELS[g.groupType] })),
        ...c.teams.map((t) => ({ ...t, title: t.groupName })),
      ].filter((i) => keep(`${c.className} ${i.title}`)),
    }));
    if (data.teacherGroup) {
      const g = data.teacherGroup;
      result.push({
        key: 'school',
        title: 'Toàn trường',
        items: [{ ...g, title: g.groupName }].filter((i) => keep(i.title)),
      });
    }
    return result.filter((s) => s.items.length);
  }, [list.data, query, manager]);

  return (
    <>
      {backState && (
        <div className="chat-topbar">
          <Link to={backState.backTo} className="btn btn-tertiary chat-return">
            <Icon name="arrow_back" size="sm" />
            Quay lại {backState.backLabel}
          </Link>
        </div>
      )}
      <div className={`chat-shell${groupId ? ' has-chat' : ''}${backState ? ' has-topbar' : ''}`}>
        <aside className="chat-list" aria-label="Danh sách nhóm trò chuyện">
          <div className="chat-list-head">
            <h1 className="title-md">Trò chuyện</h1>
            <div className="input-wrap subject-search">
              <Icon name="search" size="sm" className="subject-search-icon" />
              <input
                className="input"
                type="search"
                placeholder="Tìm nhóm…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Tìm nhóm"
              />
            </div>
          </div>
          <div className="chat-list-body">
            {list.error ? (
              <p className="form-error chat-list-note">{list.error}</p>
            ) : list.loading ? (
              <p className="loading chat-list-note">Đang tải nhóm…</p>
            ) : !sections.length ? (
              <p className="muted chat-list-note">{query ? 'Không tìm thấy nhóm phù hợp.' : 'Bạn chưa thuộc nhóm nào.'}</p>
            ) : (
              sections.map((s) => (
                <section key={s.key} className="chat-section">
                  <h2 className="label-upper chat-section-title">{s.title}</h2>
                  <ul>
                    {s.items.map((g) => {
                      const summary = summaries[g.groupId];
                      const last = summary?.lastMessage ?? null;
                      const unread = summary?.unreadCount ?? 0;
                      return (
                        <li key={g.groupId}>
                          <NavLink
                            to={`/chat/${g.groupId}`}
                            state={backState}
                            className={`chat-item${unread ? ' has-unread' : ''}`}
                          >
                            <span className={`gd-mini-icon type-${g.groupType.toLowerCase()}`} aria-hidden="true">
                              <Icon name={GROUP_TYPE_ICONS[g.groupType]} size="sm" />
                            </span>
                            <span className="chat-item-text">
                              <span className="chat-item-row">
                                <span className="chat-item-name">{g.title}</span>
                                {last && <span className="caption chat-item-time">{shortTime(last.sentAt)}</span>}
                              </span>
                              <span className="chat-item-row">
                                <span className={`caption chat-item-last${unread ? ' unread' : ''}`}>
                                  {previewText(last, me)}
                                </span>
                                {unread > 0 && (
                                  <span className="chat-badge" aria-label={`${unread} tin nhắn chưa đọc`}>
                                    {unreadLabel(unread)}
                                  </span>
                                )}
                              </span>
                            </span>
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>
        </aside>

        <section className="chat-room" aria-label="Khung trò chuyện">
          {groupId ? (
            <ChatRoom key={groupId} groupId={groupId} backState={backState} />
          ) : (
            <div className="chat-empty">
              <span className="gd-pending-icon" aria-hidden="true">
                <Icon name="forum" />
              </span>
              <h2 className="title-md">Chọn một nhóm để trò chuyện</h2>
              <p className="muted">Các nhóm lớp và team của bạn nằm ở cột bên trái.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

// Right pane: the chosen group's header, then the chat (FE-06).
function ChatRoom({ groupId, backState }) {
  const [state, setState] = useState({ loading: true, group: null, error: '' });

  useEffect(() => {
    api
      .get(`/groups/${groupId}`)
      .then(({ data }) => setState({ loading: false, group: data, error: '' }))
      .catch((err) => setState({ loading: false, group: null, error: errorText(err) }));
  }, [groupId]);

  const g = state.group;
  if (state.loading) return <p className="loading chat-list-note">Đang tải nhóm…</p>;
  if (state.error) return <p className="form-error chat-list-note">{state.error}</p>;

  const team = g.groupType === 'TEAM_CHAT';
  const title = g.class && !team ? `${g.class.className} – ${GROUP_TYPE_LABELS[g.groupType]}` : g.groupName;

  return (
    <>
      <header className="chat-room-head">
        <Link to="/chat" state={backState} className="btn btn-icon chat-back" aria-label="Về danh sách nhóm">
          <Icon name="arrow_back" />
        </Link>
        <span className={`gd-mini-icon type-${g.groupType.toLowerCase()}`} aria-hidden="true">
          <Icon name={GROUP_TYPE_ICONS[g.groupType]} size="sm" />
        </span>
        <div className="chat-room-title">
          <h2 className="title-sm">{title}</h2>
          <p className="caption muted">
            {g.counts.total} thành viên
            {team && g.class && ` · Lớp ${g.class.className}`}
            {g.readOnly && ' · Chỉ xem'}
          </p>
        </div>
        <Link to={`/groups/${g.groupId}`} className="btn btn-secondary chat-info">
          <Icon name="info" size="sm" />
          Thông tin nhóm
        </Link>
      </header>
      {g.canSeeContent ? (
        <ChatThread groupId={g.groupId} />
      ) : (
        <div className="chat-empty">
          <span className="gd-pending-icon" aria-hidden="true">
            <Icon name="lock" />
          </span>
          <p className="muted">Quản lý trường không xem tin nhắn của nhóm lớp.</p>
        </div>
      )}
    </>
  );
}
