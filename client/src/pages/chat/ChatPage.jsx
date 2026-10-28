import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { fold } from '../subjects/subjectText.js';
import { GROUP_TYPE_HELP, GROUP_TYPE_ICONS, GROUP_TYPE_LABELS } from '../groups/groupLabels.js';

// "Trò chuyện" – split view: my groups on the left (~3/10), the chosen group's chat on the right (~7/10).
// ASSUMPTION: shell built in FE-04 (Khanh) from the UC-29 group list so "Trò chuyện" links have a home; FE-06
// Messaging (owner: Anh, SCR-43 Group Chat / SCR-50 Chat Room) replaces <ChatPending> with the real message list
// and composer, and adds 1-1 chats to the left list. Who may chat where is still checked by GET /groups/:id.
export default function ChatPage() {
  const { groupId } = useParams();
  const [list, setList] = useState({ loading: true, data: null, error: '' });
  const [query, setQuery] = useState('');

  useEffect(() => {
    api
      .get('/groups')
      .then(({ data }) => setList({ loading: false, data, error: '' }))
      .catch((err) => setList({ loading: false, data: null, error: errorText(err) }));
  }, []);

  // One section per class (its groups, then my teams), then the school-wide teacher group.
  const sections = useMemo(() => {
    const data = list.data;
    if (!data) return [];
    const q = fold(query.trim());
    const keep = (title) => !q || fold(title).includes(q);
    const result = data.classes.map((c) => ({
      key: `c${c.classId}`,
      title: `Lớp ${c.className}`,
      items: [
        ...c.groups.map((g) => ({ ...g, title: GROUP_TYPE_LABELS[g.groupType], sub: GROUP_TYPE_HELP[g.groupType] })),
        ...c.teams.map((t) => ({ ...t, title: t.groupName, sub: `Team · ${t.memberCount} thành viên` })),
      ].filter((i) => keep(`${c.className} ${i.title}`)),
    }));
    if (data.teacherGroup) {
      const g = data.teacherGroup;
      result.push({
        key: 'school',
        title: 'Toàn trường',
        items: [{ ...g, title: g.groupName, sub: `${g.memberCount} thành viên` }].filter((i) => keep(i.title)),
      });
    }
    return result.filter((s) => s.items.length);
  }, [list.data, query]);

  return (
    <div className={`chat-shell${groupId ? ' has-chat' : ''}`}>
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
                  {s.items.map((g) => (
                    <li key={g.groupId}>
                      <NavLink to={`/chat/${g.groupId}`} className="chat-item">
                        <span className={`gd-mini-icon type-${g.groupType.toLowerCase()}`} aria-hidden="true">
                          <Icon name={GROUP_TYPE_ICONS[g.groupType]} size="sm" />
                        </span>
                        <span className="chat-item-text">
                          <span className="chat-item-name">{g.title}</span>
                          <span className="caption muted">{g.sub}</span>
                        </span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </aside>

      <section className="chat-room" aria-label="Khung trò chuyện">
        {groupId ? (
          <ChatRoom key={groupId} groupId={groupId} />
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
  );
}

// Right pane: the chosen group's header, then the chat (FE-06).
function ChatRoom({ groupId }) {
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
        <Link to="/chat" className="btn btn-icon chat-back" aria-label="Về danh sách nhóm">
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
        <ChatPending readOnly={g.readOnly} />
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

// FE-06 (Anh): replace with the message list and composer.
function ChatPending({ readOnly }) {
  return (
    <>
      <div className="chat-messages">
        <div className="chat-empty">
          <span className="gd-pending-icon" aria-hidden="true">
            <Icon name="forum" />
          </span>
          <p className="muted">Tin nhắn của nhóm sẽ hiện ở đây.</p>
          <p className="stamp-soft">
            <Icon name="construction" size="sm" />
            Chức năng đang được phát triển
          </p>
        </div>
      </div>
      <div className="chat-composer">
        <input
          className="input"
          placeholder={readOnly ? 'Nhóm chỉ còn để xem lại' : 'Nhập tin nhắn…'}
          disabled
          aria-label="Nhập tin nhắn"
        />
        <button type="button" className="btn btn-primary" disabled>
          <Icon name="send" size="sm" />
          Gửi
        </button>
      </div>
    </>
  );
}
