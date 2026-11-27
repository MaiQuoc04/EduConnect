import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getAccount, listDepartmentOptions, updateAccount } from '../../api/admin.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText, GENDER_LABELS } from '../../messages.js';
import { fieldText } from './accountFields.js';
import { backOf } from './profileKinds.js';
import './admin.css';

// SCR-62 Update Account (UC-99, FE-13). System Admin changes the username and the fields an import file carries
// (UC-96 templates): full name, email, phone, address, and per role the student code, date of birth, gender, the
// teacher code and department, the parent's occupation (supervisor's request, 22/11/2026). Classes, parent links,
// subjects and assignments are the School Manager's and are not shown here.

const USERNAME_TEXT = {
  INVALID: 'Tên đăng nhập dài 3–50 ký tự, chỉ gồm chữ thường không dấu, số, dấu chấm và gạch dưới, không toàn chữ số.',
  DUPLICATE: 'Tên đăng nhập này đã được dùng.',
};
// HS / GV + 6 digits (business rules §3, 27/11/2026); the account's own older 4-digit code may be kept as it is.
const CODE_RE = { studentCode: /^HS\d{6}$/, teacherCode: /^GV\d{6}$/ };
const normCode = (v) => v.replace(/\s+/g, '').toUpperCase();
const today = () => new Date().toLocaleDateString('sv-SE');
// A department name that is no longer in FE-03's list: kept as it is unless another one is picked.
const KEEP_DEPARTMENT = 'keep';

function formOf(a, departments) {
  const departmentId = a.teacher?.department
    ? String(departments?.find((d) => d.name === a.teacher.department)?.departmentId ?? KEEP_DEPARTMENT)
    : '';
  return {
    username: a.username,
    fullName: a.fullName ?? '',
    email: a.email ?? '',
    phone: a.phone ?? '',
    address: a.address ?? '',
    studentCode: a.student?.code ?? '',
    dob: a.student?.dob ? String(a.student.dob).slice(0, 10) : '',
    gender: a.student?.gender ?? '',
    teacherCode: a.teacher?.code ?? '',
    departmentId,
    occupation: a.parent?.occupation ?? '',
  };
}

function Field({ id, label, required, help, error, span, children }) {
  return (
    <div className={`field${span ? ' span-2' : ''}${error ? ' invalid' : ''}`}>
      <label className="field-label" htmlFor={id}>
        <span>
          {label}
          {required && <span className="required">*</span>}
        </span>
      </label>
      {children}
      {error ? <span className="field-error">{error}</span> : help && <span className="field-help">{help}</span>}
    </div>
  );
}

export default function EditAccountPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [account, setAccount] = useState(null);
  const [departments, setDepartments] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(null);
  const [initial, setInitial] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    getAccount(id)
      .then(async (a) => {
        const list = a.teacher ? await listDepartmentOptions().catch(() => []) : [];
        if (!alive) return;
        const f = formOf(a, list);
        setAccount(a);
        setDepartments(list);
        setForm(f);
        setInitial(f);
      })
      .catch((err) => alive && setLoadError(errorText(err)));
    return () => {
      alive = false;
    };
  }, [id]);

  if (loadError) return <p className="form-error">{loadError}</p>;
  if (!account || !form) return <p className="loading">Đang tải tài khoản…</p>;

  const back = backOf(account.roles);
  const isParent = account.roles.includes('PARENT');
  const changed = Object.keys(form).some((k) => form[k] !== initial[k]);

  const set = (key, transform) => (e) => {
    const value = transform ? transform(e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((errs) => ({ ...errs, [key]: undefined, ...(key === 'departmentId' ? { department: undefined } : {}) }));
  };
  const err = (field) => {
    const code = errors[field];
    if (!code) return undefined;
    if (field === 'username') return USERNAME_TEXT[code] ?? fieldText(field, code);
    return fieldText(field, code);
  };

  // Quick checks before calling the server; the server repeats every check.
  function localErrors() {
    const e = {};
    if (!form.username.trim()) e.username = 'REQUIRED';
    if (!form.fullName.trim()) e.fullName = 'REQUIRED';
    if (isParent && !form.phone.trim()) e.phone = 'REQUIRED_FOR_PARENT';
    for (const [part, key] of [['student', 'studentCode'], ['teacher', 'teacherCode']]) {
      if (!account[part]) continue;
      if (!form[key].trim()) e[key] = 'REQUIRED';
      else if (!CODE_RE[key].test(normCode(form[key])) && normCode(form[key]) !== account[part].code) e[key] = 'INVALID';
    }
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
    const keepDepartment = form.departmentId === KEEP_DEPARTMENT;
    const payload = {
      username: form.username,
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      address: form.address,
      student: account.student ? { studentCode: form.studentCode, dob: form.dob, gender: form.gender } : undefined,
      teacher: account.teacher
        ? {
            teacherCode: form.teacherCode,
            departmentId: keepDepartment ? null : form.departmentId || null,
            department: keepDepartment ? account.teacher.department : null,
          }
        : undefined,
      parent: account.parent ? { occupation: form.occupation } : undefined,
    };
    setSaving(true);
    try {
      await updateAccount(account.id, payload);
      toast('Đã cập nhật thông tin tài khoản.');
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
        <span>EduConnect</span>/<Link to={back.to}>{back.label}</Link>/
        <Link to={`/admin/accounts/${account.id}`}>{account.fullName}</Link>/<span className="current">Sửa thông tin</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Sửa thông tin tài khoản</h1>
          <p>Sửa các thông tin có trong file nhập tài khoản. Lớp học, liên kết phụ huynh và phân công do quản lý nhà trường cập nhật.</p>
        </div>
      </div>

      <form className="card card-outline admin-form" onSubmit={handleSubmit} noValidate>
        <h2 className="card-title title-sm">
          <Icon name="badge" />
          Thông tin chung
        </h2>
        <div className="form-grid">
          <Field id="username" label="Tên đăng nhập" required span error={err('username')} help="Chữ thường không dấu, số, dấu chấm, gạch dưới.">
            <input id="username" className="input mono" value={form.username} onChange={set('username')} maxLength={50} autoComplete="off" />
          </Field>
          <Field id="fullName" label="Họ và tên" required span error={err('fullName')}>
            <input id="fullName" className="input" value={form.fullName} onChange={set('fullName')} maxLength={150} autoComplete="off" />
          </Field>
          <Field id="email" label="Email" error={err('email')}>
            <input id="email" type="email" className="input" value={form.email} onChange={set('email')} maxLength={150} autoComplete="off" />
          </Field>
          <Field id="phone" label="Số điện thoại" required={isParent} error={err('phone')}>
            <input id="phone" type="tel" inputMode="numeric" className="input" value={form.phone} onChange={set('phone')} maxLength={20} autoComplete="off" />
          </Field>
          <Field id="address" label="Địa chỉ" span error={err('address')}>
            <input id="address" className="input" value={form.address} onChange={set('address')} maxLength={500} autoComplete="off" />
          </Field>
        </div>

        {account.student && (
          <>
            <div className="section-sep" />
            <h2 className="card-title title-sm">
              <Icon name="school" />
              Thông tin học sinh
            </h2>
            <div className="form-grid">
              <Field id="studentCode" label="Mã học sinh" required error={err('studentCode')}>
                <input id="studentCode" className="input mono" value={form.studentCode} onChange={set('studentCode', normCode)} maxLength={6} autoComplete="off" />
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

        {account.teacher && (
          <>
            <div className="section-sep" />
            <h2 className="card-title title-sm">
              <Icon name="co_present" />
              Thông tin giáo viên
            </h2>
            <div className="form-grid">
              <Field id="teacherCode" label="Mã giáo viên" required error={err('teacherCode')}>
                <input id="teacherCode" className="input mono" value={form.teacherCode} onChange={set('teacherCode', normCode)} maxLength={6} autoComplete="off" />
              </Field>
              <Field id="department" label="Tổ chuyên môn" error={err('department')}>
                <select id="department" className="input" value={form.departmentId} onChange={set('departmentId')}>
                  <option value="">Chưa chọn</option>
                  {form.departmentId === KEEP_DEPARTMENT && <option value={KEEP_DEPARTMENT}>{account.teacher.department}</option>}
                  {departments?.map((d) => (
                    <option key={d.departmentId} value={d.departmentId}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        )}

        {account.parent && (
          <>
            <div className="section-sep" />
            <h2 className="card-title title-sm">
              <Icon name="family_restroom" />
              Thông tin phụ huynh
            </h2>
            <div className="form-grid">
              <Field id="occupation" label="Nghề nghiệp" error={err('occupation')}>
                <input id="occupation" className="input" value={form.occupation} onChange={set('occupation')} maxLength={100} autoComplete="off" />
              </Field>
            </div>
          </>
        )}

        <div className="notice" style={{ marginTop: 24 }}>
          <Icon name="info" />
          <p>
            Mật khẩu và vai trò không thay đổi. Nếu đổi tên đăng nhập, email hoặc số điện thoại, hãy báo cho người dùng thông tin
            đăng nhập mới.
          </p>
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
