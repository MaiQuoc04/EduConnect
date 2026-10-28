import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getAccount, updateIdentifiers } from '../../api/admin.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { fieldText } from './accountFields.js';
import './admin.css';

// SCR-62 Update Account (UC-96 Update Login Identifiers): System Admin changes username, email or phone number.
const USERNAME_TEXT = {
  INVALID: 'Tên đăng nhập dài 3–50 ký tự, chỉ gồm chữ thường không dấu, số, dấu chấm và gạch dưới, không toàn chữ số.',
  DUPLICATE: 'Tên đăng nhập này đã được dùng.',
};

export default function EditIdentifiersPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [account, setAccount] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ username: '', email: '', phone: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAccount(id)
      .then((a) => {
        setAccount(a);
        setForm({ username: a.username, email: a.email ?? '', phone: a.phone ?? '' });
      })
      .catch((err) => setLoadError(errorText(err)));
  }, [id]);

  if (loadError) return <p className="form-error">{loadError}</p>;
  if (!account) return <p className="loading">Đang tải tài khoản…</p>;

  const changed =
    form.username.trim().toLowerCase() !== account.username ||
    form.email.trim().toLowerCase() !== (account.email ?? '').toLowerCase() ||
    form.phone.replace(/[\s.-]/g, '') !== (account.phone ?? '');
  const isParent = account.roles.includes('PARENT');

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((errs) => ({ ...errs, [key]: undefined }));
  };
  const err = (field) =>
    errors[field] && (field === 'username' ? (USERNAME_TEXT[errors.username] ?? fieldText('username', errors.username)) : fieldText(field, errors[field]));

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await updateIdentifiers(account.id, form);
      toast('Đã cập nhật thông tin đăng nhập.');
      navigate(`/admin/accounts/${account.id}`);
    } catch (error) {
      if (error.code === 'MSG_ACCOUNT_INVALID') setErrors(error.details?.fields ?? {});
      setFormError(errorText(error));
      setSaving(false);
    }
  }

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<Link to="/admin/accounts">Tài khoản</Link>/
        <Link to={`/admin/accounts/${account.id}`}>{account.fullName}</Link>/<span className="current">Sửa thông tin đăng nhập</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Sửa thông tin đăng nhập</h1>
          <p>
            {account.fullName} sẽ đăng nhập bằng tên đăng nhập, email hoặc số điện thoại mới. Thông tin cũ không còn dùng được.
          </p>
        </div>
      </div>

      <form className="card card-outline admin-form" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <div className={`field span-2${errors.username ? ' invalid' : ''}`}>
            <label className="field-label" htmlFor="username">
              <span>
                Tên đăng nhập<span className="required">*</span>
              </span>
            </label>
            <input id="username" className="input mono" value={form.username} onChange={set('username')} maxLength={50} autoComplete="off" />
            {err('username') ? <span className="field-error">{err('username')}</span> : <span className="field-help">Chữ thường không dấu, số, dấu chấm, gạch dưới.</span>}
          </div>
          <div className={`field${errors.email ? ' invalid' : ''}`}>
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <input id="email" type="email" className="input" value={form.email} onChange={set('email')} maxLength={150} autoComplete="off" />
            {err('email') && <span className="field-error">{err('email')}</span>}
          </div>
          <div className={`field${errors.phone ? ' invalid' : ''}`}>
            <label className="field-label" htmlFor="phone">
              <span>
                Số điện thoại{isParent && <span className="required">*</span>}
              </span>
            </label>
            <input id="phone" type="tel" inputMode="numeric" className="input" value={form.phone} onChange={set('phone')} maxLength={20} autoComplete="off" />
            {err('phone') && <span className="field-error">{err('phone')}</span>}
          </div>
        </div>

        <div className="notice" style={{ marginTop: 24 }}>
          <Icon name="info" />
          <p>Mật khẩu, vai trò và hồ sơ không thay đổi. Hãy báo cho người dùng thông tin đăng nhập mới.</p>
        </div>

        {formError && (
          <p className="form-error" role="alert" style={{ marginTop: 16 }}>
            <Icon name="error" size="sm" />
            {formError}
          </p>
        )}

        <div className="section-sep" />
        <div className="card-footer">
          <Link to={`/admin/accounts/${account.id}`} className="btn btn-secondary">
            Huỷ
          </Link>
          <button type="submit" className="btn btn-primary" disabled={saving || !changed}>
            <Icon name="save" size="sm" />
            {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </>
  );
}
