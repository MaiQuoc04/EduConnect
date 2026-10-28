import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listActivityLogs } from '../../api/admin.js';
import Icon from '../../components/Icon.jsx';
import { errorText, ROLE_LABELS } from '../../messages.js';
import { formatDateTime } from './format.js';
import './admin.css';

// SCR-64 Activity Log (UC-101 View Activity Log). Read only; filters live in the URL.

export const ACTION_LABELS = {
  LOGIN_SUCCESS: 'Đăng nhập thành công',
  LOGIN_FAILED: 'Đăng nhập thất bại',
  ACCOUNT_CREATE: 'Tạo tài khoản',
  ACCOUNT_IMPORT: 'Nhập tài khoản từ file',
  ACCOUNT_LOCK: 'Khoá tài khoản',
  ACCOUNT_UNLOCK: 'Mở khoá tài khoản',
  PASSWORD_RESET: 'Đặt lại mật khẩu',
  ROLE_CHANGE: 'Đổi vai trò',
  SETTING_CHANGE: 'Đổi cài đặt hệ thống',
  GRADE_UNLOCK: 'Mở khoá sổ điểm',
};
const ACTION_TONE = { LOGIN_FAILED: 'red', ACCOUNT_LOCK: 'red', PASSWORD_RESET: 'amber', SETTING_CHANGE: 'amber', GRADE_UNLOCK: 'amber' };

const IMPORT_TYPE_TEXT = { STUDENT: 'học sinh', TEACHER: 'giáo viên', PARENT: 'phụ huynh', SCHOOL_MANAGER: 'quản lý nhà trường' };
const SETTING_TEXT = {
  'login.max_failed_attempts': 'Số lần nhập sai trước khi khoá tạm',
  'login.lock_minutes_step': 'Thời gian khoá tạm tăng thêm',
  'login.lock_minutes_max': 'Thời gian khoá tạm tối đa',
  'otp.expiry_minutes': 'Thời hạn mã OTP',
  'upload.max_file_mb': 'Dung lượng tối đa ảnh, tệp',
  'upload.max_video_mb': 'Dung lượng tối đa video',
  'attendance.edit_deadline_time': 'Giờ cuối sửa điểm danh',
};

// One readable line for the "Chi tiết" column, built from the action and its stored detail.
function summary(l) {
  const d = l.detail ?? {};
  const target = l.targetType === 'USER' && l.targetFullName ? `${l.targetFullName} (${l.targetUsername})` : null;
  const join = (...parts) => parts.filter(Boolean).join(' – ');
  switch (l.action) {
    case 'LOGIN_SUCCESS':
      return null;
    case 'LOGIN_FAILED':
      if (d.identifier) return `Tên đăng nhập không tồn tại: ${d.identifier}`;
      return d.failed ? `Sai mật khẩu (lần ${d.failed} liên tiếp)` : 'Sai mật khẩu';
    case 'ACCOUNT_CREATE':
      return join(target, d.roles?.length && `vai trò ${d.roles.map((r) => (ROLE_LABELS[r] ?? r).toLowerCase()).join(', ')}`);
    case 'ACCOUNT_IMPORT':
      return join(
        `${d.created ?? 0} tài khoản ${IMPORT_TYPE_TEXT[d.type] ?? ''}`.trim(),
        d.fileName && `tệp ${d.fileName}`,
        d.skipped ? `bỏ qua ${d.skipped} dòng lỗi` : null,
      );
    case 'ACCOUNT_LOCK':
      return join(target, d.reason && `Lý do: ${d.reason}`);
    case 'ACCOUNT_UNLOCK':
      return join(target, d.type === 'TEMPORARY' ? 'gỡ khoá đăng nhập tạm thời' : 'mở khoá tài khoản');
    case 'PASSWORD_RESET':
      if (d.step === 'OTP_SENT') return 'Gửi mã OTP qua email';
      if (d.step === 'DONE') return 'Tự đặt lại mật khẩu bằng mã OTP';
      return join(target, d.fromRequest && 'theo yêu cầu cấp lại mật khẩu');
    case 'SETTING_CHANGE':
      return `${SETTING_TEXT[d.key] ?? d.key}: ${d.oldValue} → ${d.newValue}`;
    default:
      return join(target, Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(', '));
  }
}

// Requests made on the server itself show up as ::1 / 127.0.0.1.
function ipText(ip) {
  if (!ip) return null;
  const clean = ip.replace(/^::ffff:/, '');
  return clean === '::1' || clean === '127.0.0.1' ? 'Máy cục bộ' : clean;
}

export default function ActivityLogPage() {
  const [params, setParams] = useSearchParams();
  const [user, setUser] = useState(params.get('user') ?? '');
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const action = params.get('action') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Number(params.get('page')) || 1;
  const rangeError = from && to && from > to;

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('user') ?? '') !== user.trim()) update({ user: user.trim() });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (rangeError) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    listActivityLogs({
      action: action || undefined,
      user: params.get('user') || undefined,
      from: from || undefined,
      to: to || undefined,
      page,
    })
      .then((data) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [params, action, from, to, page, rangeError]);

  const { data } = state;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Quản trị hệ thống</span>/<span className="current">Nhật ký hoạt động</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Nhật ký hoạt động</h1>
          <p>Các thao tác quan trọng: đăng nhập, tài khoản, mật khẩu, cài đặt và mở khoá sổ điểm. Nhật ký không thể sửa hay xoá.</p>
        </div>
      </div>

      <section className="card card-outline admin-wide list-card">
        <div className="filters logs-filters">
          <select className="input" value={action} onChange={(e) => update({ action: e.target.value })} aria-label="Loại thao tác">
            <option value="">Mọi thao tác</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <div className="input-wrap search-box">
            <span className="input-icon" aria-hidden="true">
              <Icon name="person_search" size="sm" />
            </span>
            <input
              className="input has-icon"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="Người thực hiện (họ tên hoặc tên đăng nhập)"
              aria-label="Người thực hiện"
            />
          </div>
          <label className="date-filter">
            <span className="caption muted">Từ ngày</span>
            <input type="date" className="input" value={from} onChange={(e) => update({ from: e.target.value })} />
          </label>
          <label className="date-filter">
            <span className="caption muted">Đến ngày</span>
            <input type="date" className="input" value={to} onChange={(e) => update({ to: e.target.value })} />
          </label>
        </div>
        {rangeError && <p className="field-error" style={{ marginBottom: 12 }}>Ngày bắt đầu không được sau ngày kết thúc.</p>}
        {state.error && (
          <p className="form-error" role="alert">
            <Icon name="error" size="sm" />
            {state.error}
          </p>
        )}
        <div className="list-meta caption muted">{data && !rangeError && `${data.total} bản ghi`}</div>

        <div className={`table-scroll${state.loading ? ' is-loading' : ''}`}>
          <table className="table logs-table">
            <thead>
              <tr>
                <th>Thời điểm</th>
                <th>Người thực hiện</th>
                <th>Thao tác</th>
                <th>Chi tiết</th>
                <th>Địa chỉ IP</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((l) => (
                <tr key={l.id}>
                  <td className="mono nowrap">{formatDateTime(l.createdAt)}</td>
                  <td>
                    {l.fullName ? (
                      <span className="user-cell plain">
                        <span>
                          <span className="name">{l.fullName}</span>
                          <span className="caption muted mono">{l.username}</span>
                        </span>
                      </span>
                    ) : (
                      <span className="muted">Tài khoản không xác định</span>
                    )}
                  </td>
                  <td>
                    <span className={`tag ${ACTION_TONE[l.action] ?? ''}`}>{ACTION_LABELS[l.action] ?? l.action}</span>
                  </td>
                  <td className="log-summary">{summary(l) ?? <span className="muted">—</span>}</td>
                  <td className="mono caption nowrap">{ipText(l.ip) ?? <span className="muted">—</span>}</td>
                </tr>
              ))}
              {data && !data.items.length && (
                <tr>
                  <td colSpan={5} className="empty-row">
                    Không có kết quả tìm kiếm.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {data && pages > 1 && (
          <div className="pager">
            <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
              <Icon name="chevron_left" size="sm" />
              Mới hơn
            </button>
            <span className="caption muted">
              Trang {page} / {pages}
            </span>
            <button type="button" className="btn btn-secondary" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>
              Cũ hơn
              <Icon name="chevron_right" size="sm" />
            </button>
          </div>
        )}
      </section>
    </>
  );
}
