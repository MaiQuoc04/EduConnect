import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { listGroupPosts } from '../../api/groupPosts.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { errorText } from '../../messages.js';
import ActivityFeedActions from '../extracurricular/ActivityFeedActions.jsx'; // FE-07 (Dung)
import { useLiveRefresh } from '../schoolfeed/useLiveRefresh.js';
import { feedPath, moderatorName, PostCard, useGroupFeedSignals, usePostActions } from './groupFeedShared.jsx';

// SCR-35 Group Feed – UC-36 View Group Feed, with UC-43 (like), UC-44..UC-46 (moderator) and UC-40 (delete) on each
// post. A tab of SCR-21 (GroupLayout); the group itself (g) comes from the layout. Tabs (business-rules §5):
//   Bảng tin   live posts, pinned first – everyone
//   Bài của tôi  the viewer's posts that are pending, rejected or hidden – shown when there are some
//   Chờ duyệt / Đã ẩn  the moderator's queues
// Real time: the group's signals re-read the shown list quietly (no skeleton), as FE-08 does.

const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50; // server limit; a quiet refresh re-reads at most this many posts
const SIGNAL_DELAY_MS = 300; // signals arriving together are read with one request

export default function GroupFeedPage() {
  const g = useOutletContext(); // FeedGuard already checked that this group has a feed the viewer may read
  return <Feed key={g.groupId} g={g} />;
}

function Feed({ g }) {
  const { user } = useAuth();
  const socket = useSocket();
  const [view, setView] = useState('feed');
  const [state, setState] = useState({ status: 'loading', data: null, items: [], error: '' });
  const [loadingMore, setLoadingMore] = useState(false);
  const shown = useRef({ view, count: 0 });
  const timer = useRef(null);

  useEffect(() => {
    shown.current = { view, count: state.items.length };
  });

  // First page of a view (view change, or "Thử lại").
  const load = useCallback(
    (nextView, { quiet = false } = {}) => {
      if (!quiet) setState((s) => ({ ...s, status: 'loading', error: '' }));
      const size = quiet ? Math.min(MAX_PAGE_SIZE, Math.max(PAGE_SIZE, shown.current.count)) : PAGE_SIZE;
      return listGroupPosts(g.groupId, { view: nextView, page: 1, pageSize: size })
        .then((data) => {
          if (shown.current.view !== nextView && quiet) return;
          setState({ status: 'ready', data, items: data.items, error: '' });
        })
        .catch((err) => {
          if (quiet) return; // keep what is shown; the next signal / reconnect tries again
          // A tab the viewer no longer has (e.g. no longer moderator): back to the feed.
          if (err.status === 403 && nextView !== 'feed') {
            setView('feed');
            return;
          }
          setState((s) => ({ ...s, status: 'error', error: errorText(err) }));
        });
    },
    [g.groupId],
  );

  useEffect(() => {
    load(view);
  }, [load, view]);

  const refresh = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(shown.current.view, { quiet: true }), SIGNAL_DELAY_MS);
  }, [load]);
  useEffect(() => () => clearTimeout(timer.current), []);

  useGroupFeedSignals(socket, g.groupId, refresh);
  useLiveRefresh(socket, refresh);

  async function loadMore() {
    const { data, items } = state;
    setLoadingMore(true);
    try {
      const page = Math.floor(items.length / PAGE_SIZE) + 1;
      const next = await listGroupPosts(g.groupId, { view, page, pageSize: PAGE_SIZE });
      const seen = new Set(items.map((p) => p.postId));
      setState((s) => ({
        ...s,
        data: { ...data, total: next.total, counts: next.counts },
        items: [...s.items, ...next.items.filter((p) => !seen.has(p.postId))],
      }));
    } catch {
      // the button stays; the reader can try again
    } finally {
      setLoadingMore(false);
    }
  }

  // After an action the list is read again: the post may leave this tab (approved, hidden, deleted…).
  const actions = usePostActions(() => load(view, { quiet: true }));

  const data = state.data;
  const info = data?.group;
  const counts = data?.counts ?? {};
  const tabs = [
    { view: 'feed', label: 'Bảng tin' },
    ...(counts.mine || view === 'mine' ? [{ view: 'mine', label: 'Bài của tôi', count: counts.mine }] : []),
    ...(info?.isModerator
      ? [
          { view: 'pending', label: 'Chờ duyệt', count: counts.pending },
          { view: 'hidden', label: 'Đã ẩn', count: counts.hidden },
        ]
      : []),
  ];
  const canPost = info ? info.canPost : !g.readOnly;
  const who = moderatorName(g.groupType);

  return (
    <div className="gf">
      {g.readOnly && (
        <div className="notice">
          <Icon name="history" />
          <p>Năm học của nhóm đã kết thúc nên bảng tin chỉ còn để xem lại.</p>
        </div>
      )}
      {info?.moderatorMissing && (
        <div className="notice amber">
          <Icon name="warning" />
          <p>Lớp học hiện chưa có GVCN phụ trách kiểm duyệt. Bài viết chờ duyệt có thể bị xử lý chậm.</p>
        </div>
      )}

      {canPost && (
        <Link to={`${feedPath(g.groupId)}/new`} className="card card-outline gf-composer-open">
          <Avatar src={user?.avatarUrl} name={user?.fullName ?? ''} size={36} />
          <span className="gf-composer-placeholder">Bạn muốn chia sẻ điều gì với nhóm?</span>
          <Icon name="edit_square" />
        </Link>
      )}
      <ActivityFeedActions group={g} info={info} />
      {canPost && info?.requireApproval && !info.isModerator && (
        <p className="caption muted gf-hint">
          <Icon name="verified" size="sm" />
          Nhóm đang bật duyệt bài: bài của bạn sẽ hiện sau khi {who} duyệt.
        </p>
      )}

      {tabs.length > 1 && (
        <div className="tabs gf-tabs" role="tablist" aria-label="Xem bài viết">
          {tabs.map((t) => (
            <button key={t.view} type="button" role="tab" aria-selected={view === t.view} onClick={() => setView(t.view)}>
              {t.label}
              {t.count > 0 && <span className="tab-count">{t.count}</span>}
            </button>
          ))}
        </div>
      )}

      {state.status === 'loading' && !data ? (
        <p className="loading">Đang tải bảng tin…</p>
      ) : state.status === 'error' ? (
        <div className="card card-outline gf-empty">
          <p className="form-error">{state.error}</p>
          <button type="button" className="btn btn-secondary" onClick={() => load(view)}>
            Thử lại
          </button>
        </div>
      ) : state.items.length === 0 ? (
        <div className="card card-outline gf-empty">
          <Icon name={view === 'feed' ? 'dynamic_feed' : 'inbox'} />
          <p className="muted">{EMPTY_TEXT[view]}</p>
        </div>
      ) : (
        <div className={`gf-list${state.status === 'loading' ? ' is-loading' : ''}`}>
          {view === 'feed' && info?.isModerator && counts.pinned >= info.maxPinned && (
            <p className="caption muted gf-hint">
              <Icon name="push_pin" size="sm" />
              Đã ghim {info.maxPinned} bài, mức tối đa của nhóm.
            </p>
          )}
          {state.items.map((post) => (
            <PostCard
              key={post.postId}
              post={post}
              groupId={g.groupId}
              groupType={g.groupType}
              onAction={actions.run}
              editState={{ from: 'feed' }}
            />
          ))}
          {state.items.length < data.total && (
            <button type="button" className="btn btn-secondary gf-load-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Đang tải…' : 'Xem thêm bài viết'}
            </button>
          )}
        </div>
      )}
      {actions.dialog}
    </div>
  );
}

const EMPTY_TEXT = {
  feed: 'Chưa có bài viết nào trên bảng tin của nhóm.',
  mine: 'Bạn không có bài nào đang chờ duyệt, bị từ chối hay bị ẩn.',
  pending: 'Không có bài nào chờ duyệt.',
  hidden: 'Không có bài nào bị ẩn.',
};
