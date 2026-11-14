import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { listGroupPosts } from '../../api/groupPosts.js';
import Avatar from '../../components/Avatar.jsx';
import {
  FeedEmpty,
  FeedError,
  FeedPager,
  FeedPanel,
  FeedSkeleton,
  FeedTabs,
  NewContentPill,
  useNewContent,
} from '../../components/feed/Feed.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { errorText } from '../../messages.js';
import { formatDateTime } from '../schoolfeed/schoolFeedShared.jsx';
import { useLiveRefresh } from '../schoolfeed/useLiveRefresh.js';
import {
  feedPath,
  moderatorName,
  PostCard,
  postPath,
  useGroupFeedSignals,
  usePostActions,
} from './groupFeedShared.jsx';
import { readDraft } from './postDraft.js';

// SCR-35 Group Feed – UC-36 View Group Feed, with UC-43 (like), UC-44..UC-46 (moderator) and UC-40 (delete) on each
// post. A tab of SCR-21 (GroupLayout); the group itself (g) comes from the layout. Tabs (business-rules §5):
//   Bảng tin   live posts, pinned first – everyone
//   Bài của tôi  the viewer's posts that are pending, rejected or hidden – shown when there are some
//   Chờ duyệt / Đã ẩn  the moderator's queues
// Layout and behaviour as the school feed (14/11/2026, shared components/feed): underline tabs, one page at a time
// with the pager, the "Có nội dung mới — Tải lại" pill instead of changing the list under the reader, and a right-hand
// column (pinned posts, approval).

// ASSUMPTION: 10 posts per page, as the school feed.
const PAGE_SIZE = 10;

const TAB_NOUN = { feed: 'bài viết', mine: 'bài của bạn', pending: 'bài chờ duyệt', hidden: 'bài đã ẩn' };
const EMPTY_TEXT = {
  feed: 'Chưa có bài viết nào trên bảng tin của nhóm.',
  mine: 'Bạn không có bài nào đang chờ duyệt, bị từ chối hay bị ẩn.',
  pending: 'Không có bài nào chờ duyệt.',
  hidden: 'Không có bài nào bị ẩn.',
};

// What the reader would notice on the page: which posts, in which order and state (not the like / comment counts).
const signature = (data) =>
  `${data.total}|${data.items
    .map((p) => `${p.postId}:${p.isPinned ? 1 : 0}:${p.isHidden ? 1 : 0}:${p.approvalStatus}:${p.updatedAt ?? ''}:${p.createdAt}`)
    .join(',')}`;

export default function GroupFeedPage() {
  const g = useOutletContext(); // FeedGuard already checked that this group has a feed the viewer may read
  return <Feed key={g.groupId} g={g} />;
}

function Feed({ g }) {
  const { user } = useAuth();
  const [draft] = useState(() => readDraft(user?.id, g.groupId)); // read when the feed opens
  const socket = useSocket();
  const [view, setView] = useState('feed');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const listTop = useRef(null);

  // One page of one tab; a newer request always wins (the older one is cancelled).
  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    listGroupPosts(g.groupId, { view, page, pageSize: PAGE_SIZE }, { signal: controller.signal })
      .then((data) => setState({ loading: false, data, error: '' }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        // A tab the viewer no longer has (e.g. no longer moderator): back to the feed.
        if (err.status === 403 && view !== 'feed') {
          setView('feed');
          setPage(1);
          return;
        }
        setState({ loading: false, data: null, error: errorText(err) });
      });
    return () => controller.abort();
  }, [g.groupId, view, page, reloadKey]);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);
  const openTab = (next) => {
    setView(next);
    setPage(1);
  };

  // Real time: a signal never changes the list under the reader; when the same page reads differently, the pill shows.
  const latest = useRef({ view, page, state });
  useEffect(() => {
    latest.current = { view, page, state };
  });
  const { hasNew, schedule, dismiss } = useNewContent(async () => {
    const { view: v, page: p, state: s } = latest.current;
    if (!s.data || s.loading) return false; // a load is on its way and will be fresh
    const fresh = await listGroupPosts(g.groupId, { view: v, page: p, pageSize: PAGE_SIZE });
    return latest.current.state === s && signature(fresh) !== signature(s.data);
  }, state.data);
  useGroupFeedSignals(socket, g.groupId, () => schedule());
  useLiveRefresh(socket, () => schedule(0));

  function showNew() {
    dismiss();
    reload();
    if (listTop.current && listTop.current.getBoundingClientRect().top < 0) {
      listTop.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  // After the viewer's own action the page is read again at once (the post may leave this tab: approved, hidden…).
  const actions = usePostActions(reload);

  const data = state.data;
  const info = data?.group;
  const counts = data?.counts ?? {};
  const tabs = [
    { key: 'feed', label: 'Bảng tin' },
    ...(counts.mine || view === 'mine' ? [{ key: 'mine', label: 'Bài của tôi', count: counts.mine }] : []),
    ...(info?.isModerator
      ? [
          { key: 'pending', label: 'Chờ duyệt', count: counts.pending },
          { key: 'hidden', label: 'Đã ẩn', count: counts.hidden },
        ]
      : []),
  ];
  const canPost = info ? info.canPost : !g.readOnly;
  const who = moderatorName(g.groupType);
  const items = data?.items ?? [];

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

      <div className="feed-toolbar gf-toolbar">
        <FeedTabs tabs={tabs} active={view} onChange={openTab} label="Xem bài viết" />
      </div>

      <div className="feed-layout">
        <section className="feed-main" aria-label={tabs.find((t) => t.key === view)?.label} ref={listTop}>
          {canPost && view === 'feed' && (
            <Link to={`${feedPath(g.groupId)}/new`} className="feed-card no-foot gf-composer-open">
              <Avatar src={user?.avatarUrl} name={user?.fullName ?? ''} size={36} />
              {/* A draft left in this browser (postDraft.js): say so, the form restores it. */}
              {draft ? (
                <span className="gf-composer-placeholder is-draft">Tiếp tục bản nháp: {draft.text.trim() || 'tệp đính kèm'}</span>
              ) : (
                <span className="gf-composer-placeholder">Bạn muốn chia sẻ điều gì với nhóm?</span>
              )}
              <Icon name="edit_square" />
            </Link>
          )}

          <NewContentPill show={hasNew} onClick={showNew} />
          {data && !state.error && (
            <p className="feed-total caption muted">
              <span className="mono">{data.total.toLocaleString('vi-VN')}</span> {TAB_NOUN[view]}
              {view === 'feed' && info?.isModerator && counts.pinned >= info.maxPinned && (
                <> · đã ghim {info.maxPinned} bài, mức tối đa của nhóm</>
              )}
            </p>
          )}
          <div className={`feed-list${state.loading && data ? ' is-refreshing' : ''}`}>
            {state.error ? (
              <FeedError message={state.error} onRetry={reload} />
            ) : !data ? (
              <FeedSkeleton count={3} />
            ) : items.length === 0 ? (
              <FeedEmpty icon={view === 'feed' ? 'dynamic_feed' : 'inbox'}>{EMPTY_TEXT[view]}</FeedEmpty>
            ) : (
              items.map((post) => (
                <PostCard key={post.postId} post={post} groupId={g.groupId} onAction={actions.run} listState={{ from: 'feed' }} />
              ))
            )}
          </div>
          {!state.error && data && <FeedPager page={page} total={data.total} pageSize={PAGE_SIZE} onPage={setPage} />}
        </section>

        <aside className="feed-side">
          <PinnedPanel groupId={g.groupId} reloadKey={`${reloadKey}:${counts.pinned ?? ''}`} />
          <ApprovalPanel info={info} who={who} canPost={canPost} pending={counts.pending} onPending={() => openTab('pending')} />
        </aside>
      </div>
      {actions.dialog}
    </div>
  );
}

const PINNED_TEXT_CHARS = 90;

// Right column: the posts pinned by the moderator (pinned posts come first in the feed, at most maxPinned of them).
function PinnedPanel({ groupId, reloadKey }) {
  const [pinned, setPinned] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    listGroupPosts(groupId, { view: 'feed', page: 1, pageSize: 5 }, { signal: controller.signal })
      .then((data) => setPinned(data.items.filter((p) => p.isPinned)))
      .catch(() => !controller.signal.aborted && setPinned([]));
    return () => controller.abort();
  }, [groupId, reloadKey]);

  return (
    <FeedPanel icon="push_pin" title="Bài đã ghim" titleId="gf-pinned-title">
      {pinned === null ? (
        <p className="caption muted">Đang tải…</p>
      ) : pinned.length === 0 ? (
        <p className="feed-panel-empty caption">Chưa có bài nào được ghim.</p>
      ) : (
        <ul className="gf-pinned">
          {pinned.map((p) => (
            <li key={p.postId}>
              <Link to={postPath(groupId, p.postId)} state={{ from: 'feed' }} className="gf-pinned-link">
                <span className="gf-pinned-text">
                  {p.content.length > PINNED_TEXT_CHARS ? `${p.content.slice(0, PINNED_TEXT_CHARS).trimEnd()}…` : p.content}
                </span>
                <span className="caption muted">
                  {p.authorName} · {formatDateTime(p.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </FeedPanel>
  );
}

// Right column: whether posts wait for approval, and the moderator's queue.
function ApprovalPanel({ info, who, canPost, pending, onPending }) {
  if (!info) return null;
  return (
    <FeedPanel icon="verified" title="Duyệt bài" titleId="gf-approval-title">
      <p className="caption gf-approval-text">
        {info.requireApproval
          ? info.isModerator
            ? 'Nhóm đang bật duyệt bài. Bài của bạn được đăng ngay; bài của thành viên chờ bạn duyệt.'
            : `Nhóm đang bật duyệt bài: bài của bạn sẽ hiện sau khi ${who} duyệt.`
          : 'Nhóm đang tắt duyệt bài: bài đăng hiện ngay trên bảng tin.'}
      </p>
      {info.isModerator && (
        <button type="button" className="btn btn-secondary gf-approval-queue" onClick={onPending}>
          <Icon name="pending_actions" size="sm" />
          {pending ? `${pending} bài chờ duyệt` : 'Không có bài chờ duyệt'}
        </button>
      )}
      {!canPost && <p className="caption muted">Bảng tin chỉ còn để xem lại.</p>}
    </FeedPanel>
  );
}
