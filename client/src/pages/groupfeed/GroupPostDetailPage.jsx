import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { getGroupPost, groupPostCommentApi } from '../../api/groupPosts.js';
import AttachmentList from '../../components/AttachmentList.jsx';
import CommentThread from '../../components/CommentThread.jsx';
import '../../components/feed/feed.css';
import Icon from '../../components/Icon.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { useLiveRefresh } from '../schoolfeed/useLiveRefresh.js';
import {
  feedPath,
  postActions,
  PostInteractions,
  PostKind,
  PostMeta,
  StatusNotice,
  useGroupFeedSignals,
  usePostActions,
} from './groupFeedShared.jsx';

// SCR-37 Group Post Detail – UC-37 View Post Detail with UC-41 / UC-42 comments (shared FE-08 CommentThread, fed with
// the /posts/:postId/comments calls), UC-43 like and the author / moderator actions. A tab page inside GroupLayout.
// Layout as the school post detail (14/11/2026, shared components/feed .feed-article*): the reading canvas with the
// notebook margin rule – kind line, meta, the state notice, the text, files, like / comment bar and the comments – and
// the actions as buttons at the top right of the page.

// Codes the shared CommentThread does not know itself.
const COMMENT_MESSAGES = {
  MSG_POST_NOT_FOUND: 'Không tìm thấy bài viết.',
  MSG_POST_NOT_INTERACTIVE: 'Chỉ bình luận được bài đã duyệt và đang hiển thị.',
  MSG_TEXT_TOO_LONG: 'Bình luận tối đa 2.000 ký tự.',
};

export default function GroupPostDetailPage() {
  const g = useOutletContext();
  const { postId } = useParams();
  const navigate = useNavigate();
  const socket = useSocket();
  const toast = useToast();
  const [state, setState] = useState({ status: 'loading', post: null, error: '' });
  const [gone, setGone] = useState(false);
  const [commentsKey, setCommentsKey] = useState(0);
  const [signedAt, setSignedAt] = useState(() => Date.now()); // when the file links were signed (they live one hour)
  const deleting = useRef(false);
  const back = feedPath(g.groupId);

  const load = useCallback(
    (quiet = false) => {
      if (!quiet) setState({ status: 'loading', post: null, error: '' });
      return getGroupPost(postId)
        .then((post) => {
          // A post of another group opened under this group's URL: go to the right group.
          if (post.groupId !== g.groupId) {
            navigate(`/groups/${post.groupId}/feed/${post.postId}`, { replace: true });
            return;
          }
          setGone(false);
          setState({ status: 'ready', post, error: '' });
          setSignedAt(Date.now());
          return post;
        })
        .catch((err) => {
          if (err.status === 404) {
            if (quiet) setGone(true);
            else setState({ status: 'error', post: null, error: errorText(err) });
          } else if (!quiet) {
            setState({ status: 'error', post: null, error: errorText(err) });
          }
        });
    },
    [postId, g.groupId, navigate],
  );

  useEffect(() => {
    load();
  }, [load]);

  const actions = usePostActions((kind, result) => {
    if (kind === 'delete') {
      deleting.current = true;
      navigate(back, { replace: true });
    } else if (result?.postId) {
      setState((s) => ({ ...s, post: { ...s.post, ...result } }));
    } else {
      load(true);
    }
  });

  // Real time: post changes re-read the post; comment signals go to CommentThread (it merges them in place).
  const id = Number(postId);
  useGroupFeedSignals(socket, g.groupId, (event, signal) => {
    if (signal.postId !== id || event !== 'post:changed') return;
    if (signal.change === 'deleted') {
      if (!deleting.current) setGone(true);
    } else {
      load(true);
    }
  });
  const live = useCallback(
    (handlers) => {
      if (!socket) return () => {};
      const onComment = (s) => s?.postId === id && handlers.comment(s);
      const onDeleted = (s) => s?.postId === id && handlers.commentDeleted(s);
      socket.on('post:comment', onComment);
      socket.on('post:comment-deleted', onDeleted);
      return () => {
        socket.off('post:comment', onComment);
        socket.off('post:comment-deleted', onDeleted);
      };
    },
    [socket, id],
  );
  useLiveRefresh(socket, () => {
    if (state.status !== 'ready' || gone) return;
    load(true);
    setCommentsKey((n) => n + 1);
  });

  const commentApi = useMemo(() => groupPostCommentApi(postId), [postId]);
  const onCommentCount = useCallback((commentCount) => {
    setState((s) => (s.post && s.post.commentCount !== commentCount ? { ...s, post: { ...s.post, commentCount } } : s));
  }, []);

  // AttachmentList asks for new links when the old ones expired: read the post again, give back its files.
  const refreshFiles = useCallback(() => load(true).then((p) => p?.attachments ?? null), [load]);

  const post = state.post;
  const onLikeError = (err) => toast(errorText(err), { type: 'error' });
  const buttons = post && !gone ? postActions(post) : [];

  return (
    <div className="feed-article-page gf-detail">
      <div className="feed-article-top">
        <Link to={back} className="back-link">
          <Icon name="arrow_back" size="sm" />
          Bảng tin nhóm
        </Link>
        {buttons.length > 0 && (
          <div className="actions-row feed-article-actions">
            {buttons.map((b) =>
              b.kind === 'edit' ? (
                <Link key="edit" to={`${back}/${post.postId}/edit`} state={{ from: 'detail' }} className="btn btn-secondary">
                  <Icon name={b.icon} size="sm" />
                  Sửa
                </Link>
              ) : (
                <button
                  key={b.kind}
                  type="button"
                  className={`btn ${b.primary ? 'btn-primary' : b.danger ? 'btn-danger' : 'btn-secondary'}`}
                  onClick={() => actions.run(b.kind, post)}
                >
                  <Icon name={b.icon} size="sm" filled={b.kind === 'unpin'} />
                  {b.kind === 'delete' ? 'Xoá' : b.label}
                </button>
              ),
            )}
          </div>
        )}
      </div>

      {state.status === 'error' && (
        <section className="feed-article feed-article-missing">
          <Icon name="search_off" />
          <h1 className="title-md">Không tìm thấy bài viết</h1>
          <p className="muted">{state.error}</p>
          <Link to={back} className="btn btn-primary">
            <Icon name="arrow_back" size="sm" />
            Về bảng tin nhóm
          </Link>
        </section>
      )}

      {state.status === 'loading' && (
        <article className="feed-article" aria-busy="true">
          <div className="feed-article-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </article>
      )}

      {post && (
        <article className="feed-article">
          <div className="feed-article-inner">
            {gone && (
              <div className="notice amber" role="status">
                <Icon name="info" />
                <p>Bài viết đã bị xoá hoặc không còn hiển thị với bạn.</p>
              </div>
            )}
            <p className="gf-article-kind">
              <PostKind post={post} />
            </p>
            <PostMeta post={post} avatarSize={24} className="feed-article-meta caption" />
            <StatusNotice post={post} groupType={g.groupType} />

            {/* The server keeps the line breaks; pre-wrap shows them. */}
            <div className="feed-article-content is-body">{post.content}</div>

            {post.attachments?.length > 0 && (
              // Links signed for one hour; an expired one is renewed by reading the post again (refreshFiles).
              <div className="feed-article-files">
                <AttachmentList attachments={post.attachments} signedAt={signedAt} onRefresh={refreshFiles} headingId="gpd-files-title" />
              </div>
            )}

            {!gone && post.can.interact && (
              <div className="feed-article-interactions">
                <div className="gf-interactions">
                  <PostInteractions post={post} onLikeError={onLikeError} />
                </div>
              </div>
            )}

            {/* Read only (no composer) where commenting is not allowed: hidden post, last year's group. */}
            {!gone && (post.can.interact || post.commentCount > 0) && (
              <div className="feed-article-comments">
                <CommentThread
                  key={post.postId}
                  api={commentApi}
                  initialCount={post.commentCount}
                  onCountChange={onCommentCount}
                  messages={COMMENT_MESSAGES}
                  live={live}
                  refreshKey={commentsKey}
                  canWrite={post.can.interact}
                  enterToSend
                  showReplyTarget
                />
              </div>
            )}
          </div>
        </article>
      )}
      {actions.dialog}
    </div>
  );
}
