import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listCommentReports, resolveCommentReport } from '../../api/schoolPosts.js';
import Avatar from '../../components/Avatar.jsx';
import { REPORT_REASONS } from '../../components/CommentThread.jsx';
import { FeedEmpty, FeedError, FeedPager, FeedSkeleton, FeedTabs } from '../../components/feed/Feed.jsx';
import Icon from '../../components/Icon.jsx';
import { SupportBadge, SupportNoteField, SupportNoteResult, supportNoteOk } from '../../components/feed/SupportReport.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { feedErrorText, formatDateTime } from './schoolFeedShared.jsx';
import '../../components/feed/feed.css';
import './CommentReportsPage.css';

// Reported comments of the school feed (FE-08, owner Anh, 17/11/2026). School Manager only (route + server). Proposed
// as a new screen for docs/screens.md ("Báo cáo bình luận"). One card per reported comment, whatever the number of
// reports: the comment, its author, the post (opens SCR-05), how many reports and why. "Xoá bình luận" soft-deletes it
// (business-rules §5: deleted, never hidden) and tells its author without naming anyone; "Bỏ qua" keeps it.
// Only comments of SCHOOL posts are ever listed: the School Manager does not see class feeds (§1).

const PAGE_SIZE = 20;
const TABS = [
  { key: 'PENDING', label: 'Chờ xử lý' },
  { key: 'RESOLVED', label: 'Đã xoá bình luận' },
  { key: 'DISMISSED', label: 'Đã bỏ qua' },
];
const REASON_LABELS = Object.fromEntries(REPORT_REASONS.map((r) => [r.code, r.label]));

// TODO FE-08: move to messages.js once the lead approves the codes (waiting list in the summary).
const REPORT_MESSAGES = {
  MSG_REPORT_ALREADY_HANDLED: 'Báo cáo này đã được người khác xử lý.',
  MSG_REPORT_NOT_FOUND: 'Không tìm thấy báo cáo của bình luận này.',
};
const textOf = (err, fallback) => REPORT_MESSAGES[err?.code] ?? feedErrorText(err, fallback);

// Confirmation of "Xoá bình luận" (native <dialog>, .sf-dialog styles). The safe button gets the focus.
function DeleteDialog({ item, busy, onCancel, onConfirm }) {
  const ref = useRef(null);
  const open = Boolean(item);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sf-dialog"
      aria-labelledby="cr-delete-title"
      aria-describedby="cr-delete-desc"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="sf-dialog-head is-danger">
        <Icon name="delete" />
        <h2 id="cr-delete-title" className="title-sm">
          Xoá bình luận?
        </h2>
      </div>
      <div id="cr-delete-desc">
        {item && (
          <p className="sf-dialog-quote">
            <strong>{item.authorName}:</strong> {item.content}
          </p>
        )}
        <div className="notice amber">
          <Icon name="warning" size="sm" />
          <p>
            Bình luận sẽ không còn hiển thị với bất kỳ ai; các trả lời bên dưới vẫn được giữ. Người viết nhận được thông
            báo rằng bình luận đã bị xoá sau khi được báo cáo, không kèm tên người báo cáo.
          </p>
        </div>
      </div>
      <div className="sf-dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy} autoFocus>
          Giữ lại
        </button>
        <button type="button" className="btn btn-primary sf-btn-danger" onClick={onConfirm} disabled={busy}>
          <Icon name={busy ? 'progress_activity' : 'delete'} size="sm" className={busy ? 'cr-spin' : undefined} />
          {busy ? 'Đang xoá…' : 'Xoá bình luận'}
        </button>
      </div>
    </dialog>
  );
}

// Moderation (25/11/2026): an item with a "Cần được hỗ trợ" report is labelled, needs a "Kết quả hỗ trợ" to be
// decided, and when every report is NEEDS_SUPPORT it can only be recorded ("Ghi nhận" = DISMISS), never deleted.
function ReportCard({ item, busy, onDelete, onDismiss }) {
  const pending = item.status === 'PENDING';
  const [supportNote, setSupportNote] = useState('');
  const support = pending && item.hasNeedsSupport;
  const blocked = Boolean(busy) || (support && !supportNoteOk(supportNote));
  const note = support ? supportNote : undefined;
  const postLink = `/school-feed/${item.postId}`;
  return (
    <article className={`card card-outline cr-item${item.hasNeedsSupport ? ' is-support' : ''}`} aria-label={`Bình luận của ${item.authorName}`}>
      <header className="cr-item-head">
        {item.hasNeedsSupport && <SupportBadge />}
        <span className="cr-count" title={`${item.reportCount} lượt báo cáo`}>
          <Icon name="flag" size="sm" filled />
          <span className="mono">{item.reportCount.toLocaleString('vi-VN')}</span>
          <span>lượt báo cáo</span>
        </span>
        <span className="caption muted">
          {item.reportCount > 1
            ? `Lần đầu ${formatDateTime(item.firstReportedAt)} · gần nhất ${formatDateTime(item.lastReportedAt)}`
            : `Báo cáo lúc ${formatDateTime(item.firstReportedAt)}`}
        </span>
      </header>

      <div className="cr-comment">
        <Avatar src={item.authorAvatarUrl} name={item.authorName ?? ''} size={36} />
        <div className="cr-comment-body">
          <p className="cr-author">
            {item.authorName}
            <span className="caption muted"> · bình luận lúc {formatDateTime(item.commentCreatedAt)}</span>
          </p>
          <p className={`cr-content${item.isDeleted ? ' is-deleted' : ''}`}>{item.content}</p>
          {item.isDeleted && <span className="chip">Đã bị xoá</span>}
        </div>
      </div>

      <p className="cr-post">
        <Icon name="campaign" size="sm" />
        <span className="caption muted">Trong bài</span>
        {item.postDeleted ? (
          <span className="cr-post-title muted">{item.postTitle} (bài đã gỡ)</span>
        ) : (
          <Link to={postLink} className="cr-post-title">
            {item.postTitle}
          </Link>
        )}
      </p>

      <div className="cr-reasons">
        <span className="chips">
          {item.reasons.map((r) => (
            <span key={r.reason} className="chip ink">
              {REASON_LABELS[r.reason] ?? r.reason}
              {item.reportCount > 1 && <span className="mono"> × {r.count}</span>}
            </span>
          ))}
        </span>
        {item.notes.length > 0 && (
          <ul className="cr-notes">
            {item.notes.map((n, i) => (
              <li key={i}>
                <span className="caption muted">{REASON_LABELS[n.reason] ?? n.reason}:</span> “{n.note}”
              </li>
            ))}
          </ul>
        )}
      </div>

      {support && <SupportNoteField value={supportNote} onChange={setSupportNote} disabled={Boolean(busy)} />}

      {pending ? (
        <footer className="cr-actions">
          <button type="button" className={`btn ${item.needsSupportOnly ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onDismiss(item, note)} disabled={blocked}>
            <Icon name={busy === 'DISMISS' ? 'progress_activity' : item.needsSupportOnly ? 'task_alt' : 'do_not_disturb_on'} size="sm" className={busy === 'DISMISS' ? 'cr-spin' : undefined} />
            {busy === 'DISMISS' ? 'Đang lưu…' : item.needsSupportOnly ? 'Ghi nhận' : 'Bỏ qua'}
          </button>
          {!item.needsSupportOnly && (
            <button type="button" className="btn btn-primary sf-btn-danger" onClick={() => onDelete(item, note)} disabled={blocked}>
              <Icon name="delete" size="sm" />
              Xoá bình luận
            </button>
          )}
        </footer>
      ) : (
        <p className="caption muted cr-decided">
          <Icon name={item.status === 'RESOLVED' ? 'delete' : 'do_not_disturb_on'} size="sm" />
          {item.status === 'RESOLVED' ? 'Bình luận đã bị xoá' : item.hasNeedsSupport ? 'Đã ghi nhận' : 'Đã bỏ qua báo cáo'}
          {item.resolvedAt && ` lúc ${formatDateTime(item.resolvedAt)}`}
          {item.resolvedByName && ` · ${item.resolvedByName}`}
        </p>
      )}
      {!pending && <SupportNoteResult note={item.supportNote} />}
    </article>
  );
}

export default function CommentReportsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = TABS.some((t) => t.key === params.get('status')) ? params.get('status') : 'PENDING';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(null); // { commentId, action }
  const [deleting, setDeleting] = useState(null); // { item, note }: the item whose confirmation is open

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: '' }));
    listCommentReports({ status, page, pageSize: PAGE_SIZE }, { signal: controller.signal })
      .then((data) => {
        // The last page emptied by decisions: go back one page.
        if (!data.items.length && page > 1 && data.total > 0) {
          setParams(go(status, Math.ceil(data.total / PAGE_SIZE)), { replace: true });
          return;
        }
        setState({ loading: false, data, error: '' });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setState({ loading: false, data: null, error: textOf(err, 'Không tải được danh sách báo cáo. Vui lòng thử lại.') });
      });
    return () => controller.abort();
  }, [status, page, attempt, setParams]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  async function decide(item, action, supportNote) {
    if (busy) return;
    setBusy({ commentId: item.commentId, action });
    try {
      await resolveCommentReport(item.commentId, action, supportNote);
      toast(
        action === 'DELETE'
          ? 'Đã xoá bình luận và báo cho người viết.'
          : item.needsSupportOnly
            ? 'Đã ghi nhận kết quả hỗ trợ.'
            : 'Đã bỏ qua báo cáo. Bình luận được giữ nguyên.',
      );
      setDeleting(null);
      reload();
    } catch (err) {
      setDeleting(null);
      toast(textOf(err, 'Không xử lý được báo cáo. Vui lòng thử lại.'), { type: 'error' });
      if (err?.code === 'MSG_REPORT_ALREADY_HANDLED' || err?.code === 'MSG_REPORT_NOT_FOUND') reload();
    } finally {
      setBusy(null);
    }
  }

  const { data } = state;
  const tabs = TABS.map((t) => ({ ...t, count: t.key === 'PENDING' ? data?.pendingCount ?? 0 : 0 }));
  const busyOf = (item) => (busy?.commentId === item.commentId ? busy.action : null);

  return (
    <div className="comment-reports">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Trường</span>/<span className="current">Báo cáo bình luận</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Báo cáo bình luận</h1>
          <p>Bình luận trên bảng tin trường bị người đọc báo cáo. Xem xét rồi xoá bình luận hoặc bỏ qua báo cáo.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={reload} disabled={state.loading}>
          <Icon name="refresh" size="sm" />
          Tải lại
        </button>
      </div>

      <div className="cr-toolbar">
        <FeedTabs
          tabs={tabs}
          active={status}
          onChange={(key) => setParams(go(key, 1), { replace: true })}
          label="Trạng thái báo cáo"
        />
      </div>

      <div className={`cr-list${state.loading && data ? ' is-loading' : ''}`} aria-busy={state.loading}>
        {state.loading && !data && <FeedSkeleton count={3} />}
        {state.error && <FeedError message={state.error} onRetry={reload} />}
        {data?.items.map((item) => (
          <ReportCard
            key={item.commentId}
            item={item}
            busy={busyOf(item)}
            onDelete={(it, note) => setDeleting({ item: it, note })}
            onDismiss={(it, note) => decide(it, 'DISMISS', note)}
          />
        ))}
        {data && !data.items.length && !state.error && (
          <FeedEmpty icon={status === 'PENDING' ? 'verified' : 'flag'}>
            {status === 'PENDING' ? 'Không có báo cáo nào đang chờ xử lý.' : 'Chưa có báo cáo nào ở mục này.'}
          </FeedEmpty>
        )}
      </div>

      {data && (
        <FeedPager page={page} total={data.total} pageSize={PAGE_SIZE} onPage={(p) => setParams(go(status, p))} />
      )}

      <DeleteDialog
        item={deleting?.item ?? null}
        busy={busy?.action === 'DELETE'}
        onCancel={() => setDeleting(null)}
        onConfirm={() => decide(deleting.item, 'DELETE', deleting.note)}
      />
    </div>
  );
}

// URL of a tab / page: PENDING and page 1 are the defaults and are left out.
function go(status, page) {
  return { ...(status !== 'PENDING' && { status }), ...(page > 1 && { page: String(page) }) };
}
