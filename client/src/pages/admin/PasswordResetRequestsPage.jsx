import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listResetRequests, rejectResetRequest, resetPassword } from '../../api/admin.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText, ROLE_LABELS } from '../../messages.js';
import Dialog from './Dialog.jsx';
import { formatDateTime } from './format.js';
import './admin.css';

// Password reset requests (business-rules §3, 27/10/2026). Users who cannot use the OTP email send a request from the
// Forgot Password screen (FE-01). System Admin handles all of them, School Manager those of student, parent and
// teacher accounts. Handling = check the person's identity outside the system, then UC-97 Reset Password (the
// request becomes DONE) or reject.

const TABS = [
  { status: 'PENDING', label: 'Đang chờ xử lý' },
  { status: 'DONE', label: 'Đã cấp lại' },
  { status: 'REJECTED', label: 'Đã từ chối' },
];

export default function PasswordResetRequestsPage() {
  const { activeRole } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = TABS.some((t) => t.status === params.get('status')) ? params.get('status') : 'PENDING';
  const page = Number(params.get('page')) || 1;
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [dialog, setDialog] = useState(null); // { kind: 'reset' | 'reject' | 'password', item, password? }
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    listResetRequests({ status, page })
      .then((data) => setState({ loading: false, data, error: '' }))
      .catch((err) => setState({ loading: false, data: null, error: errorText(err) }));
  }, [status, page]);
  useEffect(load, [load]);

  function close() {
    setDialog(null);
    setDialogError('');
  }

  async function confirm() {
    setBusy(true);
    setDialogError('');
    try {
      if (dialog.kind === 'reset') {
        const result = await resetPassword(dialog.item.userId);
        setDialog({ kind: 'password', item: dialog.item, password: result.temporaryPassword });
      } else {
        await rejectResetRequest(dialog.item.id);
        toast('Đã từ chối yêu cầu.');
        close();
      }
      load();
    } catch (err) {
      setDialogError(errorText(err));
      if (err.code === 'MSG_REQUEST_HANDLED') load();
    } finally {
      setBusy(false);
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Đã sao chép mật khẩu tạm thời.');
    } catch {
      toast('Không sao chép được. Vui lòng chọn và sao chép thủ công.', { type: 'error' });
    }
  }

  const { data } = state;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const accountLink = (item) => (activeRole === 'SYSTEM_ADMIN' ? `/admin/accounts/${item.userId}` : null);

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Tài khoản</span>/<span className="current">Yêu cầu cấp lại mật khẩu</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Yêu cầu cấp lại mật khẩu</h1>
          <p>
            Người dùng không lấy lại được mật khẩu qua email gửi yêu cầu từ màn Quên mật khẩu.
            {activeRole === 'SCHOOL_MANAGER' && ' Bạn xử lý yêu cầu của học sinh, phụ huynh và giáo viên.'}
          </p>
        </div>
      </div>

      <div className="notice amber" style={{ marginBottom: 20, maxWidth: 1100 }}>
        <Icon name="verified_user" />
        <div>
          <p className="notice-title">Xác minh danh tính trước khi cấp lại</p>
          <p>
            Bất kỳ ai biết tên đăng nhập đều có thể gửi yêu cầu. Hãy liên hệ trực tiếp người dùng (hoặc phụ huynh, giáo viên chủ
            nhiệm) để xác nhận trước khi đặt lại mật khẩu, rồi bàn giao mật khẩu tạm thời trực tiếp.
          </p>
        </div>
      </div>

      <section className="card card-outline admin-wide list-card">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.status}
              type="button"
              role="tab"
              aria-selected={status === t.status}
              className={`tab${status === t.status ? ' active' : ''}`}
              onClick={() => setParams(t.status === 'PENDING' ? {} : { status: t.status }, { replace: true })}
            >
              {t.label}
              {t.status === 'PENDING' && data?.pendingCount > 0 && <span className="count-badge">{data.pendingCount}</span>}
            </button>
          ))}
        </div>

        {state.error && (
          <p className="form-error" role="alert" style={{ marginTop: 16 }}>
            <Icon name="error" size="sm" />
            {state.error}
          </p>
        )}

        <div className={`request-list${state.loading ? ' is-loading' : ''}`}>
          {data?.items.map((r) => {
            const link = accountLink(r);
            const who = (
              <span className="user-cell">
                <Avatar name={r.fullName} size={36} />
                <span>
                  <span className="name">{r.fullName}</span>
                  <span className="caption muted mono">
                    {r.username}
                    {r.code && ` · ${r.code}`}
                  </span>
                </span>
              </span>
            );
            return (
              <article key={r.id} className="request-item">
                <div className="who">
                  {link ? <Link to={link}>{who}</Link> : who}
                  <span className="chips">
                    {r.roles.map((role) => (
                      <span key={role} className="chip">
                        {ROLE_LABELS[role] ?? role}
                      </span>
                    ))}
                    {r.accountStatus === 'LOCKED' && <span className="tag red">Tài khoản đã khoá</span>}
                  </span>
                </div>
                <div className="what">
                  <p className={r.reason ? '' : 'muted'}>{r.reason ? `“${r.reason}”` : 'Không ghi lý do.'}</p>
                  <p className="caption muted">
                    Gửi lúc {formatDateTime(r.createdAt)}
                    {r.phone && (
                      <>
                        {' '}
                        · SĐT <span className="mono">{r.phone}</span>
                      </>
                    )}
                    {r.email && ` · ${r.email}`}
                  </p>
                  {r.status !== 'PENDING' && (
                    <p className="caption muted">
                      {r.status === 'DONE' ? 'Đã cấp lại' : 'Đã từ chối'} lúc {formatDateTime(r.handledAt)}
                      {r.handledByName && ` bởi ${r.handledByName}`}
                    </p>
                  )}
                </div>
                {r.status === 'PENDING' && (
                  <div className="actions-row">
                    <button type="button" className="btn btn-danger" onClick={() => setDialog({ kind: 'reject', item: r })}>
                      Từ chối
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: 'reset', item: r })}>
                      <Icon name="key" size="sm" />
                      Đặt lại mật khẩu
                    </button>
                  </div>
                )}
              </article>
            );
          })}
          {data && !data.items.length && (
            <p className="empty-row" style={{ display: 'grid', placeItems: 'center' }}>
              {status === 'PENDING' ? 'Không có yêu cầu nào đang chờ.' : 'Chưa có yêu cầu nào.'}
            </p>
          )}
        </div>

        {data && pages > 1 && (
          <div className="pager">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => setParams({ ...(status !== 'PENDING' && { status }), page: String(page - 1) }, { replace: true })}
            >
              Trước
            </button>
            <span className="caption muted">
              Trang {page} / {pages}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page >= pages}
              onClick={() => setParams({ ...(status !== 'PENDING' && { status }), page: String(page + 1) }, { replace: true })}
            >
              Sau
            </button>
          </div>
        )}
      </section>

      {(dialog?.kind === 'reset' || dialog?.kind === 'reject') && (
        <Dialog
          title={dialog.kind === 'reset' ? 'Đặt lại mật khẩu' : 'Từ chối yêu cầu'}
          icon={dialog.kind === 'reset' ? 'key' : 'block'}
          tone={dialog.kind === 'reset' ? 'ink' : 'red'}
          onClose={close}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>
                Huỷ
              </button>
              <button
                type="button"
                className={dialog.kind === 'reset' ? 'btn btn-primary' : 'btn btn-danger-solid'}
                onClick={confirm}
                disabled={busy}
              >
                {busy ? 'Đang xử lý…' : dialog.kind === 'reset' ? 'Đã xác minh, đặt lại' : 'Từ chối'}
              </button>
            </>
          }
        >
          {dialog.kind === 'reset' ? (
            <p>
              Bạn đã xác minh đây đúng là <strong>{dialog.item.fullName}</strong> (<span className="mono">{dialog.item.username}</span>)?
              Hệ thống tạo mật khẩu tạm thời mới, mật khẩu cũ không dùng được nữa và yêu cầu được đánh dấu đã cấp lại.
            </p>
          ) : (
            <p>
              Từ chối yêu cầu của <strong>{dialog.item.fullName}</strong>? Tài khoản không thay đổi. Người dùng có thể gửi yêu cầu
              mới sau đó.
            </p>
          )}
          {dialog.kind === 'reset' && dialog.item.accountStatus === 'LOCKED' && (
            <p className="caption muted">Tài khoản đang bị khoá: người dùng chỉ đăng nhập được sau khi được mở khoá.</p>
          )}
          {dialogError && (
            <p className="form-error" role="alert">
              <Icon name="error" size="sm" />
              {dialogError}
            </p>
          )}
        </Dialog>
      )}

      {dialog?.kind === 'password' && (
        <Dialog
          title="Mật khẩu tạm thời"
          icon="check_circle"
          onClose={close}
          footer={
            <button type="button" className="btn btn-primary" onClick={close}>
              Đã ghi lại
            </button>
          }
        >
          <p>
            Mật khẩu mới của <strong>{dialog.item.fullName}</strong> (<span className="mono">{dialog.item.username}</span>):
          </p>
          <div className="code-box secret-box">
            <span>{dialog.password}</span>
            <button type="button" className="btn btn-icon" onClick={() => copy(dialog.password)} aria-label="Sao chép mật khẩu tạm thời">
              <Icon name="content_copy" size="sm" />
            </button>
          </div>
          <div className="notice amber">
            <Icon name="warning" />
            <p>Mật khẩu chỉ hiển thị một lần. Bàn giao trực tiếp cho người dùng; họ phải đổi mật khẩu ngay khi đăng nhập.</p>
          </div>
        </Dialog>
      )}
    </>
  );
}
