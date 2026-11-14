import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  deleteGroupPost,
  groupPostLike,
  hideGroupPost,
  pinGroupPost,
  reviewGroupPost,
} from '../../api/groupPosts.js';
import Avatar from '../../components/Avatar.jsx';
import { FeedCardImage, openOnClick } from '../../components/feed/Feed.jsx';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { CommentCount, formatDateTime, isEdited, LikeButton, useLike } from '../schoolfeed/schoolFeedShared.jsx';
import './GroupFeed.css';

// FE-05 Group Feed (owner: Khanh): pieces shared by SCR-35 Group Feed, SCR-37 Group Post Detail and the form
// (SCR-36 / SCR-38). Since 14/11/2026 the feed looks like the school feed: cards, tabs, pager, states and the reading
// canvas are the shared components/feed (feed.css); like button, comment count, date format and the comment tree come
// from FE-08. A group post has no title (business-rules §5): its text is the body of the card.

export const MAX_POST_LENGTH = 5000; // business-rules §5 (11/11/2026), same as the server
export const postLength = (text) => [...text.normalize('NFC').trim()].length;
export const feedPath = (groupId) => `/groups/${groupId}/feed`;
export const postPath = (groupId, postId) => `${feedPath(groupId)}/${postId}`;

// Who moderates, in words, for the hints (business-rules §5).
export const moderatorName = (groupType) =>
  groupType === 'TEACHER_SCHOOL' ? 'quản lý nhà trường' : 'giáo viên chủ nhiệm';

export const authorLabel = (post) =>
  post.authorNickname ? `${post.authorName} (${post.authorNickname})` : post.authorName;

/**
 * The kind line of a post, as the school feed's "THÔNG BÁO · ĐÃ GHIM": what the post is now (business-rules §5).
 * state also names the card's left bar (feed.css .feed-card.is-pending / is-rejected / is-hidden).
 */
export function postKind(post) {
  if (post.isHidden) return { state: 'hidden', icon: 'visibility_off', label: 'Đã ẩn' };
  if (post.approvalStatus === 'REJECTED') return { state: 'rejected', icon: 'block', label: 'Đã bị từ chối' };
  if (post.approvalStatus === 'PENDING') return { state: 'pending', icon: 'hourglass_top', label: 'Chờ duyệt' };
  if (post.isPinned) return { state: 'pinned', icon: 'push_pin', label: 'Bài viết · Đã ghim', filled: true };
  return { state: 'live', icon: 'article', label: 'Bài viết' };
}

export function PostKind({ post }) {
  const kind = postKind(post);
  return (
    <span className={`label-upper feed-kind is-${kind.state}`}>
      <Icon name={kind.icon} size="sm" filled={kind.filled} />
      {kind.label}
    </span>
  );
}

/** Author, time and "Đã chỉnh sửa" – the school feed's meta line. */
export function PostMeta({ post, avatarSize = 20, timeTo, className = 'feed-meta caption' }) {
  const time = formatDateTime(post.createdAt);
  return (
    <p className={className}>
      <Avatar src={post.authorAvatarUrl} name={post.authorName} size={avatarSize} />
      <span className="author">{authorLabel(post)}</span>
      {post.authorStatus === 'LOCKED' && <span className="pill red gf-locked">Đã khoá</span>}
      <span aria-hidden="true">·</span>
      {timeTo ? (
        <Link to={timeTo} className="gf-time">
          <time dateTime={post.createdAt}>{time}</time>
        </Link>
      ) : (
        <time dateTime={post.createdAt}>{time}</time>
      )}
      {isEdited(post) && (
        <span className="chip" title={`Chỉnh sửa lúc ${formatDateTime(post.updatedAt)}`}>
          Đã chỉnh sửa
        </span>
      )}
    </p>
  );
}

/** What the post's state means for the reader – on SCR-37 only (the card says it with its kind line and bar). */
export function StatusNotice({ post, groupType }) {
  const who = moderatorName(groupType);
  if (post.isHidden) {
    return (
      <div className="notice gf-status-notice">
        <Icon name="visibility_off" />
        <p>
          Bài viết đã bị ẩn bởi {who}. Các thành viên khác không còn thấy bài này.
          {post.can?.edit && ' Bạn có thể sửa bài để gửi duyệt lại, hoặc xoá bài.'}
        </p>
      </div>
    );
  }
  if (post.approvalStatus === 'REJECTED') {
    return (
      <div className="notice gf-status-notice">
        <Icon name="block" />
        <p>Bài viết đã bị từ chối. Bạn có thể sửa và gửi duyệt lại, hoặc xoá bài.</p>
      </div>
    );
  }
  if (post.approvalStatus === 'PENDING') {
    return (
      <div className="notice amber gf-status-notice">
        <Icon name="hourglass_top" />
        <p>Bài viết đang chờ {who} duyệt. Bài sẽ hiện trên bảng tin sau khi được duyệt.</p>
      </div>
    );
  }
  return null;
}

/** Like + comment count (UC-43), as the school feed. */
export function PostInteractions({ post, onLikeError }) {
  const like = useLike(post.postId, post.likedByMe, post.likeCount, onLikeError, groupPostLike);
  return (
    <>
      <LikeButton liked={like.likedByMe} count={like.likeCount} onClick={like.toggle} />
      <CommentCount count={post.commentCount} />
    </>
  );
}

/**
 * One post in the feed (SCR-35), laid out like a school feed card: kind line with the "⋮" menu, the text (a few lines)
 * with the meta line under it and the first picture on the right, then likes / comments / files and, for the
 * moderator, "Duyệt" / "Từ chối". The whole card opens SCR-37. Buttons follow post.can, sent by the server.
 */
export function PostCard({ post, groupId, onAction, listState }) {
  const toast = useToast();
  const navigate = useNavigate();
  const detail = postPath(groupId, post.postId);
  const { can } = post;
  const kind = postKind(post);
  const onLikeError = (err) => toast(errorText(err), { type: 'error' });
  const hasFoot = can.interact || can.review || post.attachmentCount > 0;
  const classes = ['feed-card', kind.state !== 'live' && `is-${kind.state}`, !hasFoot && 'no-foot'];

  return (
    <article
      className={classes.filter(Boolean).join(' ')}
      onClick={openOnClick(navigate, detail, listState)}
      aria-label={`Bài của ${authorLabel(post)}`}
    >
      <div className="feed-card-top">
        <PostKind post={post} />
        <PostMenu post={post} editTo={`${detail}/edit`} editState={{ from: 'feed' }} onAction={onAction} />
      </div>
      <div className="feed-card-body">
        <div className="feed-card-text">
          <p className="feed-preview is-body">{post.content}</p>
          <PostMeta post={post} timeTo={detail} />
        </div>
        <FeedCardImage src={post.firstImageUrl} />
      </div>
      {hasFoot && (
        <div className="feed-card-foot">
          {can.interact && <PostInteractions post={post} onLikeError={onLikeError} />}
          {post.attachmentCount > 0 && (
            <span className="sf-attachments caption">
              <Icon name="attach_file" size="sm" />
              {post.attachmentCount} tệp đính kèm
            </span>
          )}
          {/* UC-46 stays in sight: the moderator works through the pending queue with these two buttons. */}
          {can.review && (
            <div className="feed-card-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onAction('approve', post)}>
                <Icon name="check" size="sm" />
                Duyệt
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAction('reject', post)}>
                Từ chối
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/** The author / moderator actions a post allows, in display order (menu on SCR-35, buttons on SCR-37). */
export function postActions(post) {
  const { can } = post;
  return [
    can.review && { kind: 'approve', icon: 'check', label: 'Duyệt', primary: true },
    can.review && { kind: 'reject', icon: 'block', label: 'Từ chối' },
    can.pin && { kind: post.isPinned ? 'unpin' : 'pin', icon: 'push_pin', label: post.isPinned ? 'Bỏ ghim' : 'Ghim bài' },
    can.hide && {
      kind: post.isHidden ? 'unhide' : 'hide',
      icon: post.isHidden ? 'visibility' : 'visibility_off',
      label: post.isHidden ? 'Bỏ ẩn' : 'Ẩn bài',
    },
    can.edit && { kind: 'edit', icon: 'edit', label: 'Sửa bài' },
    can.delete && { kind: 'delete', icon: 'delete', label: 'Xoá bài', danger: true },
  ].filter(Boolean);
}

/**
 * The "⋮" menu at the top right of a card, where the school feed has its pin button: pin, hide, edit, delete – only
 * the items post.can allows (review stays as buttons in the foot); nothing when none is allowed. Closes on a click
 * outside, Esc (focus back on the button) and after choosing.
 */
function PostMenu({ post, editTo, editState, onAction }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const button = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = postActions(post).filter((item) => item.kind !== 'approve' && item.kind !== 'reject');
  if (!items.length) return null;

  const choose = (kind) => {
    setOpen(false);
    onAction(kind, post);
  };

  return (
    <div className="gf-menu" ref={ref}>
      <button
        ref={button}
        type="button"
        className="btn btn-icon feed-card-tool gf-menu-trigger"
        aria-label="Thao tác với bài viết"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="more_vert" />
      </button>
      {open && (
        <div className="gf-menu-list" role="menu" id={menuId}>
          {items.map((item) =>
            item.kind === 'edit' ? (
              <Link key="edit" to={editTo} state={editState} role="menuitem" className="gf-menu-item">
                <Icon name={item.icon} size="sm" />
                {item.label}
              </Link>
            ) : (
              <button
                key={item.kind}
                type="button"
                role="menuitem"
                className={`gf-menu-item${item.danger ? ' is-danger' : ''}`}
                onClick={() => choose(item.kind)}
              >
                <Icon name={item.icon} size="sm" />
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

// Actions that ask first (they take the post away from someone's view). Same dialog as the school feed (.sf-dialog).
const CONFIRM = {
  delete: {
    title: 'Xoá bài viết?',
    body: 'Sau khi xoá, bài viết và các bình luận của bài không còn hiển thị với ai trong nhóm.',
    label: 'Xoá bài viết',
    busy: 'Đang xoá…',
    icon: 'delete',
    keep: 'Giữ lại',
    danger: true,
  },
  hide: {
    title: 'Ẩn bài viết?',
    body: 'Các thành viên khác sẽ không thấy bài này nữa. Tác giả vẫn thấy bài kèm nhãn đã ẩn. Bạn có thể bỏ ẩn sau.',
    label: 'Ẩn bài',
    busy: 'Đang ẩn…',
    icon: 'visibility_off',
    keep: 'Quay lại',
  },
  reject: {
    title: 'Từ chối bài viết?',
    body: 'Bài sẽ không được đăng lên bảng tin. Tác giả có thể sửa và gửi duyệt lại.',
    label: 'Từ chối',
    busy: 'Đang lưu…',
    icon: 'block',
    keep: 'Quay lại',
  },
};

const RUN = {
  approve: (p) => reviewGroupPost(p.postId, 'APPROVE'),
  reject: (p) => reviewGroupPost(p.postId, 'REJECT'),
  pin: (p) => pinGroupPost(p.postId, true),
  unpin: (p) => pinGroupPost(p.postId, false),
  hide: (p) => hideGroupPost(p.postId, true),
  unhide: (p) => hideGroupPost(p.postId, false),
  delete: (p) => deleteGroupPost(p.postId),
};

const DONE = {
  approve: 'Đã duyệt bài viết.',
  reject: 'Đã từ chối bài viết.',
  pin: 'Đã ghim bài viết.',
  unpin: 'Đã bỏ ghim bài viết.',
  hide: 'Đã ẩn bài viết.',
  unhide: 'Đã bỏ ẩn bài viết.',
  delete: 'Đã xoá bài viết.',
};

const QUOTE_CHARS = 140;

/**
 * Native <dialog> in the school feed's style (.sf-dialog): icon + title, the text quoted (optional), what will happen,
 * the safe button focused. config: { icon, title, body, label, busy, keep, danger }.
 */
export function FeedConfirmDialog({ config, quote, busy, onCancel, onConfirm }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    return () => dialog.open && dialog.close();
  }, []);
  const text = quote && quote.length > QUOTE_CHARS ? `${quote.slice(0, QUOTE_CHARS).trimEnd()}…` : quote;
  return (
    <dialog
      ref={ref}
      className="sf-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className={`sf-dialog-head${config.danger ? ' is-danger' : ''}`}>
        <Icon name={config.icon} />
        <h2 id={titleId} className="title-sm">
          {config.title}
        </h2>
      </div>
      {text && <p className="sf-dialog-quote gf-dialog-quote">{text}</p>}
      <div className={`notice${config.danger ? ' amber' : ''}`}>
        <Icon name={config.danger ? 'warning' : 'info'} size="sm" />
        <p>{config.body}</p>
      </div>
      <div className="sf-dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy} autoFocus>
          {config.keep}
        </button>
        <button
          type="button"
          className={`btn btn-primary${config.danger ? ' sf-btn-danger' : ''}`}
          onClick={onConfirm}
          disabled={busy}
        >
          <Icon name={busy ? 'progress_activity' : config.icon} size="sm" className={busy ? 'sf-spin' : undefined} />
          {busy ? config.busy : config.label}
        </button>
      </div>
    </dialog>
  );
}

/**
 * Runs a post action and reports it. onDone(kind, result, post) gets the server's answer (the post as it is now, or
 * { isDeleted } after a delete). Returns { run, dialog }: render `dialog` once in the page.
 */
export function usePostActions(onDone) {
  const toast = useToast();
  const [asking, setAsking] = useState(null); // { kind, post, busy }
  const busy = useRef(false);

  async function perform(kind, post) {
    const result = await RUN[kind](post);
    toast(DONE[kind]);
    onDone(kind, result, post);
  }

  async function run(kind, post) {
    if (CONFIRM[kind]) {
      setAsking({ kind, post, busy: false });
      return;
    }
    if (busy.current) return;
    busy.current = true;
    try {
      await perform(kind, post);
    } catch (err) {
      toast(errorText(err), { type: 'error' });
      if (err.status === 404 || err.status === 409) onDone('stale', null, post);
    } finally {
      busy.current = false;
    }
  }

  async function confirm() {
    const { kind, post } = asking;
    setAsking((a) => ({ ...a, busy: true }));
    try {
      await perform(kind, post);
      setAsking(null);
    } catch (err) {
      setAsking(null);
      toast(errorText(err), { type: 'error' });
      if (err.status === 404 || err.status === 409) onDone('stale', null, post);
    }
  }

  const dialog = asking ? (
    <FeedConfirmDialog
      key={`${asking.kind}-${asking.post.postId}`}
      config={CONFIRM[asking.kind]}
      quote={asking.post.content}
      busy={asking.busy}
      onCancel={() => setAsking(null)}
      onConfirm={confirm}
    />
  ) : null;

  return { run, dialog };
}

/**
 * FE-05 real-time signals of one group (server posts.service.js): post:changed, post:comment, post:comment-deleted,
 * feed:settings – ids only, on the user's own room. onSignal(event, payload) for this group's signals. Only the
 * listeners added here are removed (the socket is shared with the chat).
 */
export function useGroupFeedSignals(socket, groupId, onSignal) {
  const handler = useRef(onSignal);
  useEffect(() => {
    handler.current = onSignal;
  });
  useEffect(() => {
    if (!socket || !groupId) return undefined;
    const events = ['post:changed', 'post:comment', 'post:comment-deleted', 'feed:settings'];
    const listeners = events.map((event) => {
      const fn = (payload) => payload?.groupId === Number(groupId) && handler.current(event, payload);
      socket.on(event, fn);
      return [event, fn];
    });
    return () => listeners.forEach(([event, fn]) => socket.off(event, fn));
  }, [socket, groupId]);
}
