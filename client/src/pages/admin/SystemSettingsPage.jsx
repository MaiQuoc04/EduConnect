import { useEffect, useState } from 'react';
import { listSettings, updateSettings } from '../../api/admin.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { formatDateTime } from './format.js';
import './admin.css';

// SCR-63 System Settings (UC-99 Configure System Settings). System Admin edits values only.

const META = {
  'login.max_failed_attempts': { group: 'Đăng nhập', label: 'Số lần nhập sai mật khẩu trước khi khoá tạm', unit: 'lần' },
  'login.lock_minutes_step': { group: 'Đăng nhập', label: 'Thời gian khoá tạm tăng thêm mỗi lần', unit: 'phút' },
  'login.lock_minutes_max': { group: 'Đăng nhập', label: 'Thời gian khoá tạm tối đa', unit: 'phút' },
  'otp.expiry_minutes': { group: 'Đăng nhập', label: 'Thời hạn mã OTP đặt lại mật khẩu', unit: 'phút' },
  'upload.max_file_mb': { group: 'Tải tệp lên', label: 'Dung lượng tối đa của ảnh và tệp', unit: 'MB' },
  'upload.max_video_mb': { group: 'Tải tệp lên', label: 'Dung lượng tối đa của video', unit: 'MB' },
  'attendance.edit_deadline_time': { group: 'Điểm danh', label: 'Giờ cuối giáo viên bộ môn được sửa điểm danh trong ngày', unit: '' },
};
const GROUPS = ['Đăng nhập', 'Tải tệp lên', 'Điểm danh', 'Khác'];

function errorFor(code, rule) {
  if (code === 'REQUIRED') return 'Vui lòng nhập giá trị.';
  if (code === 'OUT_OF_RANGE' || (code === 'INVALID' && rule?.type === 'int')) {
    return `Nhập số nguyên từ ${rule.min} đến ${rule.max}.`;
  }
  if (code === 'INVALID' && rule?.type === 'time') return 'Nhập giờ theo dạng HH:MM, ví dụ 23:59.';
  if (code === 'LESS_THAN_STEP') return 'Không được ngắn hơn thời gian khoá tăng thêm mỗi lần.';
  return 'Giá trị không hợp lệ.';
}

export default function SystemSettingsPage() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  function apply(data) {
    setItems(data.items);
    setValues(Object.fromEntries(data.items.map((i) => [i.key, i.value])));
  }

  useEffect(() => {
    listSettings()
      .then(apply)
      .catch((err) => setLoadError(errorText(err)));
  }, []);

  if (loadError) return <p className="form-error">{loadError}</p>;
  if (!items) return <p className="loading">Đang tải cài đặt…</p>;

  const changedKeys = items.filter((i) => String(values[i.key]).trim() !== i.value).map((i) => i.key);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const data = await updateSettings(Object.fromEntries(changedKeys.map((k) => [k, values[k]])));
      apply(data);
      setErrors({});
      toast('Đã lưu cài đặt. Giá trị mới có hiệu lực ngay.');
    } catch (err) {
      if (err.code === 'MSG_SETTINGS_INVALID') setErrors(err.details?.fields ?? {});
      setFormError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setValues(Object.fromEntries(items.map((i) => [i.key, i.value])));
    setErrors({});
    setFormError('');
  }

  const grouped = GROUPS.map((g) => ({ group: g, list: items.filter((i) => (META[i.key]?.group ?? 'Khác') === g) })).filter(
    (g) => g.list.length,
  );

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Quản trị hệ thống</span>/<span className="current">Cài đặt hệ thống</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Cài đặt hệ thống</h1>
          <p>Các giá trị áp dụng cho toàn hệ thống. Mỗi thay đổi được ghi vào nhật ký hoạt động.</p>
        </div>
      </div>

      <form className="settings-form" onSubmit={save} noValidate>
        {/* Two columns on wide screens: the sign-in group on the left, the other groups stacked on the right. */}
        <div className="settings-columns">
          {[grouped.slice(0, 1), grouped.slice(1)].map((column, ci) => (
            <div key={ci} className="settings-column">
              {column.map(({ group, list }) => (
                <section key={group} className="card card-outline settings-group">
                  <h2 className="label-upper">{group}</h2>
                  <div className="settings-list">
                    {list.map((s) => {
                      const meta = META[s.key] ?? { label: s.description ?? s.key, unit: '' };
                      const changed = changedKeys.includes(s.key);
                      return (
                        <div key={s.key} className={`setting-row${errors[s.key] ? ' invalid' : ''}${changed ? ' changed' : ''}`}>
                          <div className="setting-text">
                            <label htmlFor={s.key} className="setting-label">
                              {meta.label}
                            </label>
                            <span className="caption muted mono">{s.key}</span>
                            {s.updatedAt && (
                              <span className="caption muted">
                                Sửa lần cuối {formatDateTime(s.updatedAt)}
                                {s.updatedByName && ` bởi ${s.updatedByName}`}
                              </span>
                            )}
                            {errors[s.key] && <span className="field-error">{errorFor(errors[s.key], s.rule)}</span>}
                          </div>
                          <div className="setting-input">
                            <input
                              id={s.key}
                              className="input"
                              type={s.rule?.type === 'time' ? 'time' : 'number'}
                              min={s.rule?.min}
                              max={s.rule?.max}
                              step={1}
                              value={values[s.key] ?? ''}
                              onChange={(e) => {
                                setValues((v) => ({ ...v, [s.key]: e.target.value }));
                                setErrors((er) => ({ ...er, [s.key]: undefined }));
                              }}
                            />
                            {meta.unit && <span className="unit">{meta.unit}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ))}
        </div>

        <div className={`settings-footer${changedKeys.length || formError ? ' dirty' : ''}`}>
          {formError && (
            <p className="form-error" role="alert">
              <Icon name="error" size="sm" />
              {formError}
            </p>
          )}
          <div className="card-footer">
            {changedKeys.length > 0 && (
              <span className="left">
                <Icon name="edit_note" size="sm" />
                {changedKeys.length} giá trị chưa lưu
              </span>
            )}
            <button type="button" className="btn btn-secondary" onClick={reset} disabled={saving || !changedKeys.length}>
              Huỷ thay đổi
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !changedKeys.length}>
              <Icon name="save" size="sm" />
              {saving ? 'Đang lưu…' : 'Lưu cài đặt'}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
