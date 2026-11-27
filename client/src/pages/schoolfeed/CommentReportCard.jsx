import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../../components/Avatar.jsx';
import { REPORT_REASONS } from '../../components/CommentThread.jsx';
import Icon from '../../components/Icon.jsx';
import { SupportBadge, SupportNoteField, SupportNoteResult, supportNoteOk } from '../../components/feed/SupportReport.jsx';
import { postPopupPath } from '../groupfeed/groupFeedShared.jsx';
import { formatDateTime } from './schoolFeedShared.jsx';
import './CommentReportsPage.css';

// FE-08 Anh 27/11/2026: shared with the moderation page.
// One reported comment and the "Xoá bình luận?" confirmation, taken unchanged out of the two comment report queues:
// the school feed one (FE-08, now the "Báo cáo bình luận" tab of "Quy chuẩn cộng đồng", pages/moderation/
// CommentReportsTab.jsx) and the group feeds one (FE-05 Khanh, pages/groupfeed/GroupCommentReportsPage.jsx – homeroom
// teachers). What differs between the two sources (the post line, the dialog text) follows item.source
// ('SCHOOL_POST' | 'GROUP_POST', sent by utils/commentReports.js listReports).

const REASON_LABELS = Object.fromEntries(REPORT_REASONS.map((r) => [r.code, r.label]));
const isGroup = (source) => source === 'GROUP_POST';

// 27/11/2026 (business-rules §17): the author deleted the comment after it was reported. It stays deleted; the
// moderator decides "violation or not": DELETE = "Xác nhận vi phạm" (the violation is recorded, the author is told),
// DISMISS = "Không vi phạm".
const removedByAuthor = (item) => Boolean(item?.deletedByAuthorAfterReport);

/** The toast after a decision (both comment report pages). */
export function decisionToast(item, action) {
  if (removedByAuthor(item) && !item.needsSupportOnly) {
    return action === 'DELETE' ? 'Đã xác nhận vi phạm và báo cho người viết.' : 'Đã ghi nhận bình luận không vi phạm.';
  }
  if (action === 'DELETE') return 'Đã xoá bình luận và báo cho người viết.';
  return item.needsSupportOnly ? 'Đã ghi nhận kết quả hỗ trợ.' : 'Đã bỏ qua báo cáo. Bình luận được giữ nguyên.';
}

/** Pill naming where the comment was written (moderation tab only: both sources are listed there). */
export function CommentReportSource({ source }) {
  return isGroup(source) ? (
    <span className="pill">Nhóm giáo viên</span>
  ) : (
    <span className="pill blue">Bảng tin trường</span>
  );
}

// The post the comment belongs to: a school post opens SCR-05, a group post its pop-up in the group feed.
function PostLine({ item, source }) {
  if (isGroup(source)) {
    const excerpt = item.postExcerpt?.replace(/\s+/g, ' ').trim() || 'Bài viết';
    return (
      <p className="cr-post">
        <Icon name="forum" size="sm" />
        <span className="caption muted">{item.groupName ? `${item.groupName} · trong bài` : 'Trong bài'}</span>
        {item.postDeleted ? (
          <span className="cr-post-title muted">{excerpt} (bài đã xoá)</span>
        ) : (
          <Link to={postPopupPath(item.groupId, item.postId)} className="cr-post-title">
            {excerpt}
          </Link>
        )}
      </p>
    );
  }
  return (
    <p className="cr-post">
      <Icon name="campaign" size="sm" />
      <span className="caption muted">Trong bài</span>
      {item.postDeleted ? (
        <span className="cr-post-title muted">{item.postTitle} (bài đã gỡ)</span>
      ) : (
        <Link to={`/school-feed/${item.postId}`} className="cr-post-title">
          {item.postTitle}
        </Link>
      )}
    </p>
  );
}

/**
 * Confirmation of "Xoá bình luận" (native <dialog>, .sf-dialog styles). The safe button gets the focus.
 * idPrefix keeps the ids each page had ('cr', 'gcr'); source picks the notice text when no item is open.
 * A comment its author deleted after the report: the same dialog asks to confirm the violation instead (27/11/2026).
 */
export function DeleteCommentDialog({ item, busy, onCancel, onConfirm, idPrefix = 'cr', source }) {
  const ref = useRef(null);
  const open = Boolean(item);
  const group = isGroup(item?.source ?? source);
  const removed = removedByAuthor(item);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sf-dialog"
      aria-labelledby={`${idPrefix}-delete-title`}
      aria-describedby={`${idPrefix}-delete-desc`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="sf-dialog-head is-danger">
        <Icon name={removed ? 'gavel' : 'delete'} />
        <h2 id={`${idPrefix}-delete-title`} className="title-sm">
          {removed ? 'Xác nhận vi phạm?' : 'Xoá bình luận?'}
        </h2>
      </div>
      <div id={`${idPrefix}-delete-desc`}>
        {item && (
          <p className="sf-dialog-quote">
            <strong>{item.authorName}:</strong> {item.content}
          </p>
        )}
        <div className="notice amber">
          <Icon name="warning" size="sm" />
          {removed ? (
            <p>
              Tác giả đã xoá bình luận này, bình luận vẫn không hiển thị với ai. Vi phạm được ghi lại và người viết nhận
              được thông báo rằng bình luận đã xoá được xác nhận vi phạm, không kèm nội dung và tên người báo cáo.
            </p>
          ) : (
            <p>
              {group
                ? 'Bình luận sẽ không còn hiển thị với các thành viên của nhóm; các trả lời bên dưới vẫn được giữ.'
                : 'Bình luận sẽ không còn hiển thị với bất kỳ ai; các trả lời bên dưới vẫn được giữ.'}{' '}
              Người viết nhận được thông báo rằng bình luận đã bị xoá sau khi được báo cáo, không kèm tên người báo cáo.
            </p>
          )}
        </div>
      </div>
      <div className="sf-dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy} autoFocus>
          Giữ lại
        </button>
        <button type="button" className="btn btn-primary sf-btn-danger" onClick={onConfirm} disabled={busy}>
          <Icon name={busy ? 'progress_activity' : removed ? 'gavel' : 'delete'} size="sm" className={busy ? 'cr-spin' : undefined} />
          {busy ? (removed ? 'Đang lưu…' : 'Đang xoá…') : removed ? 'Xác nhận vi phạm' : 'Xoá bình luận'}
        </button>
      </div>
    </dialog>
  );
}

/**
 * One card per reported comment, whatever the number of reports: the comment, its author, the post, how many reports
 * and why. Moderation (25/11/2026): an item with a "Cần được hỗ trợ" report is labelled, needs a "Kết quả hỗ trợ" to be
 * decided, and when every report is NEEDS_SUPPORT it can only be recorded ("Ghi nhận" = DISMISS), never deleted.
 * source: 'SCHOOL_POST' | 'GROUP_POST' (default item.source); showSource: adds the source pill (the moderation tab
 * lists both sources).
 * deletedByAuthorAfterReport (27/11/2026): pill "Tác giả đã xoá sau khi bị báo cáo", an explanation, and the decision
 * "Không vi phạm" (DISMISS) / "Xác nhận vi phạm" (DELETE) – "Ghi nhận" alone when every report is "Cần được hỗ trợ".
 */
export function CommentReportCard({ item, busy, onDelete, onDismiss, source = item.source, showSource = false }) {
  const pending = item.status === 'PENDING';
  const [supportNote, setSupportNote] = useState('');
  const support = pending && item.hasNeedsSupport;
  const blocked = Boolean(busy) || (support && !supportNoteOk(supportNote));
  const note = support ? supportNote : undefined;
  const removed = removedByAuthor(item);
  const verdict = removed && !item.needsSupportOnly; // the choice is "violation or not"
  return (
    <article className={`card card-outline cr-item${item.hasNeedsSupport ? ' is-support' : ''}`} aria-label={`Bình luận của ${item.authorName}`}>
      <header className="cr-item-head">
        {item.hasNeedsSupport && <SupportBadge />}
        {showSource && <CommentReportSource source={source} />}
        {removed && <span className="pill red">Tác giả đã xoá sau khi bị báo cáo</span>}
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
          {item.isDeleted && !removed && <span className="chip">Đã bị xoá</span>}
        </div>
      </div>

      <PostLine item={item} source={source} />

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

      {pending && removed && (
        <div className="notice cr-removed-note">
          <Icon name="info" size="sm" />
          <p>
            Tác giả đã xoá bình luận này sau khi bị báo cáo, không còn ai nhìn thấy.{' '}
            {item.needsSupportOnly ? 'Hãy ghi nhận kết quả hỗ trợ.' : 'Hãy xác nhận bình luận có vi phạm hay không.'}
          </p>
        </div>
      )}

      {support && <SupportNoteField value={supportNote} onChange={setSupportNote} disabled={Boolean(busy)} />}

      {pending ? (
        <footer className="cr-actions">
          <button type="button" className={`btn ${item.needsSupportOnly ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onDismiss(item, note)} disabled={blocked}>
            <Icon
              name={busy === 'DISMISS' ? 'progress_activity' : item.needsSupportOnly ? 'task_alt' : 'do_not_disturb_on'}
              size="sm"
              className={busy === 'DISMISS' ? 'cr-spin' : undefined}
            />
            {busy === 'DISMISS' ? 'Đang lưu…' : item.needsSupportOnly ? 'Ghi nhận' : verdict ? 'Không vi phạm' : 'Bỏ qua'}
          </button>
          {!item.needsSupportOnly && (
            <button type="button" className="btn btn-primary sf-btn-danger" onClick={() => onDelete(item, note)} disabled={blocked}>
              <Icon name={verdict ? 'gavel' : 'delete'} size="sm" />
              {verdict ? 'Xác nhận vi phạm' : 'Xoá bình luận'}
            </button>
          )}
        </footer>
      ) : (
        <p className="caption muted cr-decided">
          <Icon name={item.status === 'RESOLVED' ? (removed ? 'gavel' : 'delete') : 'do_not_disturb_on'} size="sm" />
          {removed
            ? item.status === 'RESOLVED'
              ? 'Xác nhận vi phạm'
              : item.needsSupportOnly
                ? 'Đã ghi nhận'
                : 'Không vi phạm'
            : item.status === 'RESOLVED'
              ? 'Bình luận đã bị xoá'
              : item.hasNeedsSupport
                ? 'Đã ghi nhận'
                : 'Đã bỏ qua báo cáo'}
          {item.resolvedAt && ` lúc ${formatDateTime(item.resolvedAt)}`}
          {item.resolvedByName && ` · ${item.resolvedByName}`}
        </p>
      )}
      {!pending && <SupportNoteResult note={item.supportNote} />}
    </article>
  );
}
