import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listGroupCommentReports, resolveGroupCommentReport } from '../../api/groupPosts.js';
import { FeedEmpty, FeedError, FeedPager, FeedSkeleton, FeedTabs } from '../../components/feed/Feed.jsx';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { feedErrorText } from '../schoolfeed/schoolFeedShared.jsx';
// FE-08 Anh 27/11/2026: shared with the moderation page (this page's card and dialog, moved there unchanged).
import { CommentReportCard, DeleteCommentDialog, decisionToast } from '../schoolfeed/CommentReportCard.jsx';
import '../../components/feed/feed.css';
import '../schoolfeed/CommentReportsPage.css';

// Reported comments of the group feeds (FE-05, Khanh, 19/11/2026) – the same screen as FE-08's "Báo cáo bình luận"
// (pages/schoolfeed/CommentReportsPage.jsx, Anh), for the moderators of group feeds: a homeroom teacher sees the
// GENERAL feed of their class(es), the School Manager the teacher group (business-rules §5). One card per reported
// comment, whatever the number of reports: the comment, its author, the group and the post (opens its pop-up), how many
// reports and why. "Xoá bình luận" soft-deletes it (§5: deleted, never hidden) and tells its author without naming
// anyone; "Bỏ qua" keeps it. The server lists only the feeds the user moderates (moderates: false → nothing to do).

const PAGE_SIZE = 20;
const TABS = [
  { key: 'PENDING', label: 'Chờ xử lý' },
  { key: 'RESOLVED', label: 'Đã xoá bình luận' },
  { key: 'DISMISSED', label: 'Đã bỏ qua' },
];

const REPORT_MESSAGES = {
  MSG_REPORT_ALREADY_HANDLED: 'Báo cáo này đã được xử lý.',
  MSG_REPORT_NOT_FOUND: 'Không tìm thấy báo cáo của bình luận này.',
};
const textOf = (err, fallback) => REPORT_MESSAGES[err?.code] ?? feedErrorText(err, fallback);

export default function GroupCommentReportsPage() {
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
    listGroupCommentReports({ status, page, pageSize: PAGE_SIZE }, { signal: controller.signal })
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
      await resolveGroupCommentReport(item.commentId, action, supportNote);
      toast(decisionToast(item, action)); // FE-08 Anh 27/11/2026: shared with the moderation page
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
  const nothingToModerate = data && data.moderates === false;

  return (
    <div className="comment-reports">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Cộng đồng</span>/<span className="current">Báo cáo bình luận nhóm</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Báo cáo bình luận nhóm</h1>
          <p>
            Bình luận trên bảng tin nhóm bạn phụ trách bị thành viên báo cáo. Xem xét rồi xoá bình luận hoặc bỏ qua báo
            cáo.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={reload} disabled={state.loading}>
          <Icon name="refresh" size="sm" />
          Tải lại
        </button>
      </div>

      {nothingToModerate ? (
        <FeedEmpty icon="shield_person">
          Bạn chưa phụ trách bảng tin nhóm nào. Báo cáo bình luận do giáo viên chủ nhiệm xử lý cho bảng tin của lớp mình
          (và quản lý trường cho nhóm giáo viên).
        </FeedEmpty>
      ) : (
        <>
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
              <CommentReportCard // FE-08 Anh 27/11/2026: shared with the moderation page
                key={item.commentId}
                source="GROUP_POST"
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
        </>
      )}

      {/* FE-08 Anh 27/11/2026: shared with the moderation page */}
      <DeleteCommentDialog
        idPrefix="gcr"
        source="GROUP_POST"
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
