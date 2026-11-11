import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { listSchoolPosts, setSchoolPostPinned } from '../../api/schoolPosts.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useLiveRefresh } from './useLiveRefresh.js';
import {
  CommentCount,
  FeedAudience,
  feedErrorText,
  formatDateTime,
  LikeButton,
  useLike,
} from './schoolFeedShared.jsx';
import './SchoolFeedPage.css';

// SCR-02 School Feed (FE-08, owner Anh): UC-58 View School Feed & News, UC-63 Pin / Unpin, UC-64 Like.
// Layout: Stitch "SCR-34 School Feed" (team decision 08/11/2026, replaces the Report 3 2/3 + 1/3 split): one list
// with three tabs (Tất cả / Thông báo / Tin tức) and the "Lịch sắp tới" block on the right.

const SEARCH_DELAY_MS = 350; // same as the FE-02 lists
// ASSUMPTION: 10 posts per page (the API allows up to 50; a feed page stays short to read).
const PAGE_SIZE = 10;
const MAX_Q_LENGTH = 100; // server limit
const NOT_BUILT = 'Chức năng đang phát triển';

// URL value of ?tab= -> postType sent to GET /school-posts. "Tất cả" sends no postType: the server returns both
// types already ordered (pinned first, then newest), so the client never merges two lists.
const TABS = [
  { key: 'all', label: 'Tất cả', postType: undefined, noun: 'bài viết' },
  { key: 'announcements', label: 'Thông báo', postType: 'ANNOUNCEMENT', noun: 'thông báo' },
  { key: 'news', label: 'Tin tức', postType: 'NEWS', noun: 'tin tức' },
];
const number = (n) => n.toLocaleString('vi-VN');

// Search, tab and page live in the URL (?q=&tab=&page=), so a refresh, the back button or a shared link shows the
// same feed. Values the API would reject are dropped here.
function readParams(sp) {
  const n = Number(sp.get('page'));
  return {
    q: (sp.get('q') ?? '').slice(0, MAX_Q_LENGTH),
    page: Number.isInteger(n) && n >= 1 ? n : 1,
    tab: TABS.find((t) => t.key === sp.get('tab')) ?? TABS[0],
  };
}

/**
 * The list of the open tab: cancels the previous request so a slow answer can never replace a newer one.
 * `reloadKey` forces a reload (after pinning).
 */
// What the reader would notice on a page of the list: which posts, in which order, pinned or not, edited or not.
// Like / comment counts are left out on purpose (they change often and the "new content" pill is not about them).
const feedSignature = (result) =>
  `${result.total}|${result.items.map((p) => `${p.schoolPostId}:${p.isPinned ? 1 : 0}:${p.updatedAt ?? ''}`).join(',')}`;

function usePosts(tab, q, page, reloadKey) {
  const [state, setState] = useState({ result: null, loading: true, error: '' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    listSchoolPosts({ postType: tab.postType, q: q.trim(), page, pageSize: PAGE_SIZE }, { signal: controller.signal })
      .then((result) => setState({ result, loading: false, error: '' }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setState({ result: null, loading: false, error: feedErrorText(err, `Không tải được ${tab.noun}. Vui lòng thử lại.`) });
      });
    return () => controller.abort();
  }, [tab, q, page, reloadKey, retry]);
  return { ...state, retry: () => setRetry((n) => n + 1) };
}

function Pager({ page, total, onPage }) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (totalPages <= 1) return null;
  return (
    <nav className="school-feed-pager" aria-label="Phân trang">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Trang trước"
      >
        <Icon name="chevron_left" size="sm" />
      </button>
      <span className="caption muted mono">
        Trang {page} / {totalPages}
      </span>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        aria-label="Trang sau"
      >
        <Icon name="chevron_right" size="sm" />
      </button>
    </nav>
  );
}

function SkeletonCards({ count }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className="school-feed-skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  ));
}

// Image of the card (UC-58 firstImageUrl). Hidden when it cannot be loaded (§15: storage not decided yet).
function CardImage({ src }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <figure className="school-feed-image">
      <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    </figure>
  );
}

// The card is a link to SCR-05 (the title is the real link); buttons inside handle their own clicks.
function openOnClick(navigate, to, state) {
  return (e) => {
    if (e.target.closest('a, button')) return;
    navigate(to, { state });
  };
}

// Like and comment count of an announcement (UC-64). Its own component so the hook only exists for announcements.
function AnnouncementFoot({ post, onLikeError }) {
  const like = useLike(post.schoolPostId, post.likedByMe, post.likeCount, onLikeError);
  return (
    <>
      <LikeButton liked={like.likedByMe} count={like.likeCount} onClick={like.toggle} />
      <CommentCount count={post.commentCount} />
    </>
  );
}

/**
 * One card for both types; in "Tất cả" they sit in the same list, so the type shows at a glance: the kind line
 * (icon + "THÔNG BÁO" in ink / "TIN TỨC" in blue) and, for news, a blue bar on the left edge.
 * News is view only (business-rules §8): no Like, no counts, no pin button.
 */
function PostCard({ post, canPin, pinBusy, onPin, listState, onLikeError }) {
  const navigate = useNavigate();
  const to = `/school-feed/${post.schoolPostId}`;
  const announcement = post.postType === 'ANNOUNCEMENT';
  const pinned = announcement && post.isPinned;
  const classes = ['school-feed-card', announcement ? 'is-announcement' : 'is-news', pinned && 'is-pinned'];
  return (
    <article className={classes.filter(Boolean).join(' ')} onClick={openOnClick(navigate, to, listState)}>
      <div className="school-feed-card-top">
        <span className="label-upper school-feed-kind">
          <Icon name={pinned ? 'push_pin' : announcement ? 'campaign' : 'newspaper'} size="sm" filled={pinned} />
          {announcement ? 'Thông báo' : 'Tin tức'}
          {pinned && ' · Đã ghim'}
        </span>
        {canPin && announcement && (
          <button
            type="button"
            className={`btn btn-icon school-feed-pin${post.isPinned ? ' is-on' : ''}`}
            onClick={() => onPin(post)}
            disabled={pinBusy}
            aria-label={post.isPinned ? `Bỏ ghim “${post.title}”` : `Ghim “${post.title}”`}
            title={post.isPinned ? 'Bỏ ghim' : 'Ghim lên đầu'}
          >
            <Icon name="push_pin" filled={post.isPinned} />
          </button>
        )}
      </div>
      <div className="school-feed-card-body">
        <div className="school-feed-card-text">
          <h3 className="school-feed-title">
            <Link to={to} state={listState}>
              {post.title}
            </Link>
          </h3>
          <p className="school-feed-preview">{post.contentPreview}</p>
          <p className="school-feed-meta caption">
            <Avatar src={post.authorAvatarUrl} name={post.authorName} size={20} />
            <span className="author">{post.authorName}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={post.createdAt}>{formatDateTime(post.createdAt)}</time>
            <span aria-hidden="true">·</span>
            <span>
              Gửi tới: <FeedAudience post={post} />
            </span>
          </p>
        </div>
        <CardImage src={post.firstImageUrl} />
      </div>
      {(announcement || post.attachmentCount > 0) && (
        <div className="school-feed-card-foot">
          {announcement && <AnnouncementFoot post={post} onLikeError={onLikeError} />}
          {post.attachmentCount > 0 && (
            <span className="sf-attachments caption">
              <Icon name="attach_file" size="sm" />
              {number(post.attachmentCount)} tệp đính kèm
            </span>
          )}
        </div>
      )}
    </article>
  );
}

function ListState({ list, emptyText }) {
  if (list.error) {
    return (
      <div className="school-feed-error">
        <p className="form-error" role="alert">
          {list.error}
        </p>
        <button type="button" className="btn btn-secondary" onClick={list.retry}>
          Thử lại
        </button>
      </div>
    );
  }
  if (!list.result) return <SkeletonCards count={3} />;
  if (!list.result.items.length) {
    return (
      <p className="school-feed-empty">
        <Icon name="article" />
        {emptyText}
      </p>
    );
  }
  return null;
}

// Right column of Stitch SCR-34. The school calendar belongs to FE-10 Schedule (not built yet): only the frame.
function UpcomingCalendar() {
  return (
    <aside className="school-feed-side" aria-labelledby="sf-calendar-title">
      <section className="school-feed-calendar">
        <h2 id="sf-calendar-title" className="school-feed-calendar-title">
          <Icon name="event_upcoming" />
          Lịch sắp tới của trường
        </h2>
        {/* TODO FE-10 Schedule: upcoming school events. No API call and no sample data until FE-10 exists. */}
        <p className="school-feed-calendar-empty caption">{NOT_BUILT}</p>
      </section>
    </aside>
  );
}

export default function SchoolFeedPage() {
  const { activeRole } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readParams(searchParams);
  const query = searchParams.toString();
  const listState = { listSearch: query ? `?${query}` : '' };
  const isManager = activeRole === 'SCHOOL_MANAGER';

  // Changes start from the address bar, not from this render's searchParams: the debounced search and a click on
  // a pager meanwhile would otherwise overwrite each other. Default values (tab "all", page 1) are left out.
  function updateParams(changes, { replace = false } = {}) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value === null || value === undefined || value === 1 || value === 'all') next.delete(key);
      else next.set(key, String(value));
    }
    setSearchParams(next, { replace });
  }

  // Search box: typed text goes to the URL after a short pause; the URL value is copied back when it changes from
  // outside (back button, pasted link). Searches the open tab, back to page 1.
  const [qInput, setQInput] = useState(params.q);
  const lastWrittenQ = useRef(params.q);
  useEffect(() => {
    if (params.q !== lastWrittenQ.current) {
      lastWrittenQ.current = params.q;
      setQInput(params.q);
    }
  }, [params.q]);
  useEffect(() => {
    if (qInput === params.q) return undefined;
    const timer = setTimeout(() => {
      lastWrittenQ.current = qInput;
      updateParams({ q: qInput, page: 1 }, { replace: true });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  const [reloadKey, setReloadKey] = useState(0);
  const list = usePosts(params.tab, params.q, params.page, reloadKey);

  // UC-63: pin / unpin, then reload the list so the server's order (pinned first) is shown as it is. The other tabs
  // load again when opened, so they show the new order too.
  const [pinningId, setPinningId] = useState(null);
  async function handlePin(post) {
    if (pinningId) return;
    setPinningId(post.schoolPostId);
    try {
      await setSchoolPostPinned(post.schoolPostId, !post.isPinned);
      toast(post.isPinned ? 'Đã bỏ ghim thông báo.' : 'Đã ghim thông báo lên đầu bảng tin.');
      if (!post.isPinned && params.page !== 1) updateParams({ page: 1 });
      else setReloadKey((n) => n + 1);
    } catch (err) {
      toast(feedErrorText(err, 'Không cập nhật được trạng thái ghim. Vui lòng thử lại.'), { type: 'error' });
    } finally {
      setPinningId(null);
    }
  }

  const onLikeError = (err) =>
    toast(feedErrorText(err, 'Không cập nhật được lượt thích. Vui lòng thử lại.'), { type: 'error' });

  // --- Real time (FE-08 step 3): never insert into the list the reader is going through. A signal only leads to a
  // quiet read of the SAME page / tab / search; when it differs from what is shown (posts, order, pin, edits – not the
  // like / comment counts, which change all the time), one "Có nội dung mới — Tải lại" pill shows. Several signals in
  // a row are read once (debounce), so they make one pill, never a count. A signal that changes nothing here (a post
  // of the other tab, this tab's own pin already reloaded) shows nothing.
  // ASSUMPTION: no automatic reload, not even at the top of page 1: the pill is cheap, and the list never moves under
  // the reader's eyes or loses an optimistic like.
  // "schoolpost:changed" comes on the user's own room (user:<id>): no join for this page.
  const socket = useSocket();
  const [hasNew, setHasNew] = useState(false);
  const latest = useRef({ params, result: list.result, loading: list.loading });
  useEffect(() => {
    latest.current = { params, result: list.result, loading: list.loading };
  });
  useEffect(() => setHasNew(false), [list.result]); // a fresh list is shown: nothing new any more

  const checkTimer = useRef(null);
  const checkForNew = useCallback(async () => {
    checkTimer.current = null;
    const { params: p, result, loading } = latest.current;
    if (!result || loading) return; // a load is on its way and will be fresh
    try {
      const fresh = await listSchoolPosts({ postType: p.tab.postType, q: p.q.trim(), page: p.page, pageSize: PAGE_SIZE });
      if (latest.current.result === result && feedSignature(fresh) !== feedSignature(result)) setHasNew(true);
    } catch {
      // quiet: the next signal, reconnect or poll tries again
    }
  }, []);
  // ASSUMPTION: a signal is read after 0.8–2 s (random), so a post sent to the whole school does not make every open
  // feed call the API in the same instant; signals meanwhile join that one read.
  const scheduleCheck = useCallback(
    (delay = 800 + Math.random() * 1200) => {
      if (checkTimer.current) return;
      checkTimer.current = setTimeout(checkForNew, delay);
    },
    [checkForNew],
  );
  useEffect(() => () => clearTimeout(checkTimer.current), []);

  useEffect(() => {
    if (!socket) return undefined;
    const onChanged = () => scheduleCheck();
    socket.on('schoolpost:changed', onChanged);
    return () => socket.off('schoolpost:changed', onChanged);
  }, [socket, scheduleCheck]);

  // Safety net: reconnect / new socket, tab shown again, every 60 s while the socket is down.
  useLiveRefresh(socket, () => scheduleCheck(0));

  const listTop = useRef(null);
  function showNew() {
    setHasNew(false);
    setReloadKey((n) => n + 1);
    if (listTop.current && listTop.current.getBoundingClientRect().top < 0) {
      listTop.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  const { tab } = params;
  const items = list.result?.items ?? [];
  const emptyText = params.q.trim()
    ? `Không có ${tab.noun} nào khớp với từ khoá.`
    : tab.key === 'news'
      ? 'Chưa có tin tức nào.'
      : `Chưa có ${tab.noun} nào dành cho bạn.`;

  return (
    <div className="school-feed">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Trường</span>/<span className="current">Bảng tin trường</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Bảng tin trường</h1>
          <p>Thông báo và tin tức của nhà trường dành cho bạn.</p>
        </div>
        {isManager && (
          <div className="actions-row">
            {/* UC-60 Create School Post (SCR-31); comes back to this list (same search / tab / page) on cancel. */}
            <Link to="/school-feed/new" state={listState} className="btn btn-primary">
              <Icon name="edit_square" size="sm" />
              Soạn bài
            </Link>
          </div>
        )}
      </div>

      <div className="school-feed-toolbar">
        <div className="school-feed-tabs" role="tablist" aria-label="Loại bài viết">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab.key === t.key}
              onClick={() => tab.key !== t.key && updateParams({ tab: t.key, page: 1 })}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="school-feed-search">
          <Icon name="search" size="sm" />
          <input
            type="search"
            className="input"
            value={qInput}
            maxLength={MAX_Q_LENGTH}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={`Tìm trong ${tab.key === 'all' ? 'thông báo và tin tức' : tab.noun}…`}
            aria-label={`Tìm trong ${tab.key === 'all' ? 'thông báo và tin tức' : tab.noun}`}
          />
        </div>
      </div>

      <div className="school-feed-layout">
        <section className="school-feed-main" aria-label={tab.label} ref={listTop}>
          {/* Always rendered with zero height and sticky: the pill floats over the list and never moves it. */}
          <div className="school-feed-new-wrap" aria-live="polite">
            {hasNew && (
              <button type="button" className="school-feed-new" onClick={showNew}>
                <Icon name="refresh" size="sm" />
                Có nội dung mới — Tải lại
              </button>
            )}
          </div>
          {list.result && !list.error && (
            <p className="school-feed-total caption muted">
              <span className="mono">{number(list.result.total)}</span> {tab.noun}
            </p>
          )}
          <div className={`school-feed-list${list.loading && list.result ? ' is-refreshing' : ''}`}>
            <ListState list={list} emptyText={emptyText} />
            {!list.error &&
              items.map((post) => (
                <PostCard
                  key={post.schoolPostId}
                  post={post}
                  canPin={isManager}
                  pinBusy={pinningId !== null}
                  onPin={handlePin}
                  listState={listState}
                  onLikeError={onLikeError}
                />
              ))}
          </div>
          {!list.error && list.result && (
            <Pager page={params.page} total={list.result.total} onPage={(page) => updateParams({ page })} />
          )}
        </section>
        <UpcomingCalendar />
      </div>
    </div>
  );
}
