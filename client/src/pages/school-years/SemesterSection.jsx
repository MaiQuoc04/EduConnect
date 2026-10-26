import { useState } from 'react';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import SemesterCard from './SemesterCard.jsx';

// Suggested dates for a new year's semesters, like the seed: semester 1 until mid-January, a short break, then
// semester 2 until the end of the year. Only a starting point – the School Manager edits them.
function suggest(year) {
  const firstYear = year.yearName.slice(0, 4);
  const secondYear = String(Number(firstYear) + 1);
  return [
    { semesterNo: 1, startDate: year.startDate, endDate: `${secondYear}-01-15` },
    { semesterNo: 2, startDate: `${secondYear}-01-18`, endDate: year.endDate },
  ];
}

// SCR-18 "Các học kỳ trong năm" (UC-21): create the two semesters, then one card per semester.
export default function SemesterSection({ year, onChanged }) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function startCreate() {
    setRows(suggest(year));
    setError('');
    setCreating(true);
  }

  const setDate = (no, key) => (e) =>
    setRows((list) => list.map((r) => (r.semesterNo === no ? { ...r, [key]: e.target.value } : r)));

  async function create(e) {
    e.preventDefault();
    if (rows.some((r) => !r.startDate || !r.endDate)) {
      setError(errorText({ code: 'MSG_REQUIRED' }));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/school-years/${year.schoolYearId}/semesters`, { semesters: rows });
      setCreating(false);
      toast('Đã tạo 2 học kỳ.');
      onChanged(data);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="semester-head">
        <h3 className="title-sm">Các học kỳ trong năm</h3>
        <span className="chip">{year.semesters.length} kỳ</span>
      </div>

      {year.semesters.length > 0 ? (
        <div className="stack semester-stack">
          {year.semesters.map((s) => (
            <SemesterCard key={s.semesterId} yearId={year.schoolYearId} semester={s} onChanged={onChanged} />
          ))}
        </div>
      ) : creating ? (
        <form className="card card-outline semester-create" onSubmit={create} noValidate>
          {rows.map((r) => (
            <fieldset key={r.semesterNo} className="semester-create-row">
              <legend className="title-sm">Học kỳ {r.semesterNo}</legend>
              <div className="year-form-dates">
                <label className="field">
                  <span className="field-label">Ngày bắt đầu</span>
                  <input type="date" className="input" value={r.startDate} onChange={setDate(r.semesterNo, 'startDate')} />
                </label>
                <label className="field">
                  <span className="field-label">Ngày kết thúc</span>
                  <input type="date" className="input" value={r.endDate} onChange={setDate(r.semesterNo, 'endDate')} />
                </label>
              </div>
            </fieldset>
          ))}
          <p className="field-help">Học kỳ 1 phải kết thúc trước khi học kỳ 2 bắt đầu, cả hai nằm trong năm học.</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="card-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)} disabled={busy}>
              Huỷ
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Đang tạo…' : 'Tạo 2 học kỳ'}
            </button>
          </div>
        </form>
      ) : (
        <div className="notice semester-empty">
          <Icon name="info" />
          <p>Năm học này chưa có học kỳ.</p>
          {year.canCreateSemesters && (
            <button type="button" className="btn btn-primary push" onClick={startCreate}>
              <Icon name="add" size="sm" />
              Tạo học kỳ
            </button>
          )}
        </div>
      )}
    </section>
  );
}
