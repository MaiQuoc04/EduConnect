import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listResetRequests } from '../../api/admin.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText, ROLE_LABELS } from '../../messages.js';
import { formatDateTime } from './format.js';
import './admin.css';

// Password reset requests (business-rules §3; FE-13 change of 31/10/2026, see server resetRequests.js). Users who
// cannot use the OTP email send a request from the Forgot Password screen (FE-01); the system issues a one-time
// password at once. System Admin sees all requests, School Manager those of student, parent and teacher accounts.
// They read the password here and hand it over; the request is "used" once the user signs in with it.

const TABS = [
  { status: 'PENDING', label: 'Chờ người dùng đăng nhập' },
  { status: 'DONE', label: 'Đã dùng' },
];

function PasswordBox({ value }) {
  const toast = useToast();
  const [shown, setShown] = useState(false);
  if (!value) {
    return (
      <p className="caption muted">
        Không đọc được mật khẩu. Hãy đặt lại mật khẩu trong trang chi tiết tài khoản.
      </p>
    );
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast('Đã sao chép mật khẩu dùng một lần.');
    } catch {
      toast('Không sao chép được. Vui lòng chọn và sao chép thủ công.', { type: 'error' });
    }
  }
  return (
    <div className="request-password">
      <span className="caption muted">Mật khẩu dùng một lần</span>
      <div className="code-box secret-box">
        <span>{shown ? value : '••••••••••••'}</span>
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        >
          <Icon name={shown ? 'visibility_off' : 'visibility'} size="sm" />
        </button>
        <button type="button" className="btn btn-icon" onClick={copy} aria-label="Sao chép mật khẩu">
          <Icon name="content_copy" size="sm" />
        </button>
      </div>
    </div>
  );
}

export default function PasswordResetRequestsPage() {
  const { activeRole } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = TABS.some((t) => t.status === params.get('status')) ? params.get('status') : 'PENDING';
  const page = Number(params.get('page')) || 1;
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    listResetRequests({ status, page })
      .then((data) => setState({ loading: false, data, error: '' }))
      .catch((err) => setState({ loading: false, data: null, error: errorText(err) }));
  }, [status, page]);
  useEffect(load, [load]);

  const { data } = state;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const accountLink = (item) => (activeRole === 'SYSTEM_ADMIN' ? `/admin/accounts/${item.userId}` : null);
  const go = (p) => setParams({ ...(status !== 'PENDING' && { status }), page: String(p) }, { replace: true });

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Tài khoản</span>/<span className="current">Yêu cầu cấp lại mật khẩu</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Yêu cầu cấp lại mật khẩu</h1>
          <p>
            Khi người dùng gửi yêu cầu từ màn Quên mật khẩu, hệ thống cấp ngay một mật khẩu dùng một lần và mật khẩu cũ
            không còn dùng được.
            {activeRole === 'SCHOOL_MANAGER' && ' Bạn thấy yêu cầu của học sinh, phụ huynh và giáo viên.'}
          </p>
        </div>
        <button type="button" className="btn btn-secondary header-actions" onClick={load} disabled={state.loading}>
          <Icon name="refresh" size="sm" />
          Tải lại
        </button>
      </div>

      <div className="notice amber" style={{ marginBottom: 20, maxWidth: 1100 }}>
        <Icon name="verified_user" />
        <div>
          <p className="notice-title">Xác minh danh tính trước khi bàn giao</p>
          <p>
            Bất kỳ ai biết tên đăng nhập đều có thể gửi yêu cầu. Hãy liên hệ trực tiếp người dùng (hoặc phụ huynh, giáo viên
            chủ nhiệm) để xác nhận, rồi mới đưa mật khẩu. Mật khẩu hiển thị ở đây cho đến khi người dùng đăng nhập; lần đầu
            đăng nhập, họ phải đặt mật khẩu mới.
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
                  {r.status === 'DONE' && (
                    <p className="caption muted">
                      {r.handledByName
                        ? `Đã đặt lại mật khẩu lúc ${formatDateTime(r.handledAt)} bởi ${r.handledByName}`
                        : `Người dùng đã đăng nhập lúc ${formatDateTime(r.handledAt)}`}
                    </p>
                  )}
                  {r.status === 'PENDING' && r.accountStatus === 'LOCKED' && (
                    <p className="caption muted">Tài khoản đang bị khoá: người dùng chỉ đăng nhập được sau khi được mở khoá.</p>
                  )}
                </div>
                {r.status === 'PENDING' && <PasswordBox value={r.temporaryPassword} />}
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
            <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => go(page - 1)}>
              Trước
            </button>
            <span className="caption muted">
              Trang {page} / {pages}
            </span>
            <button type="button" className="btn btn-secondary" disabled={page >= pages} onClick={() => go(page + 1)}>
              Sau
            </button>
          </div>
        )}
      </section>
    </>
  );
}
