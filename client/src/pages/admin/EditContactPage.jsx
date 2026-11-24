import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAccount, updateAccount } from '../../api/admin.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText, ROLE_LABELS } from '../../messages.js';
import { fieldText } from './accountFields.js';
import './admin.css';

// UC-99 for School Manager (FE-13, 23/11/2026, supervisor's request, option a): change the email and phone number of
// a student, teacher or parent account. Opened from "Tài khoản đăng nhập" on the School Manager's detail pages
// (AccountSecurityActions). The server keeps every other field and refuses other accounts (scope.js).

export default function EditContactPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [account, setAccount] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ email: '', phone: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    getAccount(id)
      .then((a) => {
        if (!alive) return;
        setAccount(a);
        setForm({ email: a.email ?? '', phone: a.phone ?? '' });
      })
      .catch((err) => alive && setLoadError(errorText(err)));
    return () => {
      alive = false;
    };
  }, [id]);

  if (loadError) return <p className="form-error">{loadError}</p>;
  if (!account) return <p className="loading">Đang tải tài khoản…</p>;

  const isParent = account.roles.includes('PARENT');
  const changed =
    form.email.trim().toLowerCase() !== (account.email ?? '').toLowerCase() ||
    form.phone.replace(/[\s.-]/g, '') !== (account.phone ?? '');
  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((errs) => ({ ...errs, [key]: undefined }));
  };
  const err = (field) => errors[field] && fieldText(field, errors[field]);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    if (isParent && !form.phone.trim()) {
      setErrors({ phone: 'REQUIRED_FOR_PARENT' });
      return;
    }
    setSaving(true);
    try {
      await updateAccount(account.id, form);
      toast('Đã cập nhật email và số điện thoại.');
      navigate(-1);
    } catch (error) {
      if (error.code === 'MSG_ACCOUNT_INVALID') setErrors(error.details?.fields ?? {});
      setFormError(errorText(error));
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Sửa email và số điện thoại</h1>
          <p>
            {account.fullName} · {account.roles.map((r) => ROLE_LABELS[r] ?? r).join(', ')} · @{account.username}
          </p>
        </div>
      </div>

      <form className="card card-outline admin-form" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
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
          <p>Người dùng đăng nhập được bằng email hoặc số điện thoại mới; thông tin cũ không còn dùng được. Hãy báo cho người dùng.</p>
        </div>

        {formError && (
          <p className="form-error" role="alert" style={{ marginTop: 16 }}>
            <Icon name="error" size="sm" />
            {formError}
          </p>
        )}

        <div className="section-sep" />
        <div className="card-footer">
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
            Huỷ
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !changed}>
            <Icon name="save" size="sm" />
            {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </>
  );
}
