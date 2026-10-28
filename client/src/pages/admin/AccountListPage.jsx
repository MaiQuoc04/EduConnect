import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { exportAccounts, listAccounts } from '../../api/admin.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText, ROLE_LABELS } from '../../messages.js';
import { formatDate } from '../../utils/format.js';
import './admin.css';

// SCR-59 Account List (UC-94 View Account List, UC-95 Export Account List). The System Admin home page.
// Filters live in the URL (?search=&role=&status=&page=) so Back returns to the same list.

const ROLE_OPTIONS = ['STUDENT', 'PARENT', 'TEACHER', 'SCHOOL_MANAGER', 'SYSTEM_ADMIN'];

function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function AccountListPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const debounced = useDebounced(search.trim(), 350);
  const role = params.get('role') ?? '';
  const status = params.get('status') ?? '';
  const page = Number(params.get('page')) || 1;
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [exporting, setExporting] = useState(false);

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
    if ((params.get('search') ?? '') !== debounced) update({ search: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    listAccounts({ search: params.get('search') || undefined, role: role || undefined, status: status || undefined, page })
      .then((data) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [params, role, status, page]);

  async function handleExport() {
    setExporting(true);
    try {
      await exportAccounts({ search: params.get('search') || undefined, role: role || undefined, status: status || undefined });
    } catch (err) {
      toast(errorText(err), { type: 'error' });
    } finally {
      setExporting(false);
    }
  }

  const { data } = state;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = Boolean(params.get('search') || role || status);

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Quản trị hệ thống</span>/<span className="current">Tài khoản</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Tài khoản người dùng</h1>
          <p>Tạo, tìm kiếm và quản lý trạng thái đăng nhập của mọi tài khoản trong trường.</p>
        </div>
        <div className="actions-row header-actions">
          <Link to="/admin/accounts/import" className="btn btn-secondary">
            <Icon name="upload_file" size="sm" />
            Nhập từ file
          </Link>
          <Link to="/admin/accounts/new" className="btn btn-primary">
            <Icon name="person_add" size="sm" />
            Tạo tài khoản
          </Link>
        </div>
      </div>

      <section className="card card-outline admin-wide list-card">
        <div className="filters">
          <div className="input-wrap search-box">
            <span className="input-icon" aria-hidden="true">
              <Icon name="search" size="sm" />
            </span>
            <input
              className="input has-icon"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo họ tên, tên đăng nhập, email, SĐT hoặc mã"
              aria-label="Tìm kiếm tài khoản"
            />
          </div>
          <select className="input" value={role} onChange={(e) => update({ role: e.target.value })} aria-label="Lọc theo vai trò">
            <option value="">Tất cả vai trò</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <select className="input" value={status} onChange={(e) => update({ status: e.target.value })} aria-label="Lọc theo trạng thái">
            <option value="">Mọi trạng thái</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="LOCKED">Đã khoá</option>
          </select>
          <button type="button" className="btn btn-secondary" onClick={handleExport} disabled={exporting || !data?.total}>
            <Icon name="download" size="sm" />
            {exporting ? 'Đang xuất…' : 'Xuất Excel'}
          </button>
        </div>

        <div className="list-meta caption muted">
          {data && `${data.total} tài khoản${filtered ? ' phù hợp' : ''}`}
          {filtered && (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setSearch('');
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              Xoá bộ lọc
            </button>
          )}
        </div>

        {state.error && (
          <p className="form-error" role="alert">
            <Icon name="error" size="sm" />
            {state.error}
          </p>
        )}

        <div className={`table-scroll${state.loading ? ' is-loading' : ''}`}>
          <table className="table accounts-table">
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Vai trò</th>
                <th>Email</th>
                <th>Số điện thoại</th>
                <th>Trạng thái</th>
                <th>Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((a) => (
                <tr key={a.id} className="clickable" onClick={() => navigate(`/admin/accounts/${a.id}`)}>
                  <td>
                    <Link to={`/admin/accounts/${a.id}`} className="user-cell" onClick={(e) => e.stopPropagation()}>
                      <Avatar name={a.fullName} size={32} />
                      <span>
                        <span className="name">{a.fullName}</span>
                        <span className="caption muted mono">
                          {a.username}
                          {a.code && ` · ${a.code}`}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <span className="chips">
                      {a.roles.map((r) => (
                        <span key={r} className="chip">
                          {ROLE_LABELS[r] ?? r}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td>{a.email || <span className="muted">—</span>}</td>
                  <td className="mono">{a.phone || <span className="muted">—</span>}</td>
                  <td>
                    <span className="status-cell">
                      <span className={`pill ${a.status === 'ACTIVE' ? 'green' : 'red'}`}>
                        {a.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khoá'}
                      </span>
                      {a.tempLocked && (
                        <span className="tag amber" title="Khoá đăng nhập tạm thời do nhập sai mật khẩu">
                          <Icon name="timer" size="sm" />
                          Khoá tạm
                        </span>
                      )}
                      {a.mustChangePassword && (
                        <span className="tag" title="Đang dùng mật khẩu tạm thời">
                          <Icon name="key" size="sm" />
                          Chưa đổi MK
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="mono">{formatDate(a.createdAt)}</td>
                </tr>
              ))}
              {data && !data.items.length && (
                <tr>
                  <td colSpan={6} className="empty-row">
                    Không có kết quả tìm kiếm.
                  </td>
                </tr>
              )}
              {!data && state.loading && (
                <tr>
                  <td colSpan={6} className="empty-row">
                    Đang tải…
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
              Trước
            </button>
            <span className="caption muted">
              Trang {page} / {pages}
            </span>
            <button type="button" className="btn btn-secondary" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>
              Sau
              <Icon name="chevron_right" size="sm" />
            </button>
          </div>
        )}
      </section>
    </>
  );
}
