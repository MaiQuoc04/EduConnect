import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';

const NAME_CODES = ['MSG_CLASS_NAME_TAKEN', 'MSG_CLASS_NAME_FORMAT', 'MSG_CLASS_NAME_GRADE'];

// SCR-22 – UC-28 Create Class Group: a class created by hand, with its three groups. Students are optional and
// picked among those without a class in this school year.
export default function ClassCreateForm({ schoolYear, onCancel, onDone }) {
  const toast = useToast();
  const [grades, setGrades] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [form, setForm] = useState({ className: '', gradeLevelId: '', trackId: '' });
  const [query, setQuery] = useState('');
  const [found, setFound] = useState({ loading: true, students: [] });
  const [picked, setPicked] = useState([]); // [{ studentId, studentCode, fullName, status, parentCount }]
  const [error, setError] = useState(null); // { field: 'name' | null, text }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/classes/grade-levels').then(({ data }) => setGrades(data)).catch(() => setGrades([]));
    api
      .get('/class-tracks', { params: { schoolYearId: schoolYear.schoolYearId } })
      .then(({ data }) => setTracks(data.tracks))
      .catch(() => setTracks([]));
  }, [schoolYear.schoolYearId]);

  // Search students without a class this year (debounced).
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      setFound((f) => ({ ...f, loading: true }));
      api
        .get('/classes/eligible-students', { params: { schoolYearId: schoolYear.schoolYearId, q: query.trim() } })
        .then(({ data }) => alive && setFound({ loading: false, students: data.students }))
        .catch(() => alive && setFound({ loading: false, students: [] }));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, schoolYear.schoolYearId]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const pickedIds = new Set(picked.map((s) => s.studentId));
  const toggle = (s) =>
    setPicked((list) => (pickedIds.has(s.studentId) ? list.filter((x) => x.studentId !== s.studentId) : [...list, s]));

  // Suggest the grade from the name ("11A2" -> 11) while no grade is chosen.
  function suggestGrade() {
    if (form.gradeLevelId) return;
    const prefix = form.className.replace(/\s+/g, '').slice(0, 2);
    const grade = grades.find((g) => g.gradeLevelName === prefix);
    if (grade) setForm((f) => ({ ...f, gradeLevelId: String(grade.gradeLevelId) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.className.trim() || !form.gradeLevelId || !form.trackId) {
      setError({ field: null, text: errorText({ code: 'MSG_REQUIRED' }) });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post('/classes', {
        schoolYearId: schoolYear.schoolYearId,
        className: form.className,
        gradeLevelId: Number(form.gradeLevelId),
        trackId: Number(form.trackId),
        studentIds: picked.map((s) => s.studentId),
      });
      toast(`Đã tạo lớp ${data.className} cùng nhóm chung, nhóm học sinh và nhóm phụ huynh.`);
      onDone();
    } catch (err) {
      setError({ field: NAME_CODES.includes(err.code) ? 'name' : null, text: errorText(err) });
      setSaving(false);
    }
  }

  return (
    <form className="card card-outline class-panel" onSubmit={handleSubmit} noValidate>
      <div className="class-panel-head">
        <div>
          <p className="label-upper muted">Tạo nhóm lớp</p>
          <h2 className="title-md">Lớp mới · Năm học {yearLabel(schoolYear.yearName)}</h2>
        </div>
      </div>

      <div className="class-form-grid">
        <div className={`field${error?.field === 'name' ? ' invalid' : ''}`}>
          <label className="field-label" htmlFor="class-name">
            Tên lớp
          </label>
          <div className="input-wrap">
            <input
              id="class-name"
              className="input"
              value={form.className}
              onChange={set('className')}
              onBlur={suggestGrade}
              placeholder="10A1"
              maxLength={20}
              autoFocus
            />
          </div>
          {error?.field === 'name' ? (
            <span className="field-error">{error.text}</span>
          ) : (
            <span className="field-help">Khối viết liền với chữ hoặc số, ví dụ 10A1.</span>
          )}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="class-grade">
            Khối
          </label>
          <select id="class-grade" className="input" value={form.gradeLevelId} onChange={set('gradeLevelId')}>
            <option value="">Chọn khối</option>
            {grades.map((g) => (
              <option key={g.gradeLevelId} value={g.gradeLevelId}>
                Khối {g.gradeLevelName}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="class-track">
            Loại lớp
          </label>
          <select id="class-track" className="input" value={form.trackId} onChange={set('trackId')}>
            <option value="">Chọn loại lớp</option>
            {tracks.map((t) => (
              <option key={t.trackId} value={t.trackId}>
                {t.trackName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <span className="field-label">
          Học sinh <span className="caption muted">Không bắt buộc · đã chọn {picked.length}</span>
        </span>
        {picked.length > 0 && (
          <span className="chips">
            {picked.map((s) => (
              <span key={s.studentId} className="chip class-chip">
                {s.fullName} <span className="muted">{s.studentCode}</span>
                <button type="button" className="chip-remove" onClick={() => toggle(s)} aria-label={`Bỏ ${s.fullName}`}>
                  <Icon name="close" size="sm" />
                </button>
              </span>
            ))}
          </span>
        )}
        <div className="input-wrap subject-search">
          <Icon name="search" size="sm" className="subject-search-icon" />
          <input
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm học sinh chưa có lớp theo tên hoặc mã…"
            aria-label="Tìm học sinh"
          />
        </div>
        <div className={`class-pick${found.loading ? ' is-loading' : ''}`}>
          {found.students.length === 0 ? (
            <p className="muted caption">
              {found.loading ? 'Đang tìm…' : 'Không có học sinh nào chưa có lớp phù hợp.'}
            </p>
          ) : (
            <ul>
              {found.students.map((s) => (
                <li key={s.studentId}>
                  <label>
                    <input type="checkbox" checked={pickedIds.has(s.studentId)} onChange={() => toggle(s)} />
                    <span className="subject-name">{s.fullName}</span>
                    <span className="mono muted">{s.studentCode}</span>
                    {s.status === 'LOCKED' && <span className="pill">Đã khoá</span>}
                    {s.parentCount === 0 && <span className="caption class-warn">Chưa liên kết phụ huynh</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="field-help">Hiển thị tối đa 50 học sinh; gõ tên hoặc mã để tìm thêm.</span>
      </div>

      <div className="notice ink">
        <Icon name="info" />
        <p>
          Hệ thống tạo nhóm chung, nhóm học sinh và nhóm phụ huynh của lớp. Phụ huynh đã liên kết với học sinh được
          thêm vào nhóm tự động.
        </p>
      </div>

      {error && !error.field && (
        <p className="form-error" role="alert">
          {error.text}
        </p>
      )}

      <div className="card-footer">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Huỷ
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Đang tạo…' : 'Tạo lớp'}
        </button>
      </div>
    </form>
  );
}
