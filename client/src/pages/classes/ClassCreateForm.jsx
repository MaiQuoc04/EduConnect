import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';
import { MAX_CLASS_SIZE } from './studentPick.js';
import StudentPicker from './StudentPicker.jsx';
import StudentReview from './StudentReview.jsx';

const NAME_CODES = ['MSG_CLASS_NAME_TAKEN', 'MSG_CLASS_NAME_FORMAT', 'MSG_CLASS_NAME_GRADE'];
const STEPS = ['Thông tin lớp', 'Thêm học sinh', 'Kiểm tra & tạo'];

// Same rule as the server (classes.service.js): the grade followed by 1–8 letters or digits, e.g. 10A1.
const normalizeName = (text) => text.replace(/\s+/g, '').toUpperCase();
function nameCode(name, gradeName, takenNames) {
  if (!/^(10|11|12)[A-Z0-9]{1,8}$/.test(name)) return 'MSG_CLASS_NAME_FORMAT';
  if (gradeName && !name.startsWith(gradeName)) return 'MSG_CLASS_NAME_GRADE';
  if (takenNames.includes(name)) return 'MSG_CLASS_NAME_TAKEN';
  return null;
}

// SCR-22 – UC-28 Create Class Group, as three steps: the class, its students, a check before saving. Students come
// from last year's class, a pasted list of codes or a search limited to the class's grade, instead of one list of
// the whole school. Creates the class with its three groups; at most 45 students (agreed 29/10).
export default function ClassCreateForm({ schoolYear, takenNames = [], onCancel, onDone }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [grades, setGrades] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [form, setForm] = useState({ className: '', gradeLevelId: '', trackId: '' });
  const [picked, setPicked] = useState([]);
  const [error, setError] = useState(null); // { field: 'name' | null, text }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/classes/grade-levels').then(({ data }) => setGrades(data)).catch(() => setGrades([]));
    api
      .get('/class-tracks', { params: { schoolYearId: schoolYear.schoolYearId } })
      .then(({ data }) => setTracks(data.tracks))
      .catch(() => setTracks([]));
  }, [schoolYear.schoolYearId]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const grade = grades.find((g) => String(g.gradeLevelId) === form.gradeLevelId);
  const track = tracks.find((t) => String(t.trackId) === form.trackId);
  const className = normalizeName(form.className);

  // Suggest the grade from the name ("11A2" -> 11) while no grade is chosen.
  function suggestGrade() {
    if (form.gradeLevelId) return;
    const match = grades.find((g) => g.gradeLevelName === className.slice(0, 2));
    if (match) setForm((f) => ({ ...f, gradeLevelId: String(match.gradeLevelId) }));
  }

  function next() {
    setError(null);
    if (step === 0) {
      if (!className || !form.gradeLevelId || !form.trackId) {
        setError({ field: null, text: errorText({ code: 'MSG_REQUIRED' }) });
        return;
      }
      const code = nameCode(className, grade?.gradeLevelName, takenNames);
      if (code) {
        setError({ field: 'name', text: errorText({ code }) });
        return;
      }
    }
    setStep((s) => s + 1);
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post('/classes', {
        schoolYearId: schoolYear.schoolYearId,
        className,
        gradeLevelId: Number(form.gradeLevelId),
        trackId: Number(form.trackId),
        studentIds: picked.map((s) => s.studentId),
      });
      toast(
        `Đã tạo lớp ${data.className} với ${data.studentCount} học sinh, cùng nhóm chung, nhóm học sinh và nhóm phụ huynh.`,
      );
      onDone();
    } catch (err) {
      const nameError = NAME_CODES.includes(err.code);
      setError({ field: nameError ? 'name' : null, text: errorText(err) });
      if (nameError) setStep(0);
      setSaving(false);
    }
  }

  return (
    <section className="card card-outline class-panel wizard" aria-labelledby="class-create-title">
      <div className="class-panel-head">
        <div>
          <p className="label-upper muted">Tạo nhóm lớp · Năm học {yearLabel(schoolYear.yearName)}</p>
          <h2 id="class-create-title" className="title-md">
            {step === 0 || !className ? 'Lớp mới' : `Lớp ${className}`}
            {step > 0 && track && <span className="caption muted"> · Khối {grade?.gradeLevelName} · {track.trackName}</span>}
          </h2>
        </div>
        <ol className="wizard-steps" aria-label="Các bước">
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : undefined} aria-current={i === step ? 'step' : undefined}>
              <span className="wizard-dot">{i < step ? <Icon name="check" size="sm" /> : i + 1}</span>
              <span className="wizard-label">{label}</span>
            </li>
          ))}
        </ol>
      </div>

      {step === 0 && (
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
      )}

      {step === 1 && (
        <StudentPicker
          schoolYear={schoolYear}
          grade={grade?.gradeLevelName}
          gradeLevelId={form.gradeLevelId}
          capacity={MAX_CLASS_SIZE}
          picked={picked}
          setPicked={setPicked}
        />
      )}

      {step === 2 && (
        <>
          <StudentReview
            students={picked}
            grade={grade?.gradeLevelName}
            onRemove={(s) => setPicked((list) => list.filter((x) => x.studentId !== s.studentId))}
          />
          <div className="notice ink">
            <Icon name="info" />
            <p>
              Hệ thống tạo nhóm chung, nhóm học sinh và nhóm phụ huynh của lớp. Phụ huynh đã liên kết với học sinh được
              thêm vào nhóm tự động.
            </p>
          </div>
        </>
      )}

      {error && !error.field && (
        <p className="form-error" role="alert">
          {error.text}
        </p>
      )}

      <div className="card-footer">
        {step === 0 ? (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Huỷ
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => setStep((s) => s - 1)} disabled={saving}>
            <Icon name="arrow_back" size="sm" />
            Quay lại
          </button>
        )}
        {step < 2 ? (
          <button type="button" className="btn btn-primary" onClick={next}>
            {step === 0 ? 'Tiếp tục: thêm học sinh' : `Tiếp tục: kiểm tra (${picked.length})`}
            <Icon name="arrow_forward" size="sm" />
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Đang tạo…' : 'Tạo lớp và 3 nhóm'}
          </button>
        )}
      </div>
    </section>
  );
}
