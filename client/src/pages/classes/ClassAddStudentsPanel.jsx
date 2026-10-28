import { useState } from 'react';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';
import { MAX_CLASS_SIZE } from './studentPick.js';
import StudentPicker from './StudentPicker.jsx';
import StudentReview from './StudentReview.jsx';

// SCR-22 – UC-28, adding students to a class that already exists (e.g. joining mid-year): the same picker and check
// as creating a class. The new students and their linked parents join the class groups.
// ASSUMPTION (agreed 29/10 with Khanh, to confirm with Quoc): part of UC-28 rather than a new UC.
export default function ClassAddStudentsPanel({ schoolYear, cls, onCancel, onDone }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const capacity = Math.max(0, MAX_CLASS_SIZE - cls.studentCount);

  async function handleSubmit() {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post(`/classes/${cls.classId}/students`, { studentIds: picked.map((s) => s.studentId) });
      toast(`Đã thêm ${data.added} học sinh vào lớp ${data.className}. Sĩ số hiện tại ${data.studentCount}.`);
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <section className="card card-outline class-panel wizard" aria-labelledby="class-add-title">
      <div className="class-panel-head">
        <div>
          <p className="label-upper muted">Thêm học sinh · Năm học {yearLabel(schoolYear.yearName)}</p>
          <h2 id="class-add-title" className="title-md">
            Lớp {cls.className}
            <span className="caption muted">
              {' '}
              · Đang có {cls.studentCount}/{MAX_CLASS_SIZE} học sinh
            </span>
          </h2>
        </div>
      </div>

      {capacity === 0 ? (
        <div className="notice">
          <Icon name="info" />
          <p>Lớp đã đủ {MAX_CLASS_SIZE} học sinh nên không thêm được nữa.</p>
        </div>
      ) : step === 0 ? (
        <StudentPicker
          schoolYear={schoolYear}
          grade={cls.gradeLevel}
          gradeLevelId={cls.gradeLevelId}
          capacity={capacity}
          picked={picked}
          setPicked={setPicked}
        />
      ) : (
        <StudentReview
          students={picked}
          grade={cls.gradeLevel}
          currentCount={cls.studentCount}
          onRemove={(s) => setPicked((list) => list.filter((x) => x.studentId !== s.studentId))}
        />
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="card-footer">
        {step === 0 ? (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Huỷ
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => setStep(0)} disabled={saving}>
            <Icon name="arrow_back" size="sm" />
            Quay lại
          </button>
        )}
        {capacity > 0 &&
          (step === 0 ? (
            <button type="button" className="btn btn-primary" onClick={() => setStep(1)} disabled={!picked.length}>
              Tiếp tục: kiểm tra ({picked.length})
              <Icon name="arrow_forward" size="sm" />
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={saving || !picked.length}>
              {saving ? 'Đang thêm…' : `Thêm ${picked.length} học sinh`}
            </button>
          ))}
      </div>
    </section>
  );
}
