import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { toSubjectCode } from './subjectText.js';

const CODE_ERRORS = ['MSG_SUBJECT_CODE_FORMAT', 'MSG_SUBJECT_CODE_TAKEN', 'MSG_SUBJECT_CODE_LOCKED'];
const NAME_ERRORS = ['MSG_SUBJECT_NAME_LENGTH', 'MSG_SUBJECT_NAME_TAKEN'];

// SCR-21 Create / Update Subject – UC-24 Create Subject (/subjects/new) and UC-25 Update Subject
// (/subjects/:id/edit). A subject has only a code and a name; its class types, periods and weights are set in
// "Loại lớp & hệ số môn" (UC-26). Once the subject is used, the server locks the code (codeLocked).
export default function SubjectFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ subjectCode: '', subjectName: '' });
  const [original, setOriginal] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState(null); // { field: 'code' | 'name' | null, text }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return undefined;
    let alive = true;
    api
      .get(`/subjects/${id}`)
      .then(({ data }) => {
        if (!alive) return;
        setOriginal(data.subject);
        setForm({ subjectCode: data.subject.subjectCode, subjectName: data.subject.subjectName });
      })
      .catch((err) => alive && setLoadError(errorText(err)));
    return () => {
      alive = false;
    };
  }, [editing, id]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.subjectCode || !form.subjectName.trim()) {
      setError({ field: null, text: errorText({ code: 'MSG_REQUIRED' }) });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data } = editing ? await api.put(`/subjects/${id}`, form) : await api.post('/subjects', form);
      toast(editing ? 'Đã lưu thay đổi môn học.' : `Đã thêm môn học ${data.subject.subjectName}.`);
      navigate(`/subjects/${data.subject.subjectId}`);
    } catch (err) {
      const field = CODE_ERRORS.includes(err.code) ? 'code' : NAME_ERRORS.includes(err.code) ? 'name' : null;
      setError({ field, text: errorText(err) });
      setSaving(false);
    }
  }

  if (loadError) return <p className="form-error">{loadError}</p>;
  if (editing && !original) return <p className="loading">Đang tải môn học…</p>;

  const back = editing ? `/subjects/${id}` : '/subjects';
  const codeLocked = Boolean(original?.codeLocked);

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Đào tạo</span>/<Link to="/subjects">Môn học</Link>/
        <span className="current">{editing ? 'Sửa môn học' : 'Thêm môn học'}</span>
      </nav>
      <Link to={back} className="back-link">
        <Icon name="arrow_back" size="sm" />
        {editing ? original.subjectName : 'Danh mục môn học'}
      </Link>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">{editing ? 'Sửa thông tin môn học' : 'Thêm môn học'}</h1>
          <p>Mã môn và tên môn hiển thị trong toàn hệ thống và trong các tệp nhập dữ liệu.</p>
        </div>
      </div>

      <form className="card card-outline form-card" onSubmit={handleSubmit} noValidate>
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
          <p>Số tiết/tuần và hệ số của môn theo từng loại lớp được thiết lập ở mục Loại lớp & hệ số môn.</p>
        </div>

        {error && !error.field && (
          <p className="form-error" role="alert">
            {error.text}
          </p>
        )}

        <div className="card-footer">
          <Link to={back} className="btn btn-secondary">
            Huỷ
          </Link>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm môn học'}
          </button>
        </div>
      </form>
    </>
  );
}
