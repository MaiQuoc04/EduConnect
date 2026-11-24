import { useEffect, useState } from 'react';
import { addRole, listDepartmentOptions } from '../../api/admin.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText, ROLE_LABELS } from '../../messages.js';
import { fieldText } from './accountFields.js';
import Dialog from './Dialog.jsx';
import './admin.css';

// FE-13 (owner: Linh), 24/11/2026 – option 2: an account is created or imported with one role; a combinable role is
// added here. System Admin: Giáo viên, Phụ huynh, Quản lý nhà trường; School Manager: Giáo viên, Phụ huynh on teacher /
// parent accounts. Student and System Admin accounts take no other role (business-rules §1). Roles are never removed.
// The server (POST /admin/accounts/:id/roles) repeats every check.

const ORDER = ['TEACHER', 'PARENT', 'SCHOOL_MANAGER'];
const CODE_RE = /^GV\d{4}$/;

// Roles `activeRole` may add to an account with `roles` – same rule as accountControl.addableRoles on the server.
export function addableRoles(roles = [], activeRole) {
  if (roles.some((r) => r === 'STUDENT' || r === 'SYSTEM_ADMIN')) return [];
  if (activeRole === 'SCHOOL_MANAGER' && roles.includes('SCHOOL_MANAGER')) return [];
  const allowed = activeRole === 'SCHOOL_MANAGER' ? ['TEACHER', 'PARENT'] : ORDER;
  return allowed.filter((r) => !roles.includes(r));
}

// Button + dialog. `account` needs id, fullName, roles, phone. `onAdded(updatedAccount)` runs after the save.
export default function AddRoleButton({ account, onAdded, className = 'btn btn-secondary' }) {
  const { activeRole } = useAuth();
  const [open, setOpen] = useState(false);
  const choices = addableRoles(account?.roles, activeRole);
  if (!account || !choices.length) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Icon name="person_add" size="sm" />
        Thêm vai trò
      </button>
      {open && <AddRoleDialog account={account} choices={choices} onClose={() => setOpen(false)} onAdded={onAdded} />}
    </>
  );
}

function AddRoleDialog({ account, choices, onClose, onAdded }) {
  const toast = useToast();
  const [role, setRole] = useState(choices.length === 1 ? choices[0] : '');
  const [teacherCode, setTeacherCode] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [occupation, setOccupation] = useState('');
  const [phone, setPhone] = useState('');
  const [departments, setDepartments] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const needsPhone = role === 'PARENT' && !account.phone;

  useEffect(() => {
    if (role !== 'TEACHER' || departments) return;
    listDepartmentOptions()
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, [role, departments]);

  const err = (field) => errors[field] && fieldText(field, errors[field]);

  async function save() {
    const local = {};
    if (!role) local.role = 'INVALID';
    if (role === 'TEACHER') {
      const c = teacherCode.replace(/\s+/g, '').toUpperCase();
      if (!c) local.teacherCode = 'REQUIRED';
      else if (!CODE_RE.test(c)) local.teacherCode = 'INVALID';
    }
    if (needsPhone && !phone.trim()) local.phone = 'REQUIRED_FOR_PARENT';
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await addRole(account.id, {
        role,
        teacher: role === 'TEACHER' ? { teacherCode, departmentId: departmentId || null } : undefined,
        parent: role === 'PARENT' ? { occupation } : undefined,
        phone: needsPhone ? phone : undefined,
      });
      toast(`Đã thêm vai trò ${ROLE_LABELS[role].toLowerCase()} cho ${account.fullName}.`);
      onAdded?.(updated);
      onClose();
    } catch (e) {
      if (e.code === 'MSG_ACCOUNT_INVALID') setErrors(e.details?.fields ?? {});
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Thêm vai trò"
      icon="person_add"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !role}>
            {busy ? 'Đang thêm…' : 'Thêm vai trò'}
          </button>
        </>
      }
    >
      <p>
        Thêm vai trò kiêm nhiệm cho <strong>{account.fullName}</strong> (hiện là{' '}
        {account.roles.map((r) => ROLE_LABELS[r] ?? r).join(', ').toLowerCase()}). Vai trò đã thêm không gỡ được.
      </p>

      <div className={`field${err('role') ? ' invalid' : ''}`} style={{ marginTop: 16 }}>
        <span className="field-label">
          <span>
            Vai trò<span className="required">*</span>
          </span>
        </span>
        <div className="role-picker role-picker-dialog" role="radiogroup" aria-label="Vai trò cần thêm">
          {choices.map((r) => (
            <label key={r} className={`role-option${role === r ? ' checked' : ''}`}>
              <input
                type="radio"
                name="add-role"
                checked={role === r}
                onChange={() => {
                  setRole(r);
                  setErrors({});
                  setError('');
                }}
              />
              {ROLE_LABELS[r]}
            </label>
          ))}
        </div>
        {err('role') && <span className="field-error">{err('role')}</span>}
      </div>

      {role === 'TEACHER' && (
        <div className="form-grid" style={{ marginTop: 16 }}>
          <label className={`field${err('teacherCode') ? ' invalid' : ''}`}>
            <span className="field-label">
              <span>
                Mã giáo viên<span className="required">*</span>
              </span>
              <span className="hint">GV + 4 chữ số</span>
            </span>
            <input
              className="input mono"
              value={teacherCode}
              onChange={(e) => {
                setTeacherCode(e.target.value.replace(/\s+/g, '').toUpperCase());
                setErrors((x) => ({ ...x, teacherCode: undefined }));
              }}
              maxLength={6}
              placeholder="GV0001"
            />
            {err('teacherCode') && <span className="field-error">{err('teacherCode')}</span>}
          </label>
          <label className={`field${err('department') ? ' invalid' : ''}`}>
            <span className="field-label">Tổ chuyên môn</span>
            <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={!departments}>
              <option value="">{departments ? 'Chưa chọn' : 'Đang tải…'}</option>
              {(departments ?? []).map((d) => (
                <option key={d.departmentId} value={d.departmentId}>
                  {d.name}
                </option>
              ))}
            </select>
            {err('department') && <span className="field-error">{err('department')}</span>}
          </label>
        </div>
      )}

      {role === 'PARENT' && (
        <div className="form-grid" style={{ marginTop: 16 }}>
          {needsPhone && (
            <label className={`field${err('phone') ? ' invalid' : ''}`}>
              <span className="field-label">
                <span>
                  Số điện thoại<span className="required">*</span>
                </span>
                <span className="hint">Bắt buộc với phụ huynh</span>
              </span>
              <input
                className="input"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setErrors((x) => ({ ...x, phone: undefined }));
                }}
                inputMode="tel"
                maxLength={20}
                placeholder="0901234567"
              />
              {err('phone') && <span className="field-error">{err('phone')}</span>}
            </label>
          )}
          <label className={`field${err('occupation') ? ' invalid' : ''}`}>
            <span className="field-label">Nghề nghiệp</span>
            <input className="input" value={occupation} onChange={(e) => setOccupation(e.target.value)} maxLength={100} />
            {err('occupation') && <span className="field-error">{err('occupation')}</span>}
          </label>
        </div>
      )}

      {role === 'SCHOOL_MANAGER' && (
        <p className="caption muted" style={{ marginTop: 16 }}>
          Tài khoản sẽ có quyền quản lý nhà trường và vào nhóm giáo viên toàn trường. Sau khi có vai trò này, tài khoản chỉ
          do quản trị hệ thống quản lý.
        </p>
      )}

      {role && (
        <p className="caption muted" style={{ marginTop: 12 }}>
          Người dùng chuyển giữa các vai trò bằng nút đổi vai trò ở góc trên; vai trò mới có sau lần đăng nhập tiếp theo.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          <Icon name="error" size="sm" />
          {error}
        </p>
      )}
    </Dialog>
  );
}
