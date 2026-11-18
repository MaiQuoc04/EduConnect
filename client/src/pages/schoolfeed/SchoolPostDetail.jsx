import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createSchoolPostComment,
  deleteSchoolPost,
  deleteSchoolPostComment,
  getSchoolPost,
  listSchoolPostComments,
  reportSchoolPostComment,
  setSchoolPostCommentLiked,
  setSchoolPostPinned,
} from '../../api/schoolPosts.js';
import AttachmentList from '../../components/AttachmentList.jsx';
import Avatar from '../../components/Avatar.jsx';
import CommentThread from '../../components/CommentThread.jsx';
import { FeedConfirmDialog, FeedKind } from '../../components/feed/Feed.jsx';
import '../../components/feed/feed.css';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useLiveRefresh } from './useLiveRefresh.js';
import {
  AudienceLine,
  clearHandedOverPost,
  CommentCount,
  feedErrorText,
  formatDateTime,
  isEdited,
  LikeButton,
  peekHandedOverPost,
  POST_TYPE_LABELS,
  targetScopeLabels,
  useLike,
} from './schoolFeedShared.jsx';
import './SchoolPostDetailPage.css';

// One school post read in full (FE-08, owner Anh) – SCR-05 content: UC-59 View, UC-63 Pin / Unpin, UC-64 Like, the
// School Manager's entry to UC-61 Update (SCR-06) and UC-62 Delete; UC-65 Comment / UC-66 Delete Comment through the
// shared components/CommentThread (announcements only, §8).
// Shown on the SCR-05 page (SchoolPostDetailPage: old links, notifications) and in the feed's pop-up (SchoolFeedPage
// → FeedPostDialog, 18/11/2026), as FE-05 splits PostDetail from its page and pop-up.
// Props:
//   schoolPostId          the post (URL value, checked here)
//   leading / trailing    what sits left / right of the action buttons (back link + breadcrumb / close button);
//                         leading may be a function (post | null) => node
//   listSearch            "?q=…&tab=…" of the feed it came from (edit form and "back" keep it)
//   backTo                where "Về bảng tin trường" of the not-found state goes (a link); onBack instead of it
//                         (the pop-up closes itself)
//   onDeleted()           after UC-62 (also when it was already deleted): the page goes back, the pop-up closes
//   onChanged(kind)       after the reader changed something the feed shows (pin, like, comment count)
//   titleId               id of the heading (the pop-up's aria-labelledby)
// Design: Stitch "SCR-35 School Post Detail" (reading canvas with the notebook margin rule; the design has no comment
// area, so the comments follow the stage 4 like bar with the composer on top).

const FEED_PATH = '/school-feed';

// School-feed codes the shared CommentThread does not know. TODO FE-08: move to messages.js once approved.
const COMMENT_MESSAGES = {
  MSG_CANNOT_COMMENT_NEWS: 'Không thể bình luận tin tức.',
  MSG_SCHOOL_POST_NOT_FOUND: 'Không tìm thấy bài viết.',
};

// UC-62 confirmation (shared FeedConfirmDialog). The server soft deletes (business-rules §14), but for every reader
// the post is gone, which is what the dialog says.
// ASSUMPTION: the dialog does not mention that likes and comments stay stored – a technical detail the School Manager
// cannot act on.
const DELETE_CONFIRM = {
  icon: 'delete',
  title: 'Xoá bài viết?',
  body: 'Sau khi xoá, bài viết không còn hiển thị với bất kỳ ai trên bảng tin trường, kể cả người đã nhận thông báo.',
  label: 'Xoá bài viết',
  busy: 'Đang xoá…',
  keep: 'Giữ lại',
  danger: true,
};

// 404 for a post that does not exist, was deleted OR is not addressed to the reader: the server answers the same on
// purpose, so the screen never talks about permissions. `gone`: the post was open and disappeared meanwhile (deleted,
// or the audience changed and the reader is no longer in it – real time "schoolpost:changed"). Same canvas as the
// FE-05 post (feed-article feed-article-missing), with the way back of the school feed.
function NotFound({ backTo, onBack, gone = false, titleId }) {
  const back = (
    <>
      <Icon name="arrow_back" size="sm" />
      Về bảng tin trường
    </>
  );
  return (
    <section className="feed-article feed-article-missing" role={gone ? 'status' : undefined}>
      <Icon name={gone ? 'article_shortcut' : 'article'} />
      <h1 id={titleId} className="title-md">
        {gone ? 'Bài viết không còn tồn tại' : 'Không tìm thấy bài viết'}
      </h1>
      <p className="muted">
        {gone
          ? 'Bài viết vừa được gỡ hoặc không còn dành cho bạn.'
          : 'Bài viết có thể đã bị gỡ hoặc đường dẫn không còn đúng.'}
      </p>
      {onBack ? (
        <button type="button" className="btn btn-primary" onClick={onBack}>
          {back}
        </button>
      ) : (
        <Link to={backTo} className="btn btn-primary">
          {back}
        </Link>
      )}
    </section>
  );
}

function Interactions({ post, onLikeError, onLiked }) {
  const like = useLike(post.schoolPostId, post.likedByMe, post.likeCount, onLikeError);
  return (
    <div className="feed-article-interactions">
      <LikeButton
        liked={like.likedByMe}
        count={like.likeCount}
        onClick={() => {
          like.toggle();
          onLiked?.();
        }}
      />
      <CommentCount count={post.commentCount} />
    </div>
  );
}

export default function SchoolPostDetail({
  schoolPostId,
  leading,
  trailing,
  listSearch = '',
  backTo = FEED_PATH,
  onBack,
  onDeleted,
  onChanged,
  titleId,
}) {
  const { activeRole } = useAuth();
  const toast = useToast();
  const isManager = activeRole === 'SCHOOL_MANAGER';
  const validId = /^\d+$/.test(String(schoolPostId ?? ''));
  const changed = useRef(onChanged);
  useEffect(() => {
    changed.current = onChanged;
  });

  // Just saved by SCR-31 / SCR-06: show the server's answer without a new request.
  const handedOver = validId ? peekHandedOverPost(Number(schoolPostId)) : null;
  const handedOverId = useRef(handedOver ? String(schoolPostId) : null);
  const [state, setState] = useState(() =>
    handedOver
      ? { data: handedOver, loading: false, error: '', notFound: false }
      : { data: null, loading: validId, error: '', notFound: !validId },
  );
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!validId) {
      setState({ data: null, loading: false, error: '', notFound: true });
      return undefined;
    }
    if (retry === 0 && handedOverId.current === String(schoolPostId)) {
      clearHandedOverPost();
      return undefined;
    }
    handedOverId.current = null;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    getSchoolPost(schoolPostId, { signal: controller.signal })
      .then((data) => setState({ data, loading: false, error: '', notFound: false }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err.status === 404) setState({ data: null, loading: false, error: '', notFound: true });
        else {
          const error = feedErrorText(err, 'Không tải được bài viết. Vui lòng thử lại.');
          setState({ data: null, loading: false, error, notFound: false });
        }
      });
    return () => controller.abort();
  }, [schoolPostId, validId, retry]);

  // UC-63 (announcements only, §8). The answer is the whole UC-59 object.
  const [pinning, setPinning] = useState(false);
  async function handlePin() {
    const { post } = state.data;
    if (pinning) return;
    setPinning(true);
    try {
      const data = await setSchoolPostPinned(post.schoolPostId, !post.isPinned);
      setState((s) => ({ ...s, data }));
      toast(post.isPinned ? 'Đã bỏ ghim thông báo.' : 'Đã ghim thông báo lên đầu bảng tin.');
      changed.current?.('pin');
    } catch (err) {
      toast(feedErrorText(err, 'Không cập nhật được trạng thái ghim. Vui lòng thử lại.'), { type: 'error' });
    } finally {
      setPinning(false);
    }
  }

  // UC-62: then onDeleted (the page goes back to the feed, the pop-up closes).
  const [deleting, setDeleting] = useState(null); // null | 'asking' | 'busy'
  async function handleDelete() {
    if (deleting === 'busy') return;
    setDeleting('busy');
    try {
      await deleteSchoolPost(state.data.post.schoolPostId);
      toast('Đã xoá bài viết.');
      onDeleted?.();
    } catch (err) {
      setDeleting(null);
      if (err.status === 404 || err.code === 'MSG_SCHOOL_POST_NOT_FOUND') {
        toast('Bài viết đã bị xoá trước đó.');
        onDeleted?.();
        return;
      }
      toast(feedErrorText(err, 'Không xoá được bài viết. Vui lòng thử lại.'), { type: 'error' });
    }
  }

  // UC-65 / UC-66 calls of THIS post for the shared CommentThread (FE-05 passes its own /posts/:id/comments calls).
  const commentApi = useMemo(
    () => ({
      list: (params, options) => listSchoolPostComments(schoolPostId, params, options),
      create: (body) => createSchoolPostComment(schoolPostId, body),
      remove: (commentId) => deleteSchoolPostComment(schoolPostId, commentId),
      like: (commentId, liked) => setSchoolPostCommentLiked(schoolPostId, commentId, liked), // 17/11/2026
      // Report (17/11/2026): Teacher / Student / Parent. Not a School Manager: they delete any comment directly (UC-66)
      // and handle the reports on /comment-reports, so no "Báo cáo" button for them (the server answers 403 too).
      ...(!isManager && { report: (commentId, body) => reportSchoolPostComment(schoolPostId, commentId, body) }),
    }),
    [schoolPostId, isManager],
  );
  // Keeps the count of the like bar in step with the comment heading (and tells the feed its card count changed).
  const onCommentCount = useCallback((commentCount) => {
    setState((s) => {
      if (!s.data || s.data.post.commentCount === commentCount) return s;
      changed.current?.('comment');
      return { ...s, data: { ...s.data, post: { ...s.data.post, commentCount } } };
    });
  }, []);

  const onLikeError = (err) =>
    toast(feedErrorText(err, 'Không cập nhật được lượt thích. Vui lòng thử lại.'), { type: 'error' });

  // --- Real time (FE-08 step 3). The socket is shared with the chat: only the listeners added here are removed, and
  // it is never disconnected here. Events are signals; the data comes from the API.
  const socket = useSocket();
  const [gone, setGone] = useState(false);
  useEffect(() => setGone(false), [schoolPostId]); // another post opened in the same place
  const [commentsRefreshKey, setCommentsRefreshKey] = useState(0);
  const deletingRef = useRef(deleting);
  useEffect(() => {
    deletingRef.current = deleting;
  });

  // The post again, quietly (no skeleton: what is shown stays until the answer). 404 → the post is gone for this
  // reader (deleted, or no longer in its audience – also a reader with two roles acting as the other one).
  // Resolves to the post's fresh attachments (new signed links), or null: AttachmentList uses it when a link expired.
  const refreshPost = useCallback(() => {
    if (!validId) return Promise.resolve(null);
    return getSchoolPost(schoolPostId)
      .then((data) => {
        setState((s) => (s.data ? { ...s, data } : s));
        return data.attachments;
      })
      .catch((err) => {
        if (err.status === 404 || err.code === 'MSG_SCHOOL_POST_NOT_FOUND') setGone(true);
        // other errors: keep what is shown; the next signal / reconnect / poll tries again
        return null;
      });
  }, [schoolPostId, validId]);

  // When the attachment links were signed (they live one hour): every new UC-59 answer brings new ones.
  const [signedAt, setSignedAt] = useState(() => Date.now());
  useEffect(() => setSignedAt(Date.now()), [state.data]);

  // "schoolpost:changed" arrives on the user's own room (user:<id>), no join needed.
  useEffect(() => {
    if (!socket || !validId) return undefined;
    const id = Number(schoolPostId);
    const onSignal = (signal) => {
      if (signal?.schoolPostId !== id) return;
      if (signal.change === 'deleted') {
        if (deletingRef.current !== 'busy') setGone(true); // this tab deleting it leaves by itself
      } else {
        refreshPost(); // updated (404 → gone), pinned / unpinned (the label comes with the post)
      }
    };
    socket.on('schoolpost:changed', onSignal);
    return () => socket.off('schoolpost:changed', onSignal);
  }, [socket, schoolPostId, validId, refreshPost]);

  // Room "schoolpost:<id>" for the comment signals: announcements only (NEWS has no comments, §8). Joined while this
  // post is shown – the page or the pop-up – and left when it goes away (pop-up closed). The server does not put a
  // socket back into it after a reconnect or a role switch (a new socket), so the join is sent on EVERY 'connect'.
  // { ok: false } (not allowed, limit, unknown post) is ignored on purpose: the server never says why.
  const roomPostId = state.data?.post?.canInteract && !gone ? state.data.post.schoolPostId : null;
  useEffect(() => {
    if (!socket || !roomPostId) return undefined;
    const payload = { schoolPostId: roomPostId };
    const join = () => socket.emit('schoolpost:join', payload, () => {});
    if (socket.connected) join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      if (socket.connected) socket.emit('schoolpost:leave', payload);
    };
  }, [socket, roomPostId]);

  // Comment signals for CommentThread (it reads the comments itself and merges them in place).
  const liveComments = useCallback(
    (handlers) => {
      if (!socket || !roomPostId) return () => {};
      const onComment = (signal) => signal?.schoolPostId === roomPostId && handlers.comment(signal);
      const onDeleted = (signal) => signal?.schoolPostId === roomPostId && handlers.commentDeleted(signal);
      socket.on('schoolpost:comment', onComment);
      socket.on('schoolpost:comment-deleted', onDeleted);
      return () => {
        socket.off('schoolpost:comment', onComment);
        socket.off('schoolpost:comment-deleted', onDeleted);
      };
    },
    [socket, roomPostId],
  );

  // Safety net: after a reconnect / new socket, when the tab is shown again, and every 60 s while the socket is down.
  useLiveRefresh(socket, () => {
    if (!state.data || gone) return;
    refreshPost();
    setCommentsRefreshKey((n) => n + 1);
  });

  const missing = state.notFound || gone;
  const post = missing ? null : state.data?.post;
  const attachments = state.data?.attachments ?? [];
  const typeLabel = post ? POST_TYPE_LABELS[post.postType] ?? post.postType : '';
  const announcement = post?.postType === 'ANNOUNCEMENT';

  return (
    <>
      <div className="feed-article-top">
        {typeof leading === 'function' ? leading(post) : leading}
        {((isManager && post) || trailing) && (
          <div className="actions-row feed-article-actions">
            {isManager && post && announcement && (
              <button type="button" className="btn btn-secondary" onClick={handlePin} disabled={pinning}>
                <Icon name="push_pin" size="sm" filled={post.isPinned} />
                {post.isPinned ? 'Bỏ ghim' : 'Ghim'}
              </button>
            )}
            {isManager && post && (
              // fromDetail: this post (page or pop-up) is right behind the form in the history, so leaving the form
              // goes one step back to it – from the pop-up that is the feed with the pop-up open again.
              <Link
                to={`${FEED_PATH}/${post.schoolPostId}/edit`}
                state={{ fromDetail: true, listSearch }}
                className="btn btn-secondary"
              >
                <Icon name="edit" size="sm" />
                Sửa
              </Link>
            )}
            {isManager && post && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setDeleting('asking')}
                disabled={Boolean(deleting)}
              >
                <Icon name="delete" size="sm" />
                Xoá
              </button>
            )}
            {trailing}
          </div>
        )}
      </div>

      {missing && <NotFound backTo={backTo} onBack={onBack} gone={gone} titleId={titleId} />}

      {!missing && state.error && (
        <div className="feed-article-error">
          <p className="form-error" role="alert">
            {state.error}
          </p>
          <button type="button" className="btn btn-secondary" onClick={() => setRetry((n) => n + 1)}>
            Thử lại
          </button>
        </div>
      )}

      {!missing && !post && state.loading && (
        <article className="feed-article is-loading" aria-busy="true">
          <div className="feed-article-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </article>
      )}

      {post && (
        <article className="feed-article" aria-labelledby={titleId}>
          <div className="feed-article-inner">
            {/* A grid item of the canvas, as the <p> it replaces (same height). */}
            <FeedKind
                icon={announcement ? 'campaign' : 'newspaper'}
                tone={announcement ? undefined : 'news'}
                label={
                  <>
                    {typeLabel}
                    {post.isPinned && (
                      <>
                        <span aria-hidden="true">·</span>
                        <Icon name="push_pin" size="sm" filled />
                        Đã ghim
                      </>
                    )}
                  </>
                }
              />
            <h1 id={titleId} className="headline-xl feed-article-title">
              {post.title}
            </h1>
            <div className="feed-article-meta caption">
              <Avatar src={post.authorAvatarUrl} name={post.authorName} size={24} />
              <span className="author">{post.authorName}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={post.createdAt}>{formatDateTime(post.createdAt)}</time>
              {isEdited(post) && (
                <span className="chip" title={`Chỉnh sửa lúc ${formatDateTime(post.updatedAt)}`}>
                  Đã chỉnh sửa
                </span>
              )}
            </div>
            <div className="school-post-detail-audience">
              <span className="caption muted">Gửi tới:</span>
              <AudienceLine scopeLabels={targetScopeLabels(post)} roles={post.targetRoles} />
            </div>

            {/* The server keeps the line breaks; pre-wrap shows them. */}
            <div className="feed-article-content">{post.content}</div>

            {attachments.length > 0 && (
              // Links signed by the server for one hour; an expired one is refreshed through UC-59 (refreshPost).
              <div className="feed-article-files">
                <AttachmentList
                  attachments={attachments}
                  signedAt={signedAt}
                  onRefresh={refreshPost}
                  headingId={`spd-files-${post.schoolPostId}`}
                />
              </div>
            )}

            {/* Likes and comments: announcements only; news is view only (business-rules §8). */}
            {post.canInteract && (
              <>
                <Interactions post={post} onLikeError={onLikeError} onLiked={() => changed.current?.('like')} />
                <div className="feed-article-comments">
                  <CommentThread
                    key={post.schoolPostId}
                    api={commentApi}
                    initialCount={post.commentCount}
                    onCountChange={onCommentCount}
                    messages={COMMENT_MESSAGES}
                    live={liveComments}
                    refreshKey={commentsRefreshKey}
                    enterToSend
                  />
                </div>
              </>
            )}
          </div>
        </article>
      )}

      {isManager && deleting && (
        <FeedConfirmDialog
          config={DELETE_CONFIRM}
          quote={state.data?.post?.title}
          busy={deleting === 'busy'}
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
