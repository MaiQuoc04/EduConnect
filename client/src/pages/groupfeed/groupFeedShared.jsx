import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  deleteGroupPost,
  groupPostLike,
  hideGroupPost,
  pinGroupPost,
  reviewGroupPost,
} from '../../api/groupPosts.js';
import AttachmentList from '../../components/AttachmentList.jsx';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import ConfirmDialog from '../groups/ConfirmDialog.jsx';
import { CommentCount, formatDateTime, isEdited, LikeButton, useLike } from '../schoolfeed/schoolFeedShared.jsx';
import './GroupFeed.css';

// FE-05 Group Feed (owner: Khanh): pieces shared by SCR-35 Group Feed, SCR-37 Group Post Detail and the form
// (SCR-36 / SCR-38). Like button, comment count, date format and the comment tree come from FE-08 (shared feed code).

export const MAX_POST_LENGTH = 5000; // business-rules §5 (11/11/2026), same as the server
export const postLength = (text) => [...text.normalize('NFC').trim()].length;
export const feedPath = (groupId) => `/groups/${groupId}/feed`;
export const postPath = (groupId, postId) => `${feedPath(groupId)}/${postId}`;

// Who moderates, in words, for the hints (business-rules §5).
export const moderatorName = (groupType) =>
  groupType === 'TEACHER_SCHOOL' ? 'quản lý nhà trường' : 'giáo viên chủ nhiệm';

const PREVIEW_CHARS = 600; // longer posts are cut in the feed, read in full on SCR-37

// Labels of a post that is not simply live (business-rules §5: only the author and the moderator see these posts).
function PostStatus({ post, groupType }) {
  return (
    <>
      {post.isPinned && (
        <span className="stamp gf-stamp">
          <Icon name="push_pin" size="sm" />
          Đã ghim
        </span>
      )}
      {post.approvalStatus === 'PENDING' && <span className="pill amber">Chờ duyệt</span>}
      {post.approvalStatus === 'REJECTED' && <span className="pill red">Đã bị từ chối</span>}
      {post.isHidden && (
        <span className="pill" title={`Bài viết đã bị ẩn bởi ${moderatorName(groupType)}`}>
          Đã ẩn
        </span>
      )}
    </>
  );
}

function StatusNotice({ post, groupType }) {
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

// First picture of a post in the feed (firstImageUrl, signed by the server for one hour). Hidden when it cannot be
// loaded (link expired on a page left open): the file count still shows and the next reload brings a new link.
function PostImage({ src, to }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <Link to={to} className="gf-image" aria-label="Xem bài viết và tệp đính kèm">
      <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    </Link>
  );
}

function Interactions({ post, detailLink, onLikeError }) {
  const like = useLike(post.postId, post.likedByMe, post.likeCount, onLikeError, groupPostLike);
  return (
    <div className="gf-interactions">
      <LikeButton liked={like.likedByMe} count={like.likeCount} onClick={like.toggle} />
      {detailLink ? (
        <Link to={detailLink} className="gf-comments-link">
          <CommentCount count={post.commentCount} />
        </Link>
      ) : (
        <CommentCount count={post.commentCount} />
      )}
    </div>
  );
}

/**
 * One post. mode 'feed' cuts long text, shows the first picture and the number of files, and links to the detail;
 * 'detail' shows everything, files included (post.attachments; signedAt + onRefreshFiles renew expired links, see
 * components/AttachmentList). onAction(kind, post) runs the moderator / author actions (usePostActions). Buttons
 * follow post.can, sent by the server.
 */
export function PostCard({ post, groupId, groupType, mode = 'feed', onAction, editState, signedAt, onRefreshFiles }) {
  const toast = useToast();
  const detail = postPath(groupId, post.postId);
  const long = mode === 'feed' && post.content.length > PREVIEW_CHARS;
  const text = long ? `${post.content.slice(0, PREVIEW_CHARS).trimEnd()}…` : post.content;
  const { can } = post;
  const onLikeError = (err) => toast(errorText(err), { type: 'error' });
  const name = post.authorNickname ? `${post.authorName} (${post.authorNickname})` : post.authorName;

  return (
    <article className={`card card-outline gf-post${post.isPinned ? ' is-pinned' : ''}`} aria-label={`Bài của ${name}`}>
      <header className="gf-post-head">
        <Avatar src={post.authorAvatarUrl} name={post.authorName} size={40} />
        <div className="gf-post-who">
          <span className="gf-author">
            {name}
            {post.authorStatus === 'LOCKED' && <span className="pill red gf-locked">Đã khoá</span>}
          </span>
          <span className="caption muted">
            {mode === 'feed' ? (
              <Link to={detail} className="gf-time">
                {formatDateTime(post.createdAt)}
              </Link>
            ) : (
              formatDateTime(post.createdAt)
            )}
            {isEdited(post) && ' · Đã chỉnh sửa'}
          </span>
        </div>
        <div className="gf-post-status">
          <PostStatus post={post} groupType={groupType} />
        </div>
        <PostMenu post={post} editTo={`${detail}/edit`} editState={editState} onAction={onAction} />
      </header>

      <StatusNotice post={post} groupType={groupType} />

      <p className="gf-content">{text}</p>
      {long && (
        <Link to={detail} className="gf-more">
          Xem tiếp
        </Link>
      )}

      {mode === 'detail'
        ? post.attachments?.length > 0 && (
            <div className="gf-files">
              <AttachmentList attachments={post.attachments} signedAt={signedAt} onRefresh={onRefreshFiles} />
            </div>
          )
        : post.attachmentCount > 0 && (
            <>
              <PostImage src={post.firstImageUrl} to={detail} />
              <Link to={detail} className="gf-file-count caption">
                <Icon name="attach_file" size="sm" />
                {post.attachmentCount} tệp đính kèm
              </Link>
            </>
          )}

      {(can.interact || can.review) && (
        <footer className="gf-post-foot">
          {can.interact && (
            <Interactions post={post} detailLink={mode === 'feed' ? detail : null} onLikeError={onLikeError} />
          )}
          {/* UC-46 stays in sight: the moderator works through the pending queue with these two buttons. */}
          {can.review && (
            <div className="gf-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onAction('approve', post)}>
                <Icon name="check" size="sm" />
                Duyệt
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAction('reject', post)}>
                Từ chối
              </button>
            </div>
          )}
        </footer>
      )}
    </article>
  );
}

/**
 * The "⋮" menu at the top right of a post: pin, hide, edit, delete – only the items post.can allows; no button at all
 * when none is allowed. Closes on a click outside, Esc (focus back on the button) and after choosing.
 */
function PostMenu({ post, editTo, editState, onAction }) {
  const { can } = post;
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

  const items = [
    can.pin && { kind: post.isPinned ? 'unpin' : 'pin', icon: 'push_pin', label: post.isPinned ? 'Bỏ ghim' : 'Ghim bài' },
    can.hide && {
      kind: post.isHidden ? 'unhide' : 'hide',
      icon: post.isHidden ? 'visibility' : 'visibility_off',
      label: post.isHidden ? 'Bỏ ẩn' : 'Ẩn bài',
    },
    can.edit && { kind: 'edit', icon: 'edit', label: 'Sửa bài' },
    can.delete && { kind: 'delete', icon: 'delete', label: 'Xoá bài', danger: true },
  ].filter(Boolean);
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
        className="btn btn-icon gf-menu-trigger"
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

// Actions that ask first (they take the post away from someone's view).
const CONFIRM = {
  delete: {
    title: 'Xoá bài viết?',
    body: 'Bài viết và các bình luận của bài sẽ không còn hiển thị với ai.',
    label: 'Xoá bài',
    busy: 'Đang xoá…',
    icon: 'delete',
  },
  hide: {
    title: 'Ẩn bài viết?',
    body: 'Các thành viên khác sẽ không thấy bài này nữa. Tác giả vẫn thấy bài kèm nhãn đã ẩn. Bạn có thể bỏ ẩn sau.',
    label: 'Ẩn bài',
    busy: 'Đang ẩn…',
    icon: 'visibility_off',
  },
  reject: {
    title: 'Từ chối bài viết?',
    body: 'Bài sẽ không được đăng lên bảng tin. Tác giả có thể sửa và gửi duyệt lại.',
    label: 'Từ chối',
    busy: 'Đang lưu…',
    icon: 'block',
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

/**
 * Runs a post action and reports it. onDone(kind, result, post) gets the server's answer (the post as it is now, or
 * { isDeleted } after a delete). Returns { run, dialog }: render `dialog` once in the page.
 */
export function usePostActions(onDone) {
  const toast = useToast();
  const [asking, setAsking] = useState(null); // { kind, post }
  const busy = useRef(false);

  async function perform(kind, post) {
    const result = await RUN[kind](post);
    toast(DONE[kind]);
    onDone(kind, result, post);
  }

  async function run(kind, post) {
    if (CONFIRM[kind]) {
      setAsking({ kind, post });
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

  const c = asking && CONFIRM[asking.kind];
  const dialog = c ? (
    <ConfirmDialog
      title={c.title}
      confirmLabel={c.label}
      busyLabel={c.busy}
      icon={c.icon}
      onCancel={() => setAsking(null)}
      onConfirm={async () => {
        await perform(asking.kind, asking.post);
        setAsking(null);
      }}
    >
      {c.body}
    </ConfirmDialog>
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
