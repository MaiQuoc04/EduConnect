import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  PostMenu,
  PostKind,
  PostMeta,
  StatusNotice,
  useGroupFeedSignals,
  usePostActions,
} from './groupFeedShared.jsx';

// One group post read in full – UC-37 View Post Detail with UC-41 / UC-42 comments (shared FE-08 CommentThread),
// UC-43 like and the author / moderator actions. Shown in the feed's pop-up (PostDialog, 14/11/2026) and on the
// SCR-37 page (old links, notifications). Layout as the school post detail (components/feed .feed-article*): the
// reading canvas – kind line, meta, the state notice, the text, files, like / comment bar and the comments – and the
// actions as buttons at the top right.
// Props: g (the group: groupId, groupType), postId; leading / trailing: what sits left / right of the action buttons
// (back link, close button); editState: router state for the edit form (where to come back); onDeleted(); onChanged()
// after any action (the feed reads its page again); actionsMenu: pin / hide / edit / delete in the "⋮" menu as on the
// feed's cards (the pop-up), "Duyệt" / "Từ chối" stay buttons; without it every action is a button (the page).

// Codes the shared CommentThread does not know itself.
const COMMENT_MESSAGES = {
  MSG_POST_NOT_FOUND: 'Không tìm thấy bài viết.',
  MSG_POST_NOT_INTERACTIVE: 'Chỉ bình luận được bài đã duyệt và đang hiển thị.',
  MSG_TEXT_TOO_LONG: 'Bình luận tối đa 2.000 ký tự.',
};

export default function PostDetail({ g, postId, leading, trailing, editState, onDeleted, onChanged, titleId, actionsMenu }) {
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
            return undefined;
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
      onDeleted?.();
    } else if (result?.postId) {
      setState((s) => ({ ...s, post: { ...s.post, ...result } }));
    } else {
      load(true);
    }
    onChanged?.();
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
  const all = post && !gone ? postActions(post) : [];
  const buttons = actionsMenu ? all.filter((b) => b.kind === 'approve' || b.kind === 'reject') : all;
  const inMenu = actionsMenu && all.some((b) => b.kind !== 'approve' && b.kind !== 'reject');

  return (
    <>
      <div className="feed-article-top">
        {leading}
        {(buttons.length > 0 || inMenu || trailing) && (
          <div className="actions-row feed-article-actions">
            {buttons.map((b) =>
              b.kind === 'edit' ? (
                <Link key="edit" to={`${back}/${post.postId}/edit`} state={editState} className="btn btn-secondary">
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
            {inMenu && (
              <PostMenu
                post={post}
                editTo={`${back}/${post.postId}/edit`}
                editState={editState}
                onAction={actions.run}
                triggerClass="btn btn-icon gf-dialog-menu"
              />
            )}
            {trailing}
          </div>
        )}
      </div>

      {state.status === 'error' && (
        <section className="feed-article feed-article-missing">
          <Icon name="search_off" />
          <h1 id={titleId} className="title-md">
            Không tìm thấy bài viết
          </h1>
          <p className="muted">{state.error}</p>
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
        <article className="feed-article" aria-labelledby={titleId}>
          <div className="feed-article-inner">
            {gone && (
              <div className="notice amber" role="status">
                <Icon name="info" />
                <p>Bài viết đã bị xoá hoặc không còn hiển thị với bạn.</p>
              </div>
            )}
            <p className="gf-article-kind" id={titleId}>
              <PostKind post={post} />
            </p>
            <PostMeta post={post} avatarSize={24} className="feed-article-meta caption" />
            <StatusNotice post={post} groupType={g.groupType} />

            {/* The server keeps the line breaks; pre-wrap shows them. */}
            <div className="feed-article-content is-body">{post.content}</div>

            {post.attachments?.length > 0 && (
              // Links signed for one hour; an expired one is renewed by reading the post again (refreshFiles).
              <div className="feed-article-files">
                <AttachmentList
                  attachments={post.attachments}
                  signedAt={signedAt}
                  onRefresh={refreshFiles}
                  headingId={`gpd-files-${post.postId}`}
                />
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
    </>
  );
}
