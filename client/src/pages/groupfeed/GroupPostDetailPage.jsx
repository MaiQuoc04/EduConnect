import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { getGroupPost, groupPostCommentApi } from '../../api/groupPosts.js';
import CommentThread from '../../components/CommentThread.jsx';
import Icon from '../../components/Icon.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { errorText } from '../../messages.js';
import { useLiveRefresh } from '../schoolfeed/useLiveRefresh.js';
import { feedPath, PostCard, useGroupFeedSignals, usePostActions } from './groupFeedShared.jsx';

// SCR-37 Group Post Detail – UC-37 View Post Detail with UC-41 / UC-42 comments (shared FE-08 CommentThread, fed with
// the /posts/:postId/comments calls), UC-43 like and the author / moderator actions. A tab page inside GroupLayout.

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
  const [state, setState] = useState({ status: 'loading', post: null, error: '' });
  const [gone, setGone] = useState(false);
  const [commentsKey, setCommentsKey] = useState(0);
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

  const post = state.post;

  return (
    <div className="gf gf-detail">
      <Link to={back} className="btn btn-tertiary gf-back">
        <Icon name="arrow_back" size="sm" />
        Bảng tin
      </Link>

      {state.status === 'loading' ? (
        <p className="loading">Đang tải bài viết…</p>
      ) : state.status === 'error' ? (
        <div className="card card-outline gf-empty">
          <Icon name="search_off" />
          <p className="muted">{state.error}</p>
        </div>
      ) : (
        <>
          {gone && (
            <div className="notice amber" role="status">
              <Icon name="info" />
              <p>Bài viết đã bị xoá hoặc không còn hiển thị với bạn.</p>
            </div>
          )}
          <PostCard
            post={gone ? { ...post, can: {} } : post}
            groupId={g.groupId}
            groupType={g.groupType}
            mode="detail"
            onAction={actions.run}
            editState={{ from: 'detail' }}
          />
          {/* Read only (no composer) where commenting is not allowed: hidden post, last year's group. */}
          {!gone && (post.can.interact || post.commentCount > 0) && (
            <section className="card card-outline gf-comments">
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
            </section>
          )}
        </>
      )}
      {actions.dialog}
    </div>
  );
}
