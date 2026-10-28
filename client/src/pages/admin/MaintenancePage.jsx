import { useCallback, useEffect, useState } from 'react';
import {
  cancelMaintenance,
  createMaintenance,
  endMaintenance,
  listMaintenance,
  updateMaintenance,
} from '../../api/admin.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import Dialog from './Dialog.jsx';
import { formatDateTime, fromLocalInput, toLocalInput } from './format.js';
import './admin.css';

// SCR-65 Maintenance Announcement (UC-100 Post Maintenance Announcement). Publishing notifies every active account
// and shows a banner until the window ends; during the window only System Admin can sign in.

const STATE = {
  UPCOMING: { label: 'Sắp diễn ra', cls: 'amber' },
  RUNNING: { label: 'Đang bảo trì', cls: 'red' },
  ENDED: { label: 'Đã kết thúc', cls: 'grey' },
};
const FIELD_ERRORS = {
  REQUIRED: 'Vui lòng nhập thông tin này.',
  TOO_LONG: 'Nội dung quá dài.',
  INVALID: 'Thời gian không hợp lệ.',
  IN_PAST: 'Thời điểm bắt đầu phải ở tương lai.',
  BEFORE_START: 'Thời điểm kết thúc phải sau thời điểm bắt đầu.',
  OVERLAP: 'Khoảng thời gian này trùng với một đợt bảo trì khác.',
};
const EMPTY = { title: '', message: '', startAt: '', endAt: '' };

function MaintenanceForm({ editing, onDone, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState(
    editing
      ? { title: editing.title, message: editing.message, startAt: toLocalInput(editing.startAt), endAt: toLocalInput(editing.endAt) }
      : EMPTY,
  );
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((er) => ({ ...er, [key]: undefined }));
  };

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    const body = { ...form, startAt: fromLocalInput(form.startAt), endAt: fromLocalInput(form.endAt) };
    try {
      if (editing) await updateMaintenance(editing.id, body);
      else await createMaintenance(body);
      toast(editing ? 'Đã cập nhật lịch bảo trì.' : 'Đã lên lịch bảo trì và gửi thông báo tới mọi tài khoản.');
      onDone();
    } catch (err) {
      if (err.code === 'MSG_MAINTENANCE_INVALID') setErrors(err.details?.fields ?? {});
      setFormError(errorText(err));
      setSaving(false);
    }
  }

  const err = (f) => errors[f] && <span className="field-error">{FIELD_ERRORS[errors[f]] ?? FIELD_ERRORS.INVALID}</span>;

  return (
    <form className="card card-outline admin-form" onSubmit={submit} noValidate style={{ marginBottom: 24 }}>
      <h2 className="card-title title-sm">
        <Icon name={editing ? 'edit_calendar' : 'event_upcoming'} />
        {editing ? 'Sửa lịch bảo trì' : 'Lên lịch bảo trì'}
      </h2>
      <div className="form-grid">
        <div className={`field span-2${errors.title ? ' invalid' : ''}`}>
          <label className="field-label" htmlFor="m-title">
            <span>
              Tiêu đề<span className="required">*</span>
            </span>
          </label>
          <input id="m-title" className="input" value={form.title} onChange={set('title')} maxLength={255} placeholder="Ví dụ: Nâng cấp máy chủ" />
          {err('title')}
        </div>
        <div className={`field span-2${errors.message ? ' invalid' : ''}`}>
          <label className="field-label" htmlFor="m-message">
            <span>
              Nội dung thông báo<span className="required">*</span>
            </span>
          </label>
          <textarea
            id="m-message"
            className="input textarea"
            rows={3}
            value={form.message}
            onChange={set('message')}
            maxLength={2000}
            placeholder="Ví dụ: Hệ thống tạm ngừng để nâng cấp. Vui lòng lưu bài viết trước giờ bảo trì."
          />
          {err('message')}
        </div>
        <div className={`field${errors.startAt ? ' invalid' : ''}`}>
          <label className="field-label" htmlFor="m-start">
            <span>
              Bắt đầu<span className="required">*</span>
            </span>
          </label>
          <input id="m-start" type="datetime-local" className="input" value={form.startAt} onChange={set('startAt')} />
          {err('startAt')}
        </div>
        <div className={`field${errors.endAt ? ' invalid' : ''}`}>
          <label className="field-label" htmlFor="m-end">
            <span>
              Kết thúc<span className="required">*</span>
            </span>
          </label>
          <input id="m-end" type="datetime-local" className="input" value={form.endAt} onChange={set('endAt')} />
          {err('endAt')}
        </div>
      </div>
      {!editing && (
        <div className="notice" style={{ marginTop: 20 }}>
          <Icon name="campaign" />
          <p>
            Khi đăng, mọi tài khoản đang hoạt động nhận thông báo và thấy dải thông báo bảo trì. Trong thời gian bảo trì chỉ Quản
            trị hệ thống đăng nhập được.
          </p>
        </div>
      )}
      {formError && (
        <p className="form-error" role="alert" style={{ marginTop: 16 }}>
          <Icon name="error" size="sm" />
          {formError}
        </p>
      )}
      <div className="section-sep" />
      <div className="card-footer">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Huỷ
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          <Icon name={editing ? 'save' : 'campaign'} size="sm" />
          {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Đăng thông báo'}
        </button>
      </div>
    </form>
  );
}

export default function MaintenancePage() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState(null); // null | 'new' | window being edited
  const [confirm, setConfirm] = useState(null); // { kind: 'end' | 'cancel', item }
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const load = useCallback(() => {
    listMaintenance()
      .then((d) => setItems(d.items))
      .catch((err) => setLoadError(errorText(err)));
  }, []);
  useEffect(load, [load]);

  async function runConfirm() {
    setBusy(true);
    setConfirmError('');
    try {
      if (confirm.kind === 'end') await endMaintenance(confirm.item.id);
      else await cancelMaintenance(confirm.item.id);
      toast(confirm.kind === 'end' ? 'Đã kết thúc bảo trì. Người dùng đăng nhập lại được.' : 'Đã huỷ lịch bảo trì.');
      setConfirm(null);
      load();
    } catch (err) {
      setConfirmError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <p className="form-error">{loadError}</p>;

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Quản trị hệ thống</span>/<span className="current">Bảo trì hệ thống</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Bảo trì hệ thống</h1>
          <p>Lên lịch bảo trì, báo trước cho người dùng và kết thúc sớm khi xong việc.</p>
        </div>
        {!mode && (
          <button type="button" className="btn btn-primary" onClick={() => setMode('new')}>
            <Icon name="add" size="sm" />
            Lên lịch bảo trì
          </button>
        )}
      </div>

      {mode && (
        <MaintenanceForm
          key={mode === 'new' ? 'new' : mode.id}
          editing={mode === 'new' ? null : mode}
          onCancel={() => setMode(null)}
          onDone={() => {
            setMode(null);
            load();
          }}
        />
      )}

      <section className="card card-outline admin-wide">
        <h2 className="card-title title-sm">
          <Icon name="history" />
          Các đợt bảo trì
        </h2>
        {!items && <p className="loading">Đang tải…</p>}
        {items && !items.length && <p className="muted">Chưa có đợt bảo trì nào.</p>}
        <div className="maintenance-list">
          {items?.map((m) => (
            <article key={m.id} className={`maintenance-item ${m.state.toLowerCase()}`}>
              <div className="when">
                <span className={`tag ${STATE[m.state].cls}`}>{STATE[m.state].label}</span>
                <span className="mono caption">
                  {formatDateTime(m.startAt)} → {formatDateTime(m.endAt)}
                </span>
              </div>
              <div className="what">
                <p className="title">{m.title}</p>
                <p className="muted">{m.message}</p>
                <p className="caption muted">Đăng bởi {m.createdByName} lúc {formatDateTime(m.createdAt)}</p>
              </div>
              <div className="actions-row">
                {m.state === 'UPCOMING' && (
                  <>
                    <button type="button" className="btn btn-tertiary" onClick={() => setMode(m)}>
                      <Icon name="edit" size="sm" />
                      Sửa
                    </button>
                    <button type="button" className="btn btn-danger" onClick={() => setConfirm({ kind: 'cancel', item: m })}>
                      Huỷ lịch
                    </button>
                  </>
                )}
                {m.state === 'RUNNING' && (
                  <button type="button" className="btn btn-secondary" onClick={() => setConfirm({ kind: 'end', item: m })}>
                    <Icon name="stop_circle" size="sm" />
                    Kết thúc ngay
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {confirm && (
        <Dialog
          title={confirm.kind === 'end' ? 'Kết thúc bảo trì' : 'Huỷ lịch bảo trì'}
          icon={confirm.kind === 'end' ? 'stop_circle' : 'event_busy'}
          tone={confirm.kind === 'end' ? 'ink' : 'red'}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)} disabled={busy}>
                Quay lại
              </button>
              <button
                type="button"
                className={confirm.kind === 'end' ? 'btn btn-primary' : 'btn btn-danger-solid'}
                onClick={runConfirm}
                disabled={busy}
              >
                {busy ? 'Đang xử lý…' : confirm.kind === 'end' ? 'Kết thúc ngay' : 'Huỷ lịch'}
              </button>
            </>
          }
        >
          <p>
            {confirm.kind === 'end'
              ? `Kết thúc “${confirm.item.title}” ngay bây giờ? Mọi người dùng đăng nhập lại được.`
              : `Huỷ “${confirm.item.title}”? Dải thông báo bảo trì sẽ không còn hiển thị.`}
          </p>
          {confirmError && (
            <p className="form-error" role="alert">
              <Icon name="error" size="sm" />
              {confirmError}
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}
