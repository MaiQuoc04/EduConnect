import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createAccount } from '../../api/admin.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText, GENDER_LABELS, ROLE_LABELS } from '../../messages.js';
import { fieldText } from './accountFields.js';
import './admin.css';

// SCR-61 Create Account (UC-92, FE-13). System Admin creates one account; the server generates the username and a
// temporary password that is shown here once.

// System Admin accounts are not created from this screen (decided 28/10/2026); see accounts.service createAccount.
const ROLE_ORDER = ['STUDENT', 'PARENT', 'TEACHER', 'SCHOOL_MANAGER'];
const EXCLUSIVE = ['STUDENT']; // cannot be combined with another role

const EMPTY = {
  fullName: '',
  roles: [],
  email: '',
  phone: '',
  studentCode: '',
  dob: '',
  gender: '',
  teacherCode: '',
  department: '',
  occupation: '',
  address: '',
};

const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time

function Field({ id, label, required, hint, help, error, children }) {
  return (
    <div className={`field${error ? ' invalid' : ''}`}>
      <label className="field-label" htmlFor={id}>
        <span>
          {label}
          {required && <span className="required">*</span>}
        </span>
        {hint && <span className="hint">{hint}</span>}
      </label>
      {children}
      {error ? <span className="field-error">{error}</span> : help && <span className="field-help">{help}</span>}
    </div>
  );
}

function CopyBox({ value, label, secret }) {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast(`Đã sao chép ${label.toLowerCase()}.`);
    } catch {
      toast('Không sao chép được. Vui lòng chọn và sao chép thủ công.', { type: 'error' });
    }
  }
  return (
    <div className={`code-box${secret ? ' secret' : ''}`}>
      <span>{value}</span>
      <button type="button" className="btn btn-icon" onClick={copy} aria-label={`Sao chép ${label.toLowerCase()}`}>
        <Icon name="content_copy" size="sm" />
      </button>
    </div>
  );
}

// Result of UC-92 step 11: the only time the temporary password is visible.
function CreatedAccount({ result, onAnother }) {
  const { account, temporaryPassword } = result;
  return (
    <section className="card card-outline admin-form">
      <div className="notice ink" style={{ marginBottom: 24 }}>
        <Icon name="check_circle" />
        <div>
          <p className="notice-title">Đã tạo tài khoản cho {account.fullName}</p>
          <p>Vai trò: {account.roles.map((r) => ROLE_LABELS[r] ?? r).join(', ')}</p>
        </div>
      </div>

      <div className="credentials">
        <div className="field">
          <span className="field-label">Tên đăng nhập</span>
          <CopyBox value={account.username} label="Tên đăng nhập" />
        </div>
        <div className="field">
          <span className="field-label">Mật khẩu tạm thời</span>
          <CopyBox value={temporaryPassword} label="Mật khẩu tạm thời" secret />
        </div>
        <div className="notice amber">
          <Icon name="warning" />
          <p>
            Mật khẩu này chỉ hiển thị một lần. Hãy ghi lại và bàn giao cho người dùng. Người dùng phải đổi mật khẩu ở lần
            đăng nhập đầu tiên. Nếu làm mất, hãy đặt lại mật khẩu cho tài khoản.
          </p>
        </div>
      </div>

      <div className="section-sep" />
      <div className="card-footer">
        <Link to="/admin/accounts" className="btn btn-secondary">
          Xong
        </Link>
        <button type="button" className="btn btn-primary" onClick={onAnother}>
          <Icon name="person_add" size="sm" />
          Tạo tài khoản khác
        </button>
      </div>
    </section>
  );
}

export default function CreateAccountPage() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const has = (role) => form.roles.includes(role);
  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((errs) => ({ ...errs, [key]: undefined }));
  };

  // System Admin and Student stand alone: picking one of them clears the others, and the reverse.
  function toggleRole(role) {
    setForm((f) => {
      if (f.roles.includes(role)) return { ...f, roles: f.roles.filter((r) => r !== role) };
      if (EXCLUSIVE.includes(role)) return { ...f, roles: [role] };
      return { ...f, roles: [...f.roles.filter((r) => !EXCLUSIVE.includes(r)), role] };
    });
    setErrors((errs) => ({ ...errs, roles: undefined, phone: undefined }));
  }

  // Quick checks before calling the server; the server repeats every check.
  function localErrors() {
    const e = {};
    if (!form.fullName.trim()) e.fullName = 'REQUIRED';
    if (!form.roles.length) e.roles = 'REQUIRED';
    if (has('PARENT') && !form.phone.trim()) e.phone = 'REQUIRED_FOR_PARENT';
    if (has('STUDENT') && !form.studentCode.trim()) e.studentCode = 'REQUIRED';
    if (has('TEACHER') && !form.teacherCode.trim()) e.teacherCode = 'REQUIRED';
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    const local = localErrors();
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        fullName: form.fullName,
        roles: form.roles,
        email: form.email,
        phone: form.phone,
        student: has('STUDENT') ? { studentCode: form.studentCode, dob: form.dob, gender: form.gender } : undefined,
        teacher: has('TEACHER') ? { teacherCode: form.teacherCode, department: form.department } : undefined,
        parent: has('PARENT') ? { occupation: form.occupation, address: form.address } : undefined,
      };
      setResult(await createAccount(payload));
    } catch (err) {
      if (err.code === 'MSG_ACCOUNT_INVALID') setErrors(err.details?.fields ?? {});
      setFormError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  function startAgain() {
    setForm(EMPTY);
    setErrors({});
    setFormError('');
    setResult(null);
  }

  const err = (field) => errors[field] && fieldText(field, errors[field]);

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<Link to="/admin/accounts">Tài khoản</Link>/<span className="current">Tạo tài khoản</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Tạo tài khoản</h1>
          <p>Tên đăng nhập và mật khẩu tạm thời được hệ thống tạo tự động.</p>
        </div>
      </div>

      {result ? (
        <CreatedAccount result={result} onAnother={startAgain} />
      ) : (
        <form className="card card-outline admin-form" onSubmit={handleSubmit} noValidate>
          <h2 className="card-title title-sm">
            <Icon name="badge" />
            Thông tin chung
          </h2>
          <div className="form-grid">
            <div className="span-2">
              <Field id="fullName" label="Họ và tên" required error={err('fullName')}>
                <input
                  id="fullName"
                  className="input"
                  value={form.fullName}
                  onChange={set('fullName')}
                  maxLength={150}
                  placeholder="Ví dụ: Nguyễn Thế Anh"
                  autoComplete="off"
                  autoFocus
                />
              </Field>
            </div>

            <div className="span-2">
              <Field
                id="roles"
                label="Vai trò"
                required
                help="Học sinh không kết hợp với vai trò khác."
                error={err('roles')}
              >
                <div className="role-picker" id="roles" role="group" aria-label="Vai trò">
                  {ROLE_ORDER.map((role) => (
                    <label key={role} className={`role-option${has(role) ? ' checked' : ''}`}>
                      <input type="checkbox" checked={has(role)} onChange={() => toggleRole(role)} />
                      {ROLE_LABELS[role]}
                    </label>
                  ))}
                </div>
              </Field>
            </div>

            <Field id="email" label="Email" hint="Dùng để lấy lại mật khẩu" error={err('email')}>
              <input
                id="email"
                type="email"
                className="input"
                value={form.email}
                onChange={set('email')}
                maxLength={150}
                placeholder="ten@email.com"
                autoComplete="off"
              />
            </Field>
            <Field id="phone" label="Số điện thoại" required={has('PARENT')} error={err('phone')}>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                className="input"
                value={form.phone}
                onChange={set('phone')}
                maxLength={20}
                placeholder="0901234567"
                autoComplete="off"
              />
            </Field>
          </div>

          {has('STUDENT') && (
            <>
              <div className="section-sep" />
              <h2 className="card-title title-sm">
                <Icon name="school" />
                Thông tin học sinh
              </h2>
              <div className="form-grid">
                <Field id="studentCode" label="Mã học sinh" required error={err('studentCode')}>
                  <input
                    id="studentCode"
                    className="input mono"
                    value={form.studentCode}
                    onChange={set('studentCode')}
                    maxLength={50}
                  />
                </Field>
                <Field id="dob" label="Ngày sinh" error={err('dob')}>
                  <input id="dob" type="date" className="input" value={form.dob} onChange={set('dob')} max={today()} />
                </Field>
                <Field id="gender" label="Giới tính" error={err('gender')}>
                  <select id="gender" className="input" value={form.gender} onChange={set('gender')}>
                    <option value="">Chưa chọn</option>
                    {Object.entries(GENDER_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </>
          )}

          {has('TEACHER') && (
            <>
              <div className="section-sep" />
              <h2 className="card-title title-sm">
                <Icon name="co_present" />
                Thông tin giáo viên
              </h2>
              <div className="form-grid">
                <Field id="teacherCode" label="Mã giáo viên" required error={err('teacherCode')}>
                  <input
                    id="teacherCode"
                    className="input mono"
                    value={form.teacherCode}
                    onChange={set('teacherCode')}
                    maxLength={50}
                  />
                </Field>
                <Field id="department" label="Tổ chuyên môn" error={err('department')}>
                  <input
                    id="department"
                    className="input"
                    value={form.department}
                    onChange={set('department')}
                    maxLength={100}
                    placeholder="Ví dụ: Toán – Tin"
                  />
                </Field>
              </div>
            </>
          )}

          {has('PARENT') && (
            <>
              <div className="section-sep" />
              <h2 className="card-title title-sm">
                <Icon name="family_restroom" />
                Thông tin phụ huynh
              </h2>
              <div className="form-grid">
                <Field id="occupation" label="Nghề nghiệp" error={err('occupation')}>
                  <input
                    id="occupation"
                    className="input"
                    value={form.occupation}
                    onChange={set('occupation')}
                    maxLength={100}
                  />
                </Field>
                <div className="span-2">
                  <Field id="address" label="Địa chỉ" error={err('address')}>
                    <input
                      id="address"
                      className="input"
                      value={form.address}
                      onChange={set('address')}
                      maxLength={500}
                    />
                  </Field>
                </div>
              </div>
              <p className="caption muted" style={{ marginTop: 12 }}>
                Liên kết phụ huynh với học sinh do quản lý nhà trường thực hiện sau khi tạo tài khoản.
              </p>
            </>
          )}

          {formError && (
            <p className="form-error" role="alert" style={{ marginTop: 24 }}>
              <Icon name="error" size="sm" />
              {formError}
            </p>
          )}

          <div className="section-sep" />
          <div className="card-footer">
            <Link to="/admin/accounts" className="btn btn-secondary">
              Huỷ
            </Link>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Icon name="person_add" size="sm" />
              {saving ? 'Đang tạo…' : 'Tạo tài khoản'}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
