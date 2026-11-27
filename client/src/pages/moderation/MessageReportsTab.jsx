import { useEffect, useState } from 'react';
import {
  announceModerationChange,
  getReportedMessage,
  listMessageReports,
  readReportContext,
  resolveMessageReport,
} from '../../api/moderation.js';
import { FeedEmpty, FeedPager, FeedTabs } from '../../components/feed/Feed.jsx';
import { SupportBadge, SupportNoteField, SupportNoteResult, supportNoteOk } from '../../components/feed/SupportReport.jsx';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { systemText } from '../chat/chatText.js';
import ModDialog from './ModDialog.jsx';
import { GROUP_TYPE_TEXT, formatWhen, reasonLabel, rolesText } from './moderationText.js';
import '../schoolfeed/CommentReportsPage.css'; // .cr-support-* (shared "Cần được hỗ trợ" pieces)

// Tab "Báo cáo tin nhắn" (moderation phases 5 / 6, FE-08 Anh): the School Manager's queue of reported chat messages,
// "Cần được hỗ trợ" first. Opening one shows ONLY the reported message (not logged). "Xem hội thoại xung quanh" needs
// a reason, then shows a READ-ONLY window of 6 messages before and after it (27/11/2026; the server logs each view
// with its reason). There is no way to read more of the chat. The decision: "Ẩn tin nhắn" or "Giữ nguyên"; a "Cần
// được hỗ trợ" report needs a "Kết quả hỗ trợ", and when every report is one, only "Ghi nhận" is possible. The queue
// itself never shows a message's text nor who reported it. Tab "Đã xử lý": the "Hành vi xử lý" of each report – the
// decision, who and when, the support result, and every "Xem hội thoại xung quanh" (who, when, why).

const PAGE_SIZE = 20;
const TABS = [
  { key: 'PENDING', label: 'Đang chờ' },
  { key: 'HANDLED', label: 'Đã xử lý' },
];
const MAX_REASON = 500;

export default function MessageReportsTab() {
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [open, setOpen] = useState(null); // the queue item being handled

  useEffect(() => {
    if (open) return undefined;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: '' }));
    listMessageReports({ status, page, pageSize: PAGE_SIZE }, { signal: controller.signal })
      .then((data) => setState({ loading: false, data, error: '' }))
      .catch((err) => {
        if (!controller.signal.aborted) setState({ loading: false, data: null, error: errorText(err) });
      });
    return () => controller.abort();
  }, [status, page, attempt, open]);

  if (open) {
    return (
      <ReportDetail
        item={open}
        onBack={(changed) => {
          setOpen(null);
          if (changed) {
            announceModerationChange();
            setAttempt((n) => n + 1);
          }
        }}
      />
    );
  }

  const { data } = state;
  return (
    <section aria-label="Báo cáo tin nhắn">
      <FeedTabs
        tabs={TABS.map((t) => ({ ...t, count: t.key === 'PENDING' ? data?.pendingCount ?? 0 : 0 }))}
        active={status}
        onChange={(key) => {
          setStatus(key);
          setPage(1);
        }}
        label="Trạng thái báo cáo"
      />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <div className="mod-reports" aria-busy={state.loading}>
        {data?.items.map((item) => (
          <article key={item.messageId} className={`card card-outline mod-report${item.hasNeedsSupport ? ' is-support' : ''}`}>
            <header className="mod-report-head">
              {item.hasNeedsSupport && <SupportBadge />}
              <span className="caption muted">
                {item.reportCount} lượt báo cáo · lần đầu {formatWhen(item.firstReportedAt)}
              </span>
            </header>
            <p className="mod-report-who">
              <strong>{item.sender.fullName}</strong>
              <span className="caption muted">
                {' '}· {rolesText(item.sender.roles)}
                {item.sender.className && ` · lớp ${item.sender.className}`} · gửi lúc {formatWhen(item.sentAt)}
              </span>
            </p>
            <p className="caption muted">
              {GROUP_TYPE_TEXT[item.group.groupType] ?? 'Nhóm'}
              {item.group.groupName && ` “${item.group.groupName}”`}
              {item.isRecalled && ' · người gửi đã thu hồi tin'}
              {item.isModerated && ' · tin đang bị ẩn'}
            </p>
            <div className="chips">
              {item.reasons.map((r) => (
                <span key={r.reason} className={`chip ${r.reason === 'NEEDS_SUPPORT' ? 'mod-chip-support' : 'ink'}`}>
                  {reasonLabel(r.reason)}
                  {item.reportCount > 1 && <span className="mono"> × {r.count}</span>}
                </span>
              ))}
            </div>
            {item.notes.length > 0 && (
              <ul className="cr-notes">
                {item.notes.map((n, i) => (
                  <li key={i}>
                    <span className="caption muted">{reasonLabel(n.reason)}:</span> “{n.note}”
                  </li>
                ))}
              </ul>
            )}
            {item.status === 'PENDING' ? (
              <footer className="cr-actions">
                <button type="button" className="btn btn-primary" onClick={() => setOpen(item)}>
                  <Icon name="forum" size="sm" />
                  Mở để xem xét
                </button>
              </footer>
            ) : (
              <HandledActions item={item} />
            )}
          </article>
        ))}
        {data && !data.items.length && (
          <FeedEmpty icon={status === 'PENDING' ? 'verified' : 'flag'}>
            {status === 'PENDING' ? 'Không có báo cáo tin nhắn nào đang chờ.' : 'Chưa có báo cáo nào đã xử lý.'}
          </FeedEmpty>
        )}
      </div>
      {data && <FeedPager page={page} total={data.total} pageSize={PAGE_SIZE} onPage={setPage} />}
    </section>
  );
}

// "Hành vi xử lý" of a handled report (27/11/2026): the decision, who and when, the support result, and every view of
// the messages around it – the same for every School Manager.
function HandledActions({ item }) {
  const hidden = (item.decision ?? (item.status === 'RESOLVED' ? 'HIDE' : 'KEEP')) === 'HIDE';
  const views = item.contextViews ?? [];
  return (
    <div className="mod-handled">
      <p className="mod-handled-title caption">Hành vi xử lý</p>
      <p className="cr-decided">
        <Icon name={hidden ? 'visibility_off' : 'check'} size="sm" />
        <span>
          <strong>{hidden ? 'Ẩn tin nhắn' : item.needsSupportOnly ? 'Ghi nhận' : 'Giữ nguyên'}</strong>
          <span className="caption muted">
            {item.resolvedByName && ` · ${item.resolvedByName}`}
            {item.resolvedAt && ` · ${formatWhen(item.resolvedAt)}`}
          </span>
        </span>
      </p>
      {!item.supportNote && <p className="caption muted">Không có kết quả hỗ trợ.</p>}
      <SupportNoteResult note={item.supportNote} />
      {views.length ? (
        <div className="mod-views">
          <p className="caption muted">Xem hội thoại xung quanh ({views.length} lần):</p>
          <ul className="mod-view-list">
            {views.map((v, i) => (
              <li key={i}>
                <span className="caption">
                  <strong>{v.viewerName ?? 'Không rõ'}</strong> <span className="muted">· {formatWhen(v.viewedAt)}</span>
                </span>
                <span className="mod-view-reason">{v.reason ? `Lý do: ${v.reason}` : 'Không ghi lý do'}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="caption muted mod-views-none">
          <Icon name="visibility" size="sm" /> Không xem hội thoại xung quanh
        </p>
      )}
    </div>
  );
}

// One reported message: the message alone, the 6 + 6 messages around it on request (with a reason), and the decision.
function ReportDetail({ item, onBack }) {
  const toast = useToast();
  const [view, setView] = useState({ loading: true, message: null, error: '' });
  const [around, setAround] = useState(null); // { window, messages } once "Xem hội thoại xung quanh" was used
  const [askReason, setAskReason] = useState(false);
  const [supportNote, setSupportNote] = useState('');
  const [busy, setBusy] = useState(null); // 'HIDE' | 'KEEP'
  const [error, setError] = useState('');
  const support = item.hasNeedsSupport;

  useEffect(() => {
    getReportedMessage(item.messageId)
      .then((data) => setView({ loading: false, message: data.message, error: '' }))
      .catch((err) => setView({ loading: false, message: null, error: errorText(err) }));
  }, [item.messageId]);

  async function openAround(reason) {
    const data = await readReportContext(item.messageId, reason);
    setAround({ window: data.window, messages: data.messages });
    setAskReason(false);
  }

  async function decide(action) {
    setBusy(action);
    setError('');
    try {
      await resolveMessageReport(item.messageId, action, support ? supportNote.trim() : undefined);
      toast(action === 'HIDE' ? 'Đã ẩn tin nhắn và báo cho người gửi.' : support && item.needsSupportOnly ? 'Đã ghi nhận kết quả hỗ trợ.' : 'Đã giữ nguyên tin nhắn.');
      onBack(true);
    } catch (err) {
      setError(errorText(err));
      setBusy(null);
      if (err?.code === 'MSG_REPORT_ALREADY_HANDLED') onBack(true);
    }
  }

  const blocked = Boolean(busy) || (support && !supportNoteOk(supportNote));
  return (
    <section aria-label="Xem xét báo cáo tin nhắn">
      <button type="button" className="btn btn-tertiary mod-back" onClick={() => onBack(false)} disabled={Boolean(busy)}>
        <Icon name="arrow_back" size="sm" />
        Quay lại hàng đợi
      </button>
      <div className={`card card-outline mod-report${support ? ' is-support' : ''}`}>
        <header className="mod-report-head">
          {support && <SupportBadge />}
          <strong>{item.sender.fullName}</strong>
          <span className="caption muted">
            {GROUP_TYPE_TEXT[item.group.groupType] ?? 'Nhóm'}
            {item.group.groupName && ` “${item.group.groupName}”`}
          </span>
        </header>
        <div className="chips">
          {item.reasons.map((r) => (
            <span key={r.reason} className={`chip ${r.reason === 'NEEDS_SUPPORT' ? 'mod-chip-support' : 'ink'}`}>
              {reasonLabel(r.reason)}
              {item.reportCount > 1 && <span className="mono"> × {r.count}</span>}
            </span>
          ))}
        </div>
      </div>

      <div className="mod-chat card card-outline" aria-busy={view.loading}>
        <div className="mod-chat-head">
          <span className="caption muted">
            {around
              ? `${around.window} tin trước và ${around.window} tin sau tin bị báo cáo (chỉ đọc)`
              : 'Tin bị báo cáo (chỉ đọc)'}
          </span>
          {!around && !view.loading && !view.error && (
            <button type="button" className="btn btn-secondary" onClick={() => setAskReason(true)}>
              <Icon name="unfold_more" size="sm" />
              Xem hội thoại xung quanh
            </button>
          )}
        </div>
        {view.error && <p className="form-error" role="alert">{view.error}</p>}
        <ol className="mod-messages">
          {around
            ? around.messages.map((m) => <ReadOnlyMessage key={m.messageId} m={m} />)
            : view.message && <ReadOnlyMessage m={view.message} />}
        </ol>
        <p className="caption muted mod-chat-note">
          <Icon name="history" size="sm" />
          {around
            ? 'Lần xem này đã được ghi vào nhật ký cùng lý do. Thành viên nhóm không được báo.'
            : 'Chỉ hiện tin bị báo cáo. Xem hội thoại xung quanh cần lý do và được ghi vào nhật ký.'}
        </p>
      </div>

      <div className="card card-outline mod-decide">
        {support && <SupportNoteField value={supportNote} onChange={setSupportNote} disabled={Boolean(busy)} writer="Người gửi tin" />}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="cr-actions">
          <button type="button" className={`btn ${item.needsSupportOnly ? 'btn-primary' : 'btn-secondary'}`} onClick={() => decide('KEEP')} disabled={blocked}>
            <Icon name={busy === 'KEEP' ? 'progress_activity' : item.needsSupportOnly ? 'task_alt' : 'check'} size="sm" />
            {busy === 'KEEP' ? 'Đang lưu…' : item.needsSupportOnly ? 'Ghi nhận' : 'Giữ nguyên'}
          </button>
          {!item.needsSupportOnly && (
            <button type="button" className="btn btn-primary sf-btn-danger" onClick={() => decide('HIDE')} disabled={blocked}>
              <Icon name={busy === 'HIDE' ? 'progress_activity' : 'visibility_off'} size="sm" />
              {busy === 'HIDE' ? 'Đang ẩn…' : 'Ẩn tin nhắn'}
            </button>
          )}
        </div>
      </div>

      {askReason && <ContextDialog onClose={() => setAskReason(false)} onConfirm={openAround} />}
    </section>
  );
}

function ReadOnlyMessage({ m }) {
  if (m.type === 'SYSTEM') {
    return <li className="mod-msg-system caption muted">{systemText(m, null)} · {formatWhen(m.sentAt)}</li>;
  }
  const name = m.senderNickname ? `${m.senderNickname} (${m.senderName})` : m.senderName;
  return (
    <li className={`mod-msg${m.isReported ? ' is-reported' : ''}`}>
      <p className="caption">
        <strong>{name}</strong> <span className="muted">· {formatWhen(m.sentAt)}</span>
        {m.isReported && <span className="pill amber mod-msg-pill">Tin bị báo cáo</span>}
        {m.isModerated && <span className="pill mod-msg-pill">Đã bị ẩn</span>}
        {m.recalledAfterReport && <span className="pill mod-msg-pill">Đã thu hồi sau khi bị báo cáo</span>}
      </p>
      {m.content !== null ? (
        <p className="mod-msg-text">{m.content}</p>
      ) : (
        <p className="mod-msg-text is-empty">{m.isRecalled ? 'Tin nhắn đã được thu hồi' : '(chỉ có tệp)'}</p>
      )}
      {m.attachments?.length > 0 && (
        <p className="caption muted">
          <Icon name="attach_file" size="sm" /> {m.attachments.map((a) => a.fileName).join(', ')}
        </p>
      )}
    </li>
  );
}

function ContextDialog({ onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const length = [...reason.trim()].length;
  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }
  return (
    <ModDialog
      title="Xem hội thoại xung quanh"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy || length === 0 || length > MAX_REASON}>
            {busy ? 'Đang mở…' : 'Xem'}
          </button>
        </>
      }
    >
      <p>
        Hiện 6 tin trước và 6 tin sau tin bị báo cáo, của mọi người trong cuộc trò chuyện. Chỉ xem khi cần để xử lý báo
        cáo này. Lý do được lưu vào nhật ký và mọi thành viên Ban giám hiệu thấy được ở mục Đã xử lý.
      </p>
      <div className="field">
        <label htmlFor="mod-view-reason" className="field-label">
          Lý do <span className="caption muted">(bắt buộc)</span>
        </label>
        <textarea id="mod-view-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} autoFocus />
        <span className="field-help mono">{length} / {MAX_REASON}</span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </ModDialog>
  );
}
