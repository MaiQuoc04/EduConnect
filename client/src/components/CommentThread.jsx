import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { errorText } from '../messages.js';
import { formatDate } from '../utils/format.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import './CommentThread.css';

/*
 * Shared comment tree of a feed post. Built for FE-08 School Feed (UC-65 / UC-66 on SCR-05, owner Anh) and meant to be
 * reused as is by FE-05 Group Feed (Khanh): the component knows nothing about WHICH post, WHO may delete or WHICH
 * socket events exist – it gets the API calls and an optional live-signal subscription as parameters and trusts the
 * server's `canDelete` flag on every comment.
 *
 * Server contract (server/src/utils/feedInteractions.js listComments / insertComment, shared by both feeds):
 *   - list: a tree paged by TOP-LEVEL comment, NEWEST top-level first (since 09/11/2026); each top-level comment comes
 *     with ALL its replies at every level in `replies`, OLDEST first, so a conversation is never cut between two
 *     pages. `total` = top-level comments; `commentCount` = the post's visible comment count.
 *   - a node: { commentId, parentCommentId, content, createdAt, updatedAt, authorId, authorName, authorAvatarUrl,
 *     isDeleted, canDelete, replies }. A deleted comment is returned only while a reply below it is still visible,
 *     with content / author fields null and canDelete false; it is shown as "Bình luận đã bị xoá" and cannot be
 *     answered (the server answers 409 MSG_PARENT_COMMENT_DELETED).
 *   - create returns the new node (replies: [], canDelete: true), without commentCount.
 *   - remove returns { commentCount } (soft delete; replies stay).
 *
 * Real time (optional, `live` + `refreshKey`): signals only, never content. On a signal the component reads the
 * comments again and merges them into what is shown ("sync"): same `key` per comment, so React keeps every node, the
 * reply box and its text; the drafts and `replyTo` live in this component's state, not in the nodes; the pages already
 * opened with "Xem thêm" stay; the scroll position is kept on the comment being read (see captureAnchor).
 */

const PAGE_SIZE = 10; // top-level comments per "Xem thêm" page (server maximum 50)
const SYNC_PAGE_SIZE = 50; // a sync reads the shown window in pages of 50 (server maximum)
// ASSUMPTION: a sync reads at most the 100 newest top-level comments (2 requests); older pages that were opened stay
// as they were until the next full load. Nobody reads 100 threads under one school post.
const MAX_SYNC_ROOTS = 100;
const SYNC_DELAY_MS = 250; // signals arriving together are read with one request
export const MAX_COMMENT_LENGTH = 2000; // same limit as the server (ASSUMPTION there: the chat message limit, §6)
const COUNTER_FROM = 200; // the "characters left" counter shows when this close to the limit
// Indent levels: level 1 (top-level) is flush, level 2 is indented once, level 3 twice; from level 4 on the indent
// stays the same (deeper replies show "trả lời <tên>" instead), so a deep tree never squeezes the text on a phone.
const MAX_INDENT_DEPTH = 2; // depth is 0-based: depth 2 = level 3

// TODO FE-08 / FE-05: move these to messages.js once the lead approves the codes (waiting list in the FE-08 summary).
const COMMENT_MESSAGES = {
  MSG_COMMENT_NOT_FOUND: 'Không tìm thấy bình luận.',
  MSG_INVALID_PARENT_COMMENT: 'Bình luận gốc không thuộc bài viết này.',
  MSG_PARENT_COMMENT_DELETED: 'Bình luận này đã bị xoá, không thể trả lời.',
  MSG_REQUIRED: 'Trường này là bắt buộc.',
};
const REPLY_TARGET_GONE = 'Bình luận này đã bị xoá. Nội dung bạn đang gõ đã được chuyển vào ô bình luận ở đầu danh sách.';

const cleanContent = (text) => text.normalize('NFC').trim();
const lengthOf = (text) => [...cleanContent(text)].length;

// "2026-11-08 23:50:11.638814+07" (Vietnam time from the API) -> "23:50, 08/11/2026"
function formatDateTime(value) {
  if (!value) return '';
  return `${String(value).slice(11, 16)}, ${formatDate(value)}`;
}

// --- Tree helpers (pure) ---------------------------------------------------------------------------------------

function findNode(nodes, commentId) {
  for (const node of nodes) {
    if (node.commentId === commentId) return node;
    const found = node.replies.length ? findNode(node.replies, commentId) : null;
    if (found) return found;
  }
  return null;
}

function collectIds(nodes, into = new Set()) {
  for (const node of nodes) {
    into.add(node.commentId);
    collectIds(node.replies, into);
  }
  return into;
}

// A new reply goes to the END of its parent's replies (replies are oldest first). Never twice.
function insertReply(nodes, parentId, reply) {
  if (findNode(nodes, reply.commentId)) return nodes;
  const walk = (list) =>
    list.map((node) => {
      if (node.commentId === parentId) return { ...node, replies: [...node.replies, reply] };
      return node.replies.length ? { ...node, replies: walk(node.replies) } : node;
    });
  return walk(nodes);
}

const asDeleted = (node) => ({
  ...node,
  isDeleted: true,
  content: null,
  authorId: null,
  authorName: null,
  authorAvatarUrl: null,
  canDelete: false,
});

function markDeleted(nodes, commentId) {
  return nodes.map((node) => {
    if (node.commentId === commentId) return asDeleted(node);
    return node.replies.length ? { ...node, replies: markDeleted(node.replies, commentId) } : node;
  });
}

// Same rule as the server's buildTree: a deleted comment stays only while something visible is below it.
function prune(nodes) {
  return nodes.flatMap((node) => {
    const replies = prune(node.replies);
    if (node.isDeleted && !replies.length) return [];
    return [{ ...node, replies }];
  });
}

const removeComment = (nodes, commentId) => prune(markDeleted(nodes, commentId));

/**
 * Merges a fresh read of the newest `fetched.length` top-level comments into the shown list. The fresh threads replace
 * the shown ones (the server is right about every node in its window). When the window was full (`full`), the shown
 * threads older than the window – opened with "Xem thêm" – are kept after it: they are the ones after the last shown
 * thread the server returned. Threads missing inside the window were deleted and go away.
 */
function mergeWindow(shown, fetched, full) {
  if (!full) return fetched;
  const fresh = new Set(fetched.map((n) => n.commentId));
  let last = -1;
  shown.forEach((node, i) => {
    if (fresh.has(node.commentId)) last = i;
  });
  const tail = shown.slice(last + 1).filter((node) => !fresh.has(node.commentId));
  return [...fetched, ...tail];
}

// --- Pieces ----------------------------------------------------------------------------------------------------

/**
 * Text box + Send. The text is owned by the thread (drafts survive syncs and a deleted reply target), so it is
 * controlled: text / setText. onSubmit(content) resolves { ok: true } or { error: 'Vietnamese text' }; never rejects.
 */
function Composer({ text, setText, onSubmit, placeholder, replyingTo, onCancel, autoFocus, user }) {
  const id = useId();
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const busy = useRef(false); // a second click before React re-renders must not send twice
  const length = lengthOf(text);
  const left = MAX_COMMENT_LENGTH - length;
  const canSend = length > 0 && left >= 0 && !sending;

  async function send(e) {
    e?.preventDefault();
    if (busy.current || !canSend) return;
    busy.current = true;
    setSending(true);
    setError('');
    const result = await onSubmit(cleanContent(text));
    busy.current = false;
    setSending(false);
    if (result.ok) setText('');
    else if (result.error) setError(result.error);
  }

  const describedBy = [left <= COUNTER_FROM && `${id}-count`, error && `${id}-error`].filter(Boolean).join(' ');
  return (
    <form className={`ct-composer${replyingTo ? ' is-reply' : ''}`} onSubmit={send} noValidate>
      {replyingTo && (
        <p className="ct-composer-replying caption">
          <Icon name="reply" size="sm" />
          <span>
            Đang trả lời <span className="ct-strong">{replyingTo}</span>
          </span>
        </p>
      )}
      <div className="ct-composer-row">
        {user && !replyingTo && (
          <span className="ct-composer-avatar">
            <Avatar src={user.avatarUrl} name={user.fullName ?? ''} size={32} />
          </span>
        )}
        <div className="ct-composer-box">
          <label htmlFor={`${id}-text`} className="ct-visually-hidden">
            {replyingTo ? `Trả lời ${replyingTo}` : 'Viết bình luận'}
          </label>
          <textarea
            id={`${id}-text`}
            className="input ct-composer-input"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e);
              if (e.key === 'Escape' && onCancel && !sending) onCancel();
            }}
            placeholder={placeholder}
            rows={replyingTo ? 2 : 3}
            autoFocus={autoFocus}
            disabled={sending}
            aria-invalid={left < 0 || Boolean(error)}
            aria-describedby={describedBy || undefined}
          />
          <div className="ct-composer-foot">
            <span className="caption muted ct-composer-hint">
              {left <= COUNTER_FROM ? (
                <span id={`${id}-count`} className={`mono${left < 0 ? ' ct-over' : ''}`} aria-live="polite">
                  {left >= 0
                    ? `Còn ${left.toLocaleString('vi-VN')} ký tự`
                    : `Vượt ${(-left).toLocaleString('vi-VN')} ký tự, tối đa ${MAX_COMMENT_LENGTH.toLocaleString('vi-VN')}`}
                </span>
              ) : (
                'Ctrl + Enter để gửi'
              )}
            </span>
            <div className="ct-composer-buttons">
              {onCancel && (
                <button type="button" className="btn btn-tertiary" onClick={onCancel} disabled={sending}>
                  Huỷ
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={!canSend}>
                <Icon name={sending ? 'progress_activity' : 'send'} size="sm" className={sending ? 'ct-spin' : undefined} />
                {sending ? 'Đang gửi…' : 'Gửi'}
              </button>
            </div>
          </div>
          {error && (
            <p id={`${id}-error`} className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}

function CommentNode({ node, depth, parentName, reply, onDelete }) {
  const deleted = node.isDeleted;
  const edited = Boolean(node.updatedAt) && node.updatedAt !== node.createdAt;
  const flat = depth >= MAX_INDENT_DEPTH; // the replies of this node are not indented any further
  const replying = !deleted && reply.to === node.commentId;
  return (
    <li className="ct-node">
      {deleted ? (
        <div className="ct-comment is-deleted" data-comment-id={node.commentId}>
          <span className="ct-deleted-mark" aria-hidden="true">
            <Icon name="block" size="sm" />
          </span>
          <p className="ct-deleted-text">Bình luận đã bị xoá</p>
        </div>
      ) : (
        <article className="ct-comment" data-comment-id={node.commentId} aria-label={`Bình luận của ${node.authorName}`}>
          <span className="ct-avatar">
            <Avatar src={node.authorAvatarUrl} name={node.authorName ?? ''} size={32} />
          </span>
          <div className="ct-body">
            <div className="ct-meta">
              <span className="ct-author">{node.authorName}</span>
              {depth > MAX_INDENT_DEPTH && (
                <span className="caption muted ct-to">
                  <Icon name="subdirectory_arrow_right" size="sm" />
                  trả lời {parentName ?? 'bình luận đã xoá'}
                </span>
              )}
              <time className="caption muted" dateTime={node.createdAt}>
                {formatDateTime(node.createdAt)}
              </time>
              {edited && (
                <span className="chip" title={`Chỉnh sửa lúc ${formatDateTime(node.updatedAt)}`}>
                  Đã chỉnh sửa
                </span>
              )}
            </div>
            <p className="ct-content">{node.content}</p>
            <div className="ct-actions">
              <button type="button" className="ct-action" onClick={() => reply.toggle(node.commentId)} aria-expanded={replying}>
                <Icon name="reply" size="sm" />
                Trả lời
              </button>
              {node.canDelete && (
                <button type="button" className="ct-action is-danger" onClick={() => onDelete(node)}>
                  <Icon name="delete" size="sm" />
                  Xoá
                </button>
              )}
            </div>
          </div>
        </article>
      )}

      {replying && (
        <div className={`ct-reply-box${flat ? ' is-flat' : ''}`}>
          <Composer
            text={reply.text}
            setText={reply.setText}
            onSubmit={(content) => reply.submit(node.commentId, content)}
            onCancel={reply.cancel}
            replyingTo={node.authorName}
            placeholder={`Trả lời ${node.authorName}…`}
            autoFocus
          />
        </div>
      )}

      {node.replies.length > 0 && (
        <ul className={`ct-replies${flat ? ' is-flat' : ''}`}>
          {node.replies.map((child) => (
            <CommentNode
              key={child.commentId}
              node={child}
              depth={depth + 1}
              parentName={deleted ? null : node.authorName}
              reply={reply}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// UC-66 confirmation (native <dialog>, .sf-dialog styles in styles.css). The safe button gets the focus.
function DeleteDialog({ comment, busy, onCancel, onConfirm }) {
  const ref = useRef(null);
  const open = Boolean(comment);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const hasReplies = Boolean(comment?.replies.length);
  return (
    <dialog
      ref={ref}
      className="sf-dialog"
      aria-labelledby="ct-delete-title"
      aria-describedby="ct-delete-desc"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="sf-dialog-head is-danger">
        <Icon name="delete" />
        <h2 id="ct-delete-title" className="title-sm">
          Xoá bình luận?
        </h2>
      </div>
      <div id="ct-delete-desc">
        {comment?.content && <p className="ct-dialog-quote">{comment.content}</p>}
        <div className="notice amber">
          <Icon name="warning" size="sm" />
          <p>
            Bình luận sẽ không còn hiển thị với bất kỳ ai.
            {hasReplies && ' Các trả lời bên dưới vẫn được giữ, chỗ bình luận này sẽ ghi "Bình luận đã bị xoá".'}
          </p>
        </div>
      </div>
      <div className="sf-dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy} autoFocus>
          Giữ lại
        </button>
        <button type="button" className="btn btn-primary sf-btn-danger" onClick={onConfirm} disabled={busy}>
          <Icon name={busy ? 'progress_activity' : 'delete'} size="sm" className={busy ? 'ct-spin' : undefined} />
          {busy ? 'Đang xoá…' : 'Xoá bình luận'}
        </button>
      </div>
    </dialog>
  );
}

/**
 * Comment tree of one post: count heading, composer, nested comments with reply / delete, "load more" by top-level
 * comment, optional real-time updates. Give it a `key` of the post id so it starts fresh for another post.
 *
 * @param {object} props
 * @param {object} props.api The calls for THIS post (FE-08: /school-posts/:id/comments; FE-05: /posts/:id/comments):
 *   - list({ page, pageSize }, { signal }) → Promise<{ items, total, commentCount }>
 *   - create({ content, parentCommentId? }) → Promise<node>   (parentCommentId only for a reply)
 *   - remove(commentId) → Promise<{ commentCount }>
 * @param {number} [props.initialCount] the post's commentCount already known (shown until the first page arrives)
 * @param {(count: number) => void} [props.onCountChange] called when the count changes (to refresh a counter elsewhere)
 * @param {Record<string, string>} [props.messages] extra Vietnamese texts by error code for feature-specific codes
 *   (e.g. FE-08 MSG_CANNOT_COMMENT_NEWS); checked before the comment codes above and messages.js
 * @param {string} [props.title] heading text, default "Bình luận"
 * @param {(handlers: { comment: Function, commentDeleted: Function }) => (() => void)} [props.live] real-time
 *   subscription (stable function, e.g. useCallback): called with the handlers, returns the unsubscribe function.
 *   comment({ commentId, parentCommentId, authorId }) / commentDeleted({ commentId }) are SIGNALS only; the component
 *   reads the comments again itself. FE-08 wires "schoolpost:comment" / "schoolpost:comment-deleted"; FE-05 wires its
 *   own event names. Remove exactly the handlers you added (never socket.off(event) without a handler: the socket is
 *   shared with the chat).
 * @param {number} [props.refreshKey] change it to make the component read the comments again the same way (after a
 *   reconnect, a tab shown again, a poll while the socket is down).
 * Who may delete is the server's `canDelete`; the component never decides it (FE-05 §5 and FE-08 §8 differ).
 */
export default function CommentThread({
  api,
  initialCount = 0,
  onCountChange,
  messages,
  title = 'Bình luận',
  live,
  refreshKey = 0,
}) {
  const toast = useToast();
  const { user } = useAuth();
  const headingId = useId();
  const [roots, setRoots] = useState([]); // the server's newest top-level comments, in its order
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(initialCount);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [loadError, setLoadError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [mainText, setMainText] = useState('');
  const [deleting, setDeleting] = useState(null); // { comment, busy }
  const [attempt, setAttempt] = useState(0);
  const [newAbove, setNewAbove] = useState([]); // ids of others' new comments inserted above the screen
  const mounted = useRef(true);
  const apiRef = useRef(api);
  const countChanged = useRef(onCountChange);
  const state = useRef({ roots, status }); // latest values for the async sync
  const listRef = useRef(null);
  const anchor = useRef(null); // { id, top, before: Set } captured just before a sync is shown
  const scrollTo = useRef(null); // id of an own comment to bring into view after it is rendered
  const ownIds = useRef(new Set()); // comments this tab wrote: their echo is ignored
  const inflight = useRef(null); // the create request on its way (its echo can arrive before its answer)
  const sync = useRef({ timer: null, running: false, again: false, newRoots: 0 });

  useEffect(() => {
    apiRef.current = api;
    countChanged.current = onCountChange;
    state.current = { roots, status };
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(sync.current.timer);
    };
  }, []);

  const textOf = (err, fallback, tag) => {
    const code = err?.code;
    if (messages?.[code]) return messages[code];
    if (COMMENT_MESSAGES[code]) return COMMENT_MESSAGES[code];
    if (code === 'MSG_INVALID_PARAM' && err.details?.field === 'content') {
      return `Bình luận tối đa ${MAX_COMMENT_LENGTH.toLocaleString('vi-VN')} ký tự.`;
    }
    const generic = errorText({ code: 'SERVER_ERROR' });
    const text = errorText({ code, details: err?.details });
    if (text === generic && code !== 'SERVER_ERROR') {
      console.warn(`[CommentThread${tag ? ` ${tag}` : ''}] No Vietnamese message for error code ${code}:`, err?.message);
      return fallback;
    }
    return text;
  };

  // First page (again after "Thử lại" or when the tree must be read from scratch).
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    apiRef.current
      .list({ page: 1, pageSize: PAGE_SIZE }, { signal: controller.signal })
      .then((data) => {
        setRoots(data.items);
        setTotal(data.total);
        setCount(data.commentCount);
        setNewAbove([]);
        setStatus('ready');
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLoadError(textOf(err, 'Không tải được bình luận. Vui lòng thử lại.', 'list'));
        setStatus('error');
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    countChanged.current?.(count);
  }, [count]);

  const reload = () => {
    setReplyTo(null);
    setReplyText('');
    setAttempt((n) => n + 1);
  };
  const remaining = Math.max(0, total - roots.length);

  /**
   * Scroll anchoring: when the top of the list is above the screen (the reader is inside the comments), remember the
   * first comment row still on screen and its distance to the top of the window. After the new tree is rendered the
   * window is scrolled by the difference, so what is being read does not move whatever was inserted above it.
   * When the top of the list is visible, nothing is anchored: new comments simply appear (Facebook case a).
   */
  function captureAnchor() {
    const list = listRef.current;
    if (!list || list.getBoundingClientRect().top >= 0) return null;
    for (const el of list.querySelectorAll('[data-comment-id]')) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom > 0) return { id: el.dataset.commentId, top: rect.top };
    }
    return null;
  }

  /**
   * Partial update ("sync"): reads the newest top-level comments again – as many as are shown, plus the new top-level
   * comments announced by signals – and merges them (mergeWindow). Nothing is unmounted: no loading state, the nodes
   * keep their keys, the drafts and replyTo are state of this component. Calls are serialized; signals during a
   * running sync make it run once more.
   */
  const runSync = useCallback(async () => {
    const s = sync.current;
    if (s.running) {
      s.again = true;
      return;
    }
    if (state.current.status !== 'ready') return; // the first load is on its way and will be fresh
    s.running = true;
    try {
      do {
        s.again = false;
        const shown = state.current.roots;
        const want = Math.min(Math.max(shown.length, PAGE_SIZE) + s.newRoots, MAX_SYNC_ROOTS);
        s.newRoots = 0;
        const items = [];
        let data = null;
        for (let page = 1; items.length < want; page += 1) {
          data = await apiRef.current.list({ page, pageSize: SYNC_PAGE_SIZE });
          items.push(...data.items);
          if (data.items.length < SYNC_PAGE_SIZE) break;
        }
        if (!mounted.current) return;
        const fetched = items.slice(0, want);
        const merged = mergeWindow(state.current.roots, fetched, fetched.length >= want);
        anchor.current = { ...(captureAnchor() ?? {}), before: collectIds(state.current.roots) };
        state.current = { ...state.current, roots: merged };
        setRoots(merged);
        setTotal(data.total);
        setCount(data.commentCount);
      } while (s.again && mounted.current);
    } catch {
      // A failed sync changes nothing on screen; the next signal, reconnect or poll tries again.
    } finally {
      s.running = false;
    }
  }, []);

  const scheduleSync = useCallback(() => {
    clearTimeout(sync.current.timer);
    sync.current.timer = setTimeout(runSync, SYNC_DELAY_MS);
  }, [runSync]);

  // After a sync is rendered: keep the anchor in place, then note the others' new comments above the screen.
  useLayoutEffect(() => {
    const a = anchor.current;
    anchor.current = null;
    const list = listRef.current;
    if (a && list) {
      if (a.id) {
        const el = list.querySelector(`[data-comment-id="${a.id}"]`);
        if (el) window.scrollBy(0, el.getBoundingClientRect().top - a.top);
      }
      const above = [];
      for (const el of list.querySelectorAll('[data-comment-id]')) {
        const id = Number(el.dataset.commentId);
        if (!a.before.has(id) && !ownIds.current.has(id) && el.getBoundingClientRect().bottom <= 0) above.push(id);
      }
      if (above.length) setNewAbove((ids) => [...new Set([...ids, ...above])]);
    }
    if (scrollTo.current && list) {
      const el = list.querySelector(`[data-comment-id="${scrollTo.current}"]`);
      scrollTo.current = null;
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [roots]);

  // The "N bình luận mới ↑" pill goes away by itself once those comments are on screen again.
  useEffect(() => {
    if (!newAbove.length) return undefined;
    const onScroll = () => {
      const list = listRef.current;
      if (!list) return;
      setNewAbove((ids) => {
        const still = ids.filter((id) => {
          const el = list.querySelector(`[data-comment-id="${id}"]`);
          return el && el.getBoundingClientRect().bottom <= 0;
        });
        return still.length === ids.length ? ids : still;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [newAbove.length]);

  function showNewAbove() {
    const list = listRef.current;
    const first = newAbove
      .map((id) => list?.querySelector(`[data-comment-id="${id}"]`))
      .filter(Boolean)
      .sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top)[0];
    (first ?? list)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setNewAbove([]);
  }

  // Live signals. The echo of this tab's own comment is ignored (it is already in place); a signal that arrives before
  // the answer of our own request waits for it first. Signals for comments already shown as they are change nothing.
  useEffect(() => {
    if (!live) return undefined;
    const handlers = {
      comment: async (signal) => {
        const id = signal?.commentId;
        if (!id) return;
        if (inflight.current) await inflight.current.catch(() => {});
        if (ownIds.current.has(id) || findNode(state.current.roots, id)) return;
        if (signal.parentCommentId == null) sync.current.newRoots += 1;
        scheduleSync();
      },
      commentDeleted: (signal) => {
        const node = signal?.commentId ? findNode(state.current.roots, signal.commentId) : null;
        if (!node || node.isDeleted) return; // not shown, or already removed by this tab
        scheduleSync();
      },
    };
    const unsubscribe = live(handlers);
    return () => unsubscribe?.();
  }, [live, scheduleSync]);

  // refreshKey: reconnect / tab shown again / poll while the socket is down.
  const lastRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey === lastRefreshKey.current) return;
    lastRefreshKey.current = refreshKey;
    if (state.current.status === 'error') setAttempt((n) => n + 1);
    else scheduleSync();
  }, [refreshKey, scheduleSync]);

  // The comment being answered was deleted (by its author, a School Manager, or this tab): stop replying, keep the
  // words – they move to the main composer, which is never unmounted.
  useEffect(() => {
    if (replyTo == null || status !== 'ready') return;
    const target = findNode(roots, replyTo);
    if (target && !target.isDeleted) return;
    const kept = replyText.trim();
    setReplyTo(null);
    setReplyText('');
    if (kept) setMainText((text) => (text.trim() ? `${text}\n${replyText}` : replyText));
    toast(kept ? REPLY_TARGET_GONE : 'Bình luận này đã bị xoá.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roots, replyTo, status]);

  /**
   * Next older top-level comments. The page is computed from what is shown (not a page counter): the shown threads
   * are the server's newest ones, so a thread removed meanwhile never makes the next page skip one, and a new one
   * only makes the page overlap – comments already shown are replaced by the fresh copy (dedupe by commentId).
   */
  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    setMoreError('');
    try {
      const page = Math.floor(roots.length / PAGE_SIZE) + 1;
      const data = await apiRef.current.list({ page, pageSize: PAGE_SIZE });
      if (!mounted.current) return;
      const fresh = new Set(data.items.map((c) => c.commentId));
      setRoots((list) => [...list.filter((c) => !fresh.has(c.commentId)), ...data.items]);
      setTotal(data.total);
      setCount(data.commentCount);
    } catch (err) {
      if (mounted.current) setMoreError(textOf(err, 'Không tải thêm được bình luận. Vui lòng thử lại.', 'list'));
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }

  // UC-65: the answer is the new node; it is put in place without reading the tree again. A new top-level comment
  // goes FIRST (newest first), a reply to the END of its thread. The count goes up by one (no commentCount in the
  // answer). Own comments are always brought into view.
  async function submit(content, parentCommentId = null) {
    const request = apiRef.current.create(parentCommentId ? { content, parentCommentId } : { content });
    inflight.current = request;
    try {
      const comment = await request;
      ownIds.current.add(comment.commentId);
      if (!mounted.current) return { ok: true };
      scrollTo.current = comment.commentId;
      if (parentCommentId) setReplyTo(null);
      // A sync for someone else's comment may already have brought this one: then it is in place and counted.
      if (findNode(state.current.roots, comment.commentId)) {
        setRoots((list) => [...list]); // re-render so the scroll to it still happens
        return { ok: true };
      }
      if (parentCommentId) {
        setRoots((list) => insertReply(list, parentCommentId, comment));
      } else {
        setRoots((list) => (findNode(list, comment.commentId) ? list : [comment, ...list]));
        setTotal((n) => n + 1);
      }
      setCount((n) => n + 1);
      return { ok: true };
    } catch (err) {
      if (err?.code === 'MSG_PARENT_COMMENT_DELETED' && parentCommentId) {
        // Deleted meanwhile: show it as the server does; the replyTo effect keeps the words and tells the user.
        setRoots((list) => prune(markDeleted(list, parentCommentId)));
        return { ok: false };
      }
      if (err?.code === 'MSG_INVALID_PARENT_COMMENT' || (err?.code === 'MSG_COMMENT_NOT_FOUND' && parentCommentId)) {
        toast(textOf(err, ''), { type: 'error' });
        scheduleSync();
        return { ok: false };
      }
      return { error: textOf(err, 'Không gửi được bình luận. Vui lòng thử lại.', 'create') };
    } finally {
      if (inflight.current === request) inflight.current = null;
    }
  }

  // UC-66: soft delete on the server; the tree is updated with the server's own rule (prune), the count from the answer.
  async function confirmDelete() {
    const target = deleting?.comment;
    if (!target || deleting.busy) return;
    setDeleting({ comment: target, busy: true });
    try {
      const result = await apiRef.current.remove(target.commentId);
      if (!mounted.current) return;
      const nextRoots = removeComment(roots, target.commentId);
      setTotal((n) => n - (roots.length - nextRoots.length));
      setRoots(nextRoots);
      setCount(result.commentCount);
      setDeleting(null);
      toast('Đã xoá bình luận.');
    } catch (err) {
      if (!mounted.current) return;
      setDeleting(null);
      if (err?.code === 'MSG_COMMENT_NOT_FOUND') {
        toast('Bình luận này đã bị xoá trước đó.');
        scheduleSync();
        return;
      }
      toast(textOf(err, 'Không xoá được bình luận. Vui lòng thử lại.', 'remove'), { type: 'error' });
    }
  }

  const reply = {
    to: replyTo,
    text: replyText,
    setText: setReplyText,
    toggle: (id) => {
      setReplyText((text) => (replyTo === id ? text : ''));
      setReplyTo((current) => (current === id ? null : id));
    },
    cancel: () => {
      setReplyTo(null);
      setReplyText('');
    },
    submit: (parentCommentId, content) => submit(content, parentCommentId),
  };

  return (
    <section className="ct" aria-labelledby={headingId}>
      <h2 id={headingId} className="ct-title">
        <Icon name="forum" size="sm" />
        {title} <span className="mono">({count.toLocaleString('vi-VN')})</span>
      </h2>

      <Composer
        text={mainText}
        setText={setMainText}
        onSubmit={(content) => submit(content)}
        placeholder="Viết bình luận…"
        user={user}
      />

      {/* Always rendered (zero height, sticky): the pill floats over the list without moving it. */}
      <div className="ct-new-pill-wrap" aria-live="polite">
        {newAbove.length > 0 && (
          <button type="button" className="ct-new-pill" onClick={showNewAbove}>
            <Icon name="arrow_upward" size="sm" />
            {newAbove.length.toLocaleString('vi-VN')} bình luận mới
          </button>
        )}
      </div>

      {status === 'loading' && (
        <div className="ct-skeleton" aria-busy="true" aria-label="Đang tải bình luận">
          <span />
          <span />
        </div>
      )}
      {status === 'error' && (
        <div className="ct-load-error">
          <p className="form-error" role="alert">
            {loadError}
          </p>
          <button type="button" className="btn btn-secondary" onClick={reload}>
            <Icon name="refresh" size="sm" />
            Thử lại
          </button>
        </div>
      )}
      {status === 'ready' && roots.length === 0 && <p className="caption muted ct-empty">Chưa có bình luận nào.</p>}
      {status === 'ready' && roots.length > 0 && (
        <ul className="ct-list" ref={listRef}>
          {roots.map((node) => (
            <CommentNode key={node.commentId} node={node} depth={0} parentName={null} reply={reply} onDelete={(c) => setDeleting({ comment: c, busy: false })} />
          ))}
        </ul>
      )}
      {status === 'ready' && remaining > 0 && (
        <div className="ct-more">
          <button type="button" className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>
            <Icon name={loadingMore ? 'progress_activity' : 'expand_more'} size="sm" className={loadingMore ? 'ct-spin' : undefined} />
            {loadingMore ? 'Đang tải…' : `Xem thêm bình luận (còn ${remaining.toLocaleString('vi-VN')})`}
          </button>
          {moreError && (
            <p className="field-error" role="alert">
              {moreError}
            </p>
          )}
        </div>
      )}

      <DeleteDialog
        comment={deleting?.comment ?? null}
        busy={Boolean(deleting?.busy)}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
