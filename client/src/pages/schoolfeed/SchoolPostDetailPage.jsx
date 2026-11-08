import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  createSchoolPostComment,
  deleteSchoolPost,
  deleteSchoolPostComment,
  getSchoolPost,
  listSchoolPostComments,
  setSchoolPostPinned,
} from '../../api/schoolPosts.js';
import Avatar from '../../components/Avatar.jsx';
import CommentThread from '../../components/CommentThread.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useLiveRefresh } from './useLiveRefresh.js';
import {
  AudiencePills,
  clearHandedOverPost,
  CommentCount,
  feedErrorText,
  formatDateTime,
  isEdited,
  LikeButton,
  peekHandedOverPost,
  POST_TYPE_LABELS,
  targetLabels,
  useLike,
} from './schoolFeedShared.jsx';
import './SchoolPostDetailPage.css';

// SCR-05 School Post Detail (FE-08, owner Anh): UC-59 View, UC-63 Pin / Unpin, UC-64 Like, and the School Manager's
// entry to UC-61 Update (SCR-06) and UC-62 Delete; UC-65 Comment / UC-66 Delete Comment through the shared
// components/CommentThread (announcements only, §8).
// Design: Stitch "SCR-35 School Post Detail" (reading canvas with the notebook margin rule; the design has no comment
// area, so the comments follow the stage 4 like bar with the composer on top).

const FEED_PATH = '/school-feed';

// School-feed codes the shared CommentThread does not know. TODO FE-08: move to messages.js once approved.
const COMMENT_MESSAGES = {
  MSG_CANNOT_COMMENT_NEWS: 'Không thể bình luận tin tức.',
  MSG_SCHOOL_POST_NOT_FOUND: 'Không tìm thấy bài viết.',
};

// "120000" bytes -> "117 KB"
function fileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024)).toLocaleString('vi-VN')} KB`;
  return `${(n / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;
}

function fileIcon(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'movie';
  if (mimeType === 'application/pdf') return 'picture_as_pdf';
  return 'description';
}

// 404 for a post that does not exist, was deleted OR is not addressed to the reader: the server answers the same on
// purpose, so the page never talks about permissions. `gone`: the post was open and disappeared meanwhile (deleted,
// or the audience changed and the reader is no longer in it – real time "schoolpost:changed").
function NotFound({ backTo, gone = false }) {
  return (
    <div className="school-post-detail">
      <section className="card card-outline school-post-detail-missing" role={gone ? 'status' : undefined}>
        <Icon name={gone ? 'article_shortcut' : 'article'} />
        <h1 className="title-md">{gone ? 'Bài viết không còn tồn tại' : 'Không tìm thấy bài viết'}</h1>
        <p className="muted">
          {gone
            ? 'Bài viết vừa được gỡ hoặc không còn dành cho bạn.'
            : 'Bài viết có thể đã bị gỡ hoặc đường dẫn không còn đúng.'}
        </p>
        <Link to={backTo} className="btn btn-primary">
          <Icon name="arrow_back" size="sm" />
          Về bảng tin trường
        </Link>
      </section>
    </div>
  );
}

/**
 * UC-62 confirmation. The server soft deletes (business-rules §14), but for every reader the post is gone, which is
 * what the dialog says. The safe button gets the focus.
 * ASSUMPTION: the dialog does not mention that likes and comments stay stored – a technical detail the School Manager
 * cannot act on.
 */
function DeleteDialog({ open, post, busy, onCancel, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sf-dialog"
      aria-labelledby="spd-delete-title"
      aria-describedby="spd-delete-desc"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="sf-dialog-head is-danger">
        <Icon name="delete" />
        <h2 id="spd-delete-title" className="title-sm">
          Xoá bài viết?
        </h2>
      </div>
      <div id="spd-delete-desc">
        <p className="sf-dialog-quote">{post?.title}</p>
        <div className="notice amber">
          <Icon name="warning" size="sm" />
          <p>Sau khi xoá, bài viết không còn hiển thị với bất kỳ ai trên bảng tin trường, kể cả người đã nhận thông báo.</p>
        </div>
      </div>
      <div className="sf-dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy} autoFocus>
          Giữ lại
        </button>
        <button type="button" className="btn btn-primary sf-btn-danger" onClick={onConfirm} disabled={busy}>
          <Icon name={busy ? 'progress_activity' : 'delete'} size="sm" className={busy ? 'sf-spin' : undefined} />
          {busy ? 'Đang xoá…' : 'Xoá bài viết'}
        </button>
      </div>
    </dialog>
  );
}

function Interactions({ post, onLikeError }) {
  const like = useLike(post.schoolPostId, post.likedByMe, post.likeCount, onLikeError);
  return (
    <div className="school-post-detail-interactions">
      <LikeButton liked={like.likedByMe} count={like.likeCount} onClick={like.toggle} />
      <CommentCount count={post.commentCount} />
    </div>
  );
}

export default function SchoolPostDetailPage() {
  const { schoolPostId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { activeRole } = useAuth();
  const toast = useToast();
  const isManager = activeRole === 'SCHOOL_MANAGER';
  // Back to the feed with the same search / pages / tab it was opened from (same pattern as FE-02).
  const backTo = `${FEED_PATH}${location.state?.listSearch ?? ''}`;
  const validId = /^\d+$/.test(schoolPostId ?? '');

  // Just saved by SCR-31 / SCR-06: show the server's answer without a new request.
  const handedOver = validId ? peekHandedOverPost(Number(schoolPostId)) : null;
  const handedOverId = useRef(handedOver ? schoolPostId : null);
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
    if (retry === 0 && handedOverId.current === schoolPostId) {
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
    } catch (err) {
      toast(feedErrorText(err, 'Không cập nhật được trạng thái ghim. Vui lòng thử lại.'), { type: 'error' });
    } finally {
      setPinning(false);
    }
  }

  // UC-62: back to the feed afterwards (replace: the deleted post's page is not kept in the history).
  const [deleting, setDeleting] = useState(null); // null | 'asking' | 'busy'
  async function handleDelete() {
    if (deleting === 'busy') return;
    setDeleting('busy');
    try {
      await deleteSchoolPost(state.data.post.schoolPostId);
      toast('Đã xoá bài viết.');
      navigate(backTo, { replace: true });
    } catch (err) {
      setDeleting(null);
      if (err.status === 404 || err.code === 'MSG_SCHOOL_POST_NOT_FOUND') {
        toast('Bài viết đã bị xoá trước đó.');
        navigate(backTo, { replace: true });
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
    }),
    [schoolPostId],
  );
  // Keeps the count of the like bar in step with the comment heading.
  const onCommentCount = useCallback((commentCount) => {
    setState((s) =>
      s.data && s.data.post.commentCount !== commentCount
        ? { ...s, data: { ...s.data, post: { ...s.data.post, commentCount } } }
        : s,
    );
  }, []);

  const onLikeError = (err) =>
    toast(feedErrorText(err, 'Không cập nhật được lượt thích. Vui lòng thử lại.'), { type: 'error' });

  // --- Real time (FE-08 step 3). The socket is shared with the chat: only the listeners added here are removed, and
  // it is never disconnected here. Events are signals; the data comes from the API.
  const socket = useSocket();
  const [gone, setGone] = useState(false);
  useEffect(() => setGone(false), [schoolPostId]); // another post opened in the same page
  const [commentsRefreshKey, setCommentsRefreshKey] = useState(0);
  const deletingRef = useRef(deleting);
  useEffect(() => {
    deletingRef.current = deleting;
  });

  // The post again, quietly (no skeleton: what is shown stays until the answer). 404 → the post is gone for this
  // reader (deleted, or no longer in its audience – also a reader with two roles acting as the other one).
  const refreshPost = useCallback(() => {
    if (!validId) return;
    getSchoolPost(schoolPostId)
      .then((data) => setState((s) => (s.data ? { ...s, data } : s)))
      .catch((err) => {
        if (err.status === 404 || err.code === 'MSG_SCHOOL_POST_NOT_FOUND') setGone(true);
        // other errors: keep what is shown; the next signal / reconnect / poll tries again
      });
  }, [schoolPostId, validId]);

  // "schoolpost:changed" arrives on the user's own room (user:<id>), no join needed.
  useEffect(() => {
    if (!socket || !validId) return undefined;
    const id = Number(schoolPostId);
    const onChanged = (signal) => {
      if (signal?.schoolPostId !== id) return;
      if (signal.change === 'deleted') {
        if (deletingRef.current !== 'busy') setGone(true); // this tab deleting it navigates away by itself
      } else {
        refreshPost(); // updated (404 → gone), pinned / unpinned (the label comes with the post)
      }
    };
    socket.on('schoolpost:changed', onChanged);
    return () => socket.off('schoolpost:changed', onChanged);
  }, [socket, schoolPostId, validId, refreshPost]);

  // Room "schoolpost:<id>" for the comment signals: announcements only (NEWS has no comments, §8). The server does not
  // put a socket back into it after a reconnect or a role switch (a new socket), so the join is sent on EVERY
  // 'connect'. { ok: false } (not allowed, limit, unknown post) is ignored on purpose: the server never says why.
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

  if (state.notFound || gone) return <NotFound backTo={backTo} gone={gone} />;

  const post = state.data?.post;
  const attachments = state.data?.attachments ?? [];
  const typeLabel = post ? POST_TYPE_LABELS[post.postType] ?? post.postType : '';
  const announcement = post?.postType === 'ANNOUNCEMENT';

  return (
    <div className="school-post-detail">
      <div className="school-post-detail-top">
        <div>
          <Link to={backTo} className="back-link">
            <Icon name="arrow_back" size="sm" />
            Bảng tin trường
          </Link>
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <span>EduConnect</span>/<Link to={backTo}>Bảng tin trường</Link>/
            {typeLabel && <span>{typeLabel}</span>}
            {typeLabel && '/'}
            <span className="current">Chi tiết</span>
          </nav>
        </div>
        {isManager && post && (
          <div className="actions-row school-post-detail-actions">
            {announcement && (
              <button type="button" className="btn btn-secondary" onClick={handlePin} disabled={pinning}>
                <Icon name="push_pin" size="sm" filled={post.isPinned} />
                {post.isPinned ? 'Bỏ ghim' : 'Ghim'}
              </button>
            )}
            <Link
              to={`${FEED_PATH}/${post.schoolPostId}/edit`}
              state={{ fromDetail: true, listSearch: location.state?.listSearch ?? '' }}
              className="btn btn-secondary"
            >
              <Icon name="edit" size="sm" />
              Sửa
            </Link>
            <button type="button" className="btn btn-danger" onClick={() => setDeleting('asking')} disabled={Boolean(deleting)}>
              <Icon name="delete" size="sm" />
              Xoá
            </button>
          </div>
        )}
      </div>

      {state.error && (
        <div className="school-post-detail-error">
          <p className="form-error" role="alert">
            {state.error}
          </p>
          <button type="button" className="btn btn-secondary" onClick={() => setRetry((n) => n + 1)}>
            Thử lại
          </button>
        </div>
      )}

      {!post && state.loading && (
        <article className="school-post-detail-article is-loading" aria-busy="true">
          <div className="school-post-detail-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </article>
      )}

      {post && (
        <article className="school-post-detail-article">
          <div className="school-post-detail-inner">
            <p className={`label-upper school-post-detail-kind${announcement ? '' : ' is-news'}`}>
              <Icon name={announcement ? 'campaign' : 'newspaper'} size="sm" />
              {typeLabel}
              {post.isPinned && (
                <>
                  <span aria-hidden="true">·</span>
                  <Icon name="push_pin" size="sm" filled />
                  Đã ghim
                </>
              )}
            </p>
            <h1 className="headline-xl school-post-detail-title">{post.title}</h1>
            <div className="school-post-detail-meta caption">
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
              <AudiencePills labels={targetLabels(post)} />
            </div>

            {/* The server keeps the line breaks; pre-wrap shows them. */}
            <div className="school-post-detail-content">{post.content}</div>

            {attachments.length > 0 && (
              <section className="school-post-detail-files" aria-labelledby="spd-files-title">
                <h2 id="spd-files-title" className="school-post-detail-section-title">
                  <Icon name="attach_file" size="sm" />
                  Tệp đính kèm ({attachments.length})
                </h2>
                {/* TODO FE-08 attachments: downloading waits for the storage provider (business-rules §15). */}
                <ul>
                  {attachments.map((file) => (
                    <li key={file.attachmentId}>
                      <span className="file-icon">
                        <Icon name={fileIcon(file.mimeType)} />
                      </span>
                      <span className="file-text">
                        <span className="file-name">{file.fileName}</span>
                        <span className="caption muted">{fileSize(file.sizeBytes)}</span>
                      </span>
                      <span className="caption muted file-note">Chưa tải xuống được</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Likes and comments: announcements only; news is view only (business-rules §8). */}
            {post.canInteract && (
              <>
                <Interactions post={post} onLikeError={onLikeError} />
                <div className="school-post-detail-comments">
                  <CommentThread
                    key={post.schoolPostId}
                    api={commentApi}
                    initialCount={post.commentCount}
                    onCountChange={onCommentCount}
                    messages={COMMENT_MESSAGES}
                    live={liveComments}
                    refreshKey={commentsRefreshKey}
                  />
                </div>
              </>
            )}
          </div>
        </article>
      )}

      {isManager && (
        <DeleteDialog
          open={Boolean(deleting)}
          post={post}
          busy={deleting === 'busy'}
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
