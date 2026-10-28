import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAccount } from '../../api/admin.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { errorText, GENDER_LABELS, ROLE_LABELS } from '../../messages.js';
import { formatDate } from '../../utils/format.js';
import AccountSecurityActions from './AccountSecurityActions.jsx';
import { formatDateTime } from './format.js';
import './admin.css';

// SCR-60 Account Detail (FE-13): identifiers, roles, status, and the actions of UC-96, UC-97 and UC-98.
// System Admin sees account data only – never school content (business-rules §1).

function Item({ label, children, wide }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className={wide ? 'wide' : undefined}>
      <dt>{label}</dt>
      <dd className={empty ? 'empty' : undefined}>{empty ? 'Chưa có' : children}</dd>
    </div>
  );
}

export default function AccountDetailPage() {
  const { id } = useParams();
  const [state, setState] = useState({ loading: true, account: null, error: '' });

  useEffect(() => {
    let alive = true;
    getAccount(id)
      .then((account) => alive && setState({ loading: false, account, error: '' }))
      .catch((err) => alive && setState({ loading: false, account: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [id]);

  if (state.loading) return <p className="loading">Đang tải tài khoản…</p>;
  if (state.error) {
    return (
      <div className="stack">
        <p className="form-error">{state.error}</p>
        <Link to="/admin/accounts">Quay lại danh sách tài khoản</Link>
      </div>
    );
  }

  const a = state.account;
  const changed = (updated) => setState((s) => ({ ...s, account: { ...s.account, ...updated } }));

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<Link to="/admin/accounts">Tài khoản</Link>/<span className="current">{a.fullName}</span>
      </nav>

      <section className="card card-outline admin-wide account-head">
        <Avatar src={a.avatarUrl} name={a.fullName} size={64} />
        <div className="who">
          <h1 className="title-md">{a.fullName}</h1>
          <p className="caption muted mono">@{a.username}</p>
          <div className="chips" style={{ marginTop: 8 }}>
            {a.roles.map((r) => (
              <span key={r} className="chip ink">
                {ROLE_LABELS[r] ?? r}
              </span>
            ))}
          </div>
        </div>
        <div className="status-cell head-status">
          <span className={`pill ${a.status === 'ACTIVE' ? 'green' : 'red'}`}>{a.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khoá'}</span>
          {a.mustChangePassword && (
            <span className="tag">
              <Icon name="key" size="sm" />
              Đang dùng mật khẩu tạm thời
            </span>
          )}
        </div>
      </section>

      <div className="detail-grid">
        <section className="card card-outline">
          <h2 className="card-title title-sm">
            <Icon name="login" />
            Thông tin đăng nhập
            <Link to={`/admin/accounts/${a.id}/edit`} className="btn btn-tertiary aside">
              <Icon name="edit" size="sm" />
              Sửa
            </Link>
          </h2>
          <dl className="dl">
            <Item label="Tên đăng nhập">
              <span className="mono">{a.username}</span>
            </Item>
            <Item label="Email">{a.email}</Item>
            <Item label="Số điện thoại">{a.phone && <span className="mono">{a.phone}</span>}</Item>
            <Item label="Đăng nhập gần nhất">{a.lastLoginAt && formatDateTime(a.lastLoginAt)}</Item>
            <Item label="Ngày tạo">{formatDate(a.createdAt)}</Item>
            <Item label="Cập nhật lần cuối">{a.updatedAt && formatDateTime(a.updatedAt)}</Item>
          </dl>
        </section>

        <section className="card card-outline">
          <h2 className="card-title title-sm">
            <Icon name="badge" />
            Hồ sơ theo vai trò
          </h2>
          {!a.student && !a.teacher && !a.parent && <p className="muted">Vai trò này không có hồ sơ riêng.</p>}
          <dl className="dl">
            {a.student && (
              <>
                <Item label="Mã học sinh">
                  <span className="mono">{a.student.code}</span>
                </Item>
                <Item label="Ngày sinh">{formatDate(a.student.dob)}</Item>
                <Item label="Giới tính">{GENDER_LABELS[a.student.gender] ?? a.student.gender}</Item>
              </>
            )}
            {a.teacher && (
              <>
                <Item label="Mã giáo viên">
                  <span className="mono">{a.teacher.code}</span>
                </Item>
                <Item label="Tổ chuyên môn">{a.teacher.department}</Item>
              </>
            )}
            {a.parent && (
              <>
                <Item label="Nghề nghiệp">{a.parent.occupation}</Item>
                <Item label="Địa chỉ" wide>
                  {a.parent.address}
                </Item>
              </>
            )}
          </dl>
          {(a.student || a.teacher || a.parent) && (
            <p className="caption muted" style={{ marginTop: 16 }}>
              Hồ sơ do quản lý nhà trường cập nhật.
            </p>
          )}
        </section>
      </div>

      <section className="card card-outline admin-wide" style={{ marginTop: 24 }}>
        <h2 className="card-title title-sm">
          <Icon name="shield_person" />
          Bảo mật tài khoản
        </h2>
        <AccountSecurityActions account={a} onChanged={changed} />
      </section>
    </>
  );
}
