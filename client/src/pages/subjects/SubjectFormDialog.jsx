import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { toSubjectCode } from './subjectText.js';

const CODE_ERRORS = ['MSG_SUBJECT_CODE_FORMAT', 'MSG_SUBJECT_CODE_TAKEN', 'MSG_SUBJECT_CODE_LOCKED'];
const NAME_ERRORS = ['MSG_SUBJECT_NAME_LENGTH', 'MSG_SUBJECT_NAME_TAKEN'];

// SCR-26 Create / Update Subject as a pop-up (17/11/2026: was its own page) – UC-24 Create Subject from the subject
// list, UC-25 Update Subject from the subject detail. A subject has only a code and a name; its class types and
// periods are set in "Loại lớp & số tiết" (UC-26). Once the subject is used, the server locks the code (codeLocked).
// subject: the subject to edit (from GET /subjects/:id), or null to create one. onSaved(subject) after saving.
export default function SubjectFormDialog({ subject = null, onClose, onSaved }) {
  const editing = Boolean(subject);
  const ref = useRef(null);
  const toast = useToast();
  const [form, setForm] = useState({
    subjectCode: subject?.subjectCode ?? '',
    subjectName: subject?.subjectName ?? '',
  });
  const [error, setError] = useState(null); // { field: 'code' | 'name' | null, text }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.subjectCode || !form.subjectName.trim()) {
      setError({ field: null, text: errorText({ code: 'MSG_REQUIRED' }) });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data } = editing
        ? await api.put(`/subjects/${subject.subjectId}`, form)
        : await api.post('/subjects', form);
      toast(editing ? 'Đã lưu thay đổi môn học.' : `Đã thêm môn học ${data.subject.subjectName}.`);
      onSaved(data.subject);
    } catch (err) {
      const field = CODE_ERRORS.includes(err.code) ? 'code' : NAME_ERRORS.includes(err.code) ? 'name' : null;
      setError({ field, text: errorText(err) });
      setSaving(false);
    }
  }

  function cancel(e) {
    e?.preventDefault(); // Esc: the dialog closes only through onClose (and never while saving)
    if (!saving) onClose();
  }

  const codeLocked = Boolean(subject?.codeLocked);

  return (
    <dialog
      ref={ref}
      className="group-dialog subject-dialog"
      onCancel={cancel}
      onClick={(e) => e.target === e.currentTarget && cancel()} // a click on the backdrop
      aria-labelledby="subject-dialog-title"
    >
      <form onSubmit={handleSubmit} noValidate className="subject-dialog-form">
        <div className="subject-dialog-head">
          <div>
            <h2 id="subject-dialog-title" className="title-md">
              {editing ? 'Sửa thông tin môn học' : 'Thêm môn học'}
            </h2>
            <p className="caption muted">Mã môn và tên môn hiển thị trong toàn hệ thống và trong các tệp nhập dữ liệu.</p>
          </div>
          <button type="button" className="btn btn-icon" onClick={cancel} aria-label="Đóng" disabled={saving}>
            <Icon name="close" />
          </button>
        </div>

        <div className={`field${error?.field === 'code' ? ' invalid' : ''}`}>
          <label className="field-label" htmlFor="subject-code">
            Mã môn học
            <span className="caption muted">Chữ in hoa không dấu</span>
          </label>
          <div className="input-wrap">
            <input
              id="subject-code"
              className="input mono"
              value={form.subjectCode}
              onChange={(e) => setForm((f) => ({ ...f, subjectCode: toSubjectCode(e.target.value) }))}
              placeholder="VD: GDDP"
              maxLength={20}
              disabled={codeLocked}
              autoFocus={!editing}
            />
          </div>
          {error?.field === 'code' ? (
            <span className="field-error">{error.text}</span>
          ) : (
            <span className="field-help">
              {codeLocked
                ? 'Môn đã được sử dụng nên không đổi được mã.'
                : 'Từ 2 đến 20 ký tự: chữ cái, chữ số hoặc dấu gạch dưới.'}
            </span>
          )}
        </div>

        <div className={`field${error?.field === 'name' ? ' invalid' : ''}`}>
          <label className="field-label" htmlFor="subject-name">
            Tên môn học
          </label>
          <div className="input-wrap">
            <input
              id="subject-name"
              className="input"
              value={form.subjectName}
              onChange={(e) => setForm((f) => ({ ...f, subjectName: e.target.value }))}
              placeholder="VD: Giáo dục địa phương"
              maxLength={150}
              autoFocus={editing}
            />
          </div>
          {error?.field === 'name' && <span className="field-error">{error.text}</span>}
        </div>

        <div className="notice ink">
          <Icon name="info" />
          <p>Số tiết/tuần của môn theo từng loại lớp được thiết lập ở mục Loại lớp & số tiết.</p>
        </div>

        {error && !error.field && (
          <p className="form-error" role="alert">
            {error.text}
          </p>
        )}

        <div className="card-footer">
          <button type="button" className="btn btn-secondary" onClick={cancel} disabled={saving}>
            Huỷ
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm môn học'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
