import { useEffect, useState } from 'react';
import {
  exportViolators,
  getUserHistory,
  getViolationContent,
  listViolators,
  unhideViolation,
} from '../../api/moderation.js';
import { FeedPager } from '../../components/feed/Feed.jsx';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import ModDialog from './ModDialog.jsx';
import {
  SOURCE_TEXT,
  STATUS_TEXT,
  byCategoryText,
  categoryLabel,
  contentTypeOf,
  formatWhen,
  placeText,
  rolesText,
} from './moderationText.js';
import StatsFilters, { filterParams } from './StatsFilters.jsx';

// Tab "Người vi phạm" (moderation phase 6, FE-08 Anh): one row per person with active violations in the period, the
// most first; "Xuất Excel" with the same filters. A row opens that person's history: each violation with where it
// happened, "Xem" (exactly that one piece, logged by the server) and "Gỡ ẩn" for a violation found by the automatic
// check (a reason is required). The table never shows content.

const PAGE_SIZE = 20;
const TREND = {
  up: { icon: 'trending_up', text: 'Tăng' },
  down: { icon: 'trending_down', text: 'Giảm' },
  same: { icon: 'trending_flat', text: 'Như cũ' },
};
const MAX_REASON = 500;

export default function ViolatorsTab({ filters, onFilters }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [exporting, setExporting] = useState(false);
  const [person, setPerson] = useState(null); // { userId, fullName }

  useEffect(() => setPage(1), [filters]);

  useEffect(() => {
    if (person) return undefined;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: '' }));
    listViolators({ ...filterParams(filters), page, pageSize: PAGE_SIZE }, { signal: controller.signal })
      .then((data) => setState({ loading: false, data, error: '' }))
      .catch((err) => {
        if (!controller.signal.aborted) setState({ loading: false, data: null, error: errorText(err) });
      });
    return () => controller.abort();
  }, [filters, page, person]);

  async function doExport() {
    setExporting(true);
    try {
      await exportViolators(filterParams(filters));
    } catch (err) {
      toast(errorText(err), { type: 'error' });
    } finally {
      setExporting(false);
    }
  }

  if (person) return <PersonHistory person={person} onBack={() => setPerson(null)} />;

  const { data } = state;
  return (
    <section aria-label="Người vi phạm">
      <StatsFilters value={filters} onChange={onFilters} />
      <div className="mod-toolbar">
        <p className="caption muted">
          {data && `Từ ${formatWhen(data.from)} đến ${formatWhen(data.to)} · ${data.total.toLocaleString('vi-VN')} người · chỉ tính các lần vi phạm đang có hiệu lực`}
        </p>
        <button type="button" className="btn btn-secondary" onClick={doExport} disabled={exporting || !data?.total}>
          <Icon name={exporting ? 'progress_activity' : 'download'} size="sm" />
          {exporting ? 'Đang xuất…' : 'Xuất Excel'}
        </button>
      </div>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <div className="table-scroll card card-outline mod-table-card" aria-busy={state.loading}>
        <table className="table mod-table">
          <thead>
            <tr>
              <th>Họ tên</th>
              <th>Vai trò</th>
              <th>Lớp</th>
              <th className="num">Tổng</th>
              <th>Theo loại</th>
              <th>Nguồn</th>
              <th>Cách phát hiện</th>
              <th>Lần gần nhất</th>
              <th>Xu hướng</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={r.userId}>
                <td>
                  <button type="button" className="link-button mod-name" onClick={() => setPerson(r)}>
                    {r.fullName}
                  </button>
                </td>
                <td>{rolesText(r.roles)}</td>
                <td>{r.className ?? '—'}</td>
                <td className="num mono">{r.total}</td>
                <td>{byCategoryText(r.byCategory)}</td>
                <td className="nowrap">Bình luận {r.byContentType.COMMENT} · Tin nhắn {r.byContentType.MESSAGE}</td>
                <td className="nowrap">Tự động {r.bySource.AUTO} · Qua báo cáo {r.bySource.REPORT}</td>
                <td className="nowrap">{formatWhen(r.lastAt)}</td>
                <td className="nowrap" title={`Kỳ trước: ${r.previousTotal}`}>
                  <span className={`mod-trend is-${r.trend}`}>
                    <Icon name={TREND[r.trend].icon} size="sm" />
                    {TREND[r.trend].text}
                  </span>
                  <span className="caption muted"> (kỳ trước {r.previousTotal})</span>
                </td>
              </tr>
            ))}
            {data && !data.items.length && (
              <tr>
                <td colSpan={9} className="empty-row">Không có ai vi phạm trong khoảng đang lọc.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data && <FeedPager page={page} total={data.total} pageSize={PAGE_SIZE} onPage={setPage} />}
    </section>
  );
}

// One person's violations (all time), with "Xem" and "Gỡ ẩn".
function PersonHistory({ person, onBack }) {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  const [viewing, setViewing] = useState(null); // { item, content?, error? }
  const [unhiding, setUnhiding] = useState(null); // the item

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: '' }));
    getUserHistory(person.userId, { signal: controller.signal })
      .then((data) => setState({ loading: false, data, error: '' }))
      .catch((err) => {
        if (!controller.signal.aborted) setState({ loading: false, data: null, error: errorText(err) });
      });
    return () => controller.abort();
  }, [person.userId, attempt]);

  async function view(item) {
    setViewing({ item });
    try {
      const content = await getViolationContent(item.violationId);
      setViewing({ item, content });
    } catch (err) {
      setViewing({ item, error: errorText(err) });
    }
  }

  const { data } = state;
  return (
    <section aria-label={`Lịch sử vi phạm của ${person.fullName}`}>
      <button type="button" className="btn btn-tertiary mod-back" onClick={onBack}>
        <Icon name="arrow_back" size="sm" />
        Quay lại danh sách
      </button>
      <div className="mod-person">
        <h2 className="title-md">{person.fullName}</h2>
        <p className="caption muted">
          {rolesText(data?.roles ?? person.roles)}
          {person.className && ` · Lớp ${person.className}`} · toàn bộ lịch sử, mới nhất trước
        </p>
      </div>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <div className="table-scroll card card-outline mod-table-card" aria-busy={state.loading}>
        <table className="table mod-table">
          <thead>
            <tr>
              <th>Thời điểm</th>
              <th>Loại</th>
              <th>Nguồn</th>
              <th>Nơi xảy ra</th>
              <th>Cách phát hiện</th>
              <th>Trạng thái</th>
              <th aria-label="Thao tác" />
            </tr>
          </thead>
          <tbody>
            {data?.items.map((v) => (
              <tr key={v.violationId}>
                <td className="nowrap">{formatWhen(v.createdAt)}</td>
                <td>{categoryLabel(v.category)}</td>
                <td>{contentTypeOf(v.contentType)}</td>
                <td>{placeText(v.place)}</td>
                <td>{SOURCE_TEXT[v.source]}</td>
                <td>
                  <span className={`pill${v.status === 'ACTIVE' ? '' : ' green'}`}>{STATUS_TEXT[v.status]}</span>
                  {v.status === 'UNHIDDEN' && (
                    <p className="caption muted mod-unhide-info">
                      {formatWhen(v.unhiddenAt)}
                      {v.unhiddenByName && ` · ${v.unhiddenByName}`}
                      {v.unhideReason && ` · “${v.unhideReason}”`}
                    </p>
                  )}
                </td>
                <td className="nowrap mod-actions">
                  {/* canView: false for a REPORT violation of a class group comment (decided by the homeroom teacher) */}
                  {v.canView && (
                    <button type="button" className="btn btn-secondary" onClick={() => view(v)}>
                      <Icon name="visibility" size="sm" />
                      Xem
                    </button>
                  )}
                  {v.canUnhide && (
                    <button type="button" className="btn btn-secondary" onClick={() => setUnhiding(v)}>
                      <Icon name="undo" size="sm" />
                      Gỡ ẩn
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data && !data.items.length && (
              <tr>
                <td colSpan={7} className="empty-row">Người này chưa có lần vi phạm nào.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {viewing && <ContentDialog viewing={viewing} onClose={() => setViewing(null)} />}
      {unhiding && (
        <UnhideDialog
          item={unhiding}
          onClose={() => setUnhiding(null)}
          onDone={() => {
            setUnhiding(null);
            toast('Đã gỡ ẩn. Nội dung hiện lại và người viết đã được báo.');
            setAttempt((n) => n + 1);
          }}
        />
      )}
    </section>
  );
}

// Exactly one piece of content (the server logs every opening).
function ContentDialog({ viewing, onClose }) {
  const { item, content, error } = viewing;
  return (
    <ModDialog
      title={`${contentTypeOf(item.contentType)} vi phạm`}
      onClose={onClose}
      wide
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose} autoFocus>
          Đóng
        </button>
      }
    >
      <p className="caption muted">
        {categoryLabel(item.category)} · {SOURCE_TEXT[item.source]} · {placeText(item.place)}
      </p>
      {!content && !error && <p className="caption muted">Đang tải…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {content && (
        <>
          <blockquote className="mod-quote">
            <p className="mod-quote-meta caption">
              <strong>{content.authorName}</strong> · {formatWhen(content.writtenAt)}
            </p>
            <p className="mod-quote-text">{content.content ?? '(không có chữ)'}</p>
            {content.attachments?.length > 0 && (
              <p className="caption muted">
                <Icon name="attach_file" size="sm" /> {content.attachments.map((a) => a.fileName).join(', ')}
              </p>
            )}
          </blockquote>
          <div className="notice">
            <Icon name="history" size="sm" />
            <p>Lần xem này đã được ghi vào nhật ký hệ thống.</p>
          </div>
        </>
      )}
    </ModDialog>
  );
}

function UnhideDialog({ item, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const length = [...reason.trim()].length;
  const ok = length > 0 && length <= MAX_REASON;

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await unhideViolation(item.violationId, reason.trim());
      onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <ModDialog
      title="Gỡ ẩn nội dung"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={!ok || busy}>
            <Icon name={busy ? 'progress_activity' : 'undo'} size="sm" />
            {busy ? 'Đang gỡ ẩn…' : 'Gỡ ẩn'}
          </button>
        </>
      }
    >
      <p>
        {contentTypeOf(item.contentType)} sẽ hiện lại với mọi người, lần vi phạm này không còn được tính và các quy tắc
        đã khớp được ghi nhận một lần bắt nhầm. Người viết nhận thông báo đã được hiển thị lại.
      </p>
      <div className="field">
        <label htmlFor="mod-unhide-reason" className="field-label">
          Lý do gỡ ẩn <span className="caption muted">(bắt buộc)</span>
        </label>
        <textarea
          id="mod-unhide-reason"
          className="input"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          placeholder="Ví dụ: từ này dùng đúng nghĩa trong bài học Lịch sử…"
          aria-invalid={length > MAX_REASON}
        />
        <span className="field-help mono">{length} / {MAX_REASON}</span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </ModDialog>
  );
}
