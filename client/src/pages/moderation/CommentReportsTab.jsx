import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listGroupCommentReports, resolveGroupCommentReport } from '../../api/groupPosts.js';
import { announceModerationChange } from '../../api/moderation.js';
import { listCommentReports, resolveCommentReport } from '../../api/schoolPosts.js';
import { FeedEmpty, FeedError, FeedPager, FeedSkeleton, FeedTabs } from '../../components/feed/Feed.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { CommentReportCard, DeleteCommentDialog, decisionToast } from '../schoolfeed/CommentReportCard.jsx';
import { feedErrorText } from '../schoolfeed/schoolFeedShared.jsx';

// Tab "Báo cáo bình luận" of "Quy chuẩn cộng đồng" (FE-08 Anh, 27/11/2026): every reported comment the School Manager
// handles, in one queue (business-rules §17: the School Manager handles every report it may act on from this page).
//   - school feed comments: GET / PATCH /comment-reports (was the "Báo cáo bình luận" page, SM only);
//   - teacher group comments: GET / PATCH /group-comment-reports (FE-05 Khanh; for the School Manager the server lists
//     the teacher group only, never a class feed – homeroom teachers keep their own page /group-comment-reports).
// The card and the delete confirmation are the ones of the old pages (schoolfeed/CommentReportCard.jsx); each item is
// decided with the resolve API of its own source. URL: ?tab=comments&source=school|teacher&status=&page=.

const PAGE_SIZE = 20;
const API_MAX_PAGE = 50; // MAX_PAGE_SIZE of both list endpoints
const STATUS_TABS = [
  { key: 'PENDING', label: 'Chờ xử lý' },
  { key: 'RESOLVED', label: 'Đã xoá bình luận' },
  { key: 'DISMISSED', label: 'Đã bỏ qua' },
];
const SOURCES = [
  { key: 'all', label: 'Tất cả' },
  { key: 'school', label: 'Bảng tin trường' },
  { key: 'teacher', label: 'Nhóm giáo viên' },
];
const API = {
  school: { list: listCommentReports, resolve: resolveCommentReport },
  teacher: { list: listGroupCommentReports, resolve: resolveGroupCommentReport },
};
const sourceKeyOf = (item) => (item.source === 'GROUP_POST' ? 'teacher' : 'school');

const REPORT_MESSAGES = {
  MSG_REPORT_ALREADY_HANDLED: 'Báo cáo này đã được người khác xử lý.',
  MSG_REPORT_NOT_FOUND: 'Không tìm thấy báo cáo của bình luận này.',
};
const textOf = (err, fallback) => REPORT_MESSAGES[err?.code] ?? feedErrorText(err, fallback);

// The order of the server (utils/commentReports.js listReports), so the two queues merge into the same order:
// PENDING → "Cần được hỗ trợ" first, then the oldest first report, then comment id; else the latest decision first.
// Times are the DB strings in Vietnam time ("2026-11-27 08:30:00.123+07"): same offset, so they compare as strings.
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function compareItems(status) {
  if (status === 'PENDING') {
    return (a, b) =>
      Number(b.hasNeedsSupport) - Number(a.hasNeedsSupport) ||
      cmp(a.firstReportedAt, b.firstReportedAt) ||
      a.commentId - b.commentId;
  }
  return (a, b) => {
    if (a.resolvedAt !== b.resolvedAt) {
      if (!a.resolvedAt) return 1;
      if (!b.resolvedAt) return -1;
      return cmp(b.resolvedAt, a.resolvedAt);
    }
    return b.commentId - a.commentId;
  };
}

// The first `count` items of one queue, read in pages of API_MAX_PAGE (one call while count <= 50).
async function readTop(list, status, count, signal) {
  const pageSize = Math.min(count, API_MAX_PAGE);
  const first = await list({ status, page: 1, pageSize }, { signal });
  const items = [...first.items];
  for (let page = 2; items.length < Math.min(count, first.total); page += 1) {
    const next = await list({ status, page, pageSize }, { signal });
    if (!next.items.length) break;
    items.push(...next.items);
  }
  return { items: items.slice(0, count), total: first.total, pendingCount: first.pendingCount ?? 0 };
}

// "Tất cả": the page is cut out of the two queues merged. Page p needs the first p × PAGE_SIZE items of each queue
// (any of them may belong to it), so both are read that far, merged in the server's order and sliced: exact paging
// over both sources, no ASSUMPTION needed. Pages far back cost more calls (page 5 = 100 items per queue = 2 calls).
async function readAll(status, page, signal) {
  const count = page * PAGE_SIZE;
  const [school, teacher] = await Promise.all([
    readTop(API.school.list, status, count, signal),
    readTop(API.teacher.list, status, count, signal),
  ]);
  const merged = [...school.items, ...teacher.items].sort(compareItems(status));
  return {
    items: merged.slice((page - 1) * PAGE_SIZE, count),
    total: school.total + teacher.total,
    pendingCount: school.pendingCount + teacher.pendingCount,
  };
}

export default function CommentReportsTab() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const source = SOURCES.some((s) => s.key === params.get('source')) ? params.get('source') : 'all';
  const status = STATUS_TABS.some((t) => t.key === params.get('status')) ? params.get('status') : 'PENDING';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(null); // { commentId, action }
  const [deleting, setDeleting] = useState(null); // { item, note }: the item whose confirmation is open

  const go = useCallback(
    (next) => {
      const s = next.source ?? source;
      const st = next.status ?? status;
      const p = next.page ?? 1;
      setParams(
        {
          tab: 'comments',
          ...(s !== 'all' && { source: s }),
          ...(st !== 'PENDING' && { status: st }),
          ...(p > 1 && { page: String(p) }),
        },
        { replace: true },
      );
    },
    [source, status, setParams],
  );

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: '' }));
    const read =
      source === 'all'
        ? readAll(status, page, controller.signal)
        : API[source].list({ status, page, pageSize: PAGE_SIZE }, { signal: controller.signal });
    read
      .then((data) => {
        // The last page emptied by decisions: go back to the last page there is.
        if (!data.items.length && page > 1 && data.total > 0) {
          go({ page: Math.ceil(data.total / PAGE_SIZE) });
          return;
        }
        setState({ loading: false, data, error: '' });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setState({ loading: false, data: null, error: textOf(err, 'Không tải được danh sách báo cáo. Vui lòng thử lại.') });
      });
    return () => controller.abort();
    // go changes with source / status, which are already listed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, status, page, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  async function decide(item, action, supportNote) {
    if (busy) return;
    setBusy({ commentId: item.commentId, action });
    try {
      await API[sourceKeyOf(item)].resolve(item.commentId, action, supportNote);
      toast(decisionToast(item, action)); // FE-08 Anh 27/11/2026: shared with the moderation page
      setDeleting(null);
      announceModerationChange(); // the menu badge and the tab count
      reload();
    } catch (err) {
      setDeleting(null);
      toast(textOf(err, 'Không xử lý được báo cáo. Vui lòng thử lại.'), { type: 'error' });
      if (err?.code === 'MSG_REPORT_ALREADY_HANDLED' || err?.code === 'MSG_REPORT_NOT_FOUND') {
        announceModerationChange();
        reload();
      }
    } finally {
      setBusy(null);
    }
  }

  const { data } = state;
  const tabs = STATUS_TABS.map((t) => ({ ...t, count: t.key === 'PENDING' ? data?.pendingCount ?? 0 : 0 }));
  const busyOf = (item) => (busy?.commentId === item.commentId ? busy.action : null);

  return (
    <section aria-label="Báo cáo bình luận">
      <div className="mod-cr-sources">
        <span className="caption muted">Nguồn</span>
        <div className="pill-tabs" role="tablist" aria-label="Nguồn báo cáo">
          {SOURCES.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={source === s.key}
              onClick={() => source !== s.key && go({ source: s.key })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cr-toolbar mod-cr-toolbar">
        <FeedTabs tabs={tabs} active={status} onChange={(key) => go({ status: key })} label="Trạng thái báo cáo" />
      </div>

      <div className={`cr-list${state.loading && data ? ' is-loading' : ''}`} aria-busy={state.loading}>
        {state.loading && !data && <FeedSkeleton count={3} />}
        {state.error && <FeedError message={state.error} onRetry={reload} />}
        {data?.items.map((item) => (
          <CommentReportCard
            key={`${item.source}-${item.commentId}-${status}`}
            item={item}
            showSource
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

      {data && <FeedPager page={page} total={data.total} pageSize={PAGE_SIZE} onPage={(p) => go({ page: p })} />}

      <DeleteCommentDialog
        idPrefix="mcr"
        item={deleting?.item ?? null}
        busy={busy?.action === 'DELETE'}
        onCancel={() => setDeleting(null)}
        onConfirm={() => decide(deleting.item, 'DELETE', deleting.note)}
      />
    </section>
  );
}
