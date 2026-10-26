import { useState } from 'react';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { yearLabel } from './schoolYearLabels.js';

const NAME_CODES = ['MSG_SCHOOL_YEAR_NAME_FORMAT', 'MSG_SCHOOL_YEAR_NAME_TAKEN'];
const DATE_CODES = [
  'MSG_INVALID_DATE',
  'MSG_SCHOOL_YEAR_DATES',
  'MSG_SCHOOL_YEAR_DATES_NAME',
  'MSG_SCHOOL_YEAR_OVERLAP',
  'MSG_SCHOOL_YEAR_SEMESTER_OUT_OF_RANGE',
];

// SCR-18 create / update a school year (UC-20). `year` = the year being edited, or null to create one.
export default function SchoolYearForm({ year, onSaved, onCancel }) {
  const editing = Boolean(year);
  const [form, setForm] = useState({
    yearName: editing ? yearLabel(year.yearName) : '',
    startDate: year?.startDate ?? '',
    endDate: year?.endDate ?? '',
  });
  const [error, setError] = useState(null); // { field: 'name' | 'dates' | null, text }
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Suggests the usual dates once a valid name is typed and no date is chosen yet.
  function suggestDates() {
    const match = /^(\d{4})\s*[–—-]\s*(\d{4})$/.exec(form.yearName.trim());
    if (!match || form.startDate || form.endDate) return;
    setForm((f) => ({ ...f, startDate: `${match[1]}-09-05`, endDate: `${match[2]}-05-31` }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.yearName.trim() || !form.startDate || !form.endDate) {
      setError({ field: null, text: errorText({ code: 'MSG_REQUIRED' }) });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data } = editing
        ? await api.put(`/school-years/${year.schoolYearId}`, form)
        : await api.post('/school-years', form);
      onSaved(data, editing);
    } catch (err) {
      const field = NAME_CODES.includes(err.code) ? 'name' : DATE_CODES.includes(err.code) ? 'dates' : null;
      setError({ field, text: errorText(err) });
      setSaving(false);
    }
  }

  return (
    <form className="card card-outline form-card year-form" onSubmit={handleSubmit} noValidate>
      <div>
        <p className="label-upper muted">{editing ? 'Chỉnh sửa năm học' : 'Thêm năm học'}</p>
        <h2 className="title-md">{editing ? `Năm học ${yearLabel(year.yearName)}` : 'Năm học mới'}</h2>
      </div>

      <div className={`field${error?.field === 'name' ? ' invalid' : ''}`}>
        <label className="field-label" htmlFor="year-name">
          Tên năm học
        </label>
        <div className="input-wrap">
          <input
            id="year-name"
            className="input"
            value={form.yearName}
            onChange={set('yearName')}
            onBlur={editing ? undefined : suggestDates}
            placeholder="2027–2028"
            maxLength={20}
            autoFocus
          />
        </div>
        {error?.field === 'name' ? (
          <span className="field-error">{error.text}</span>
        ) : (
          <span className="field-help">Gồm hai năm liên tiếp, ví dụ 2027–2028.</span>
        )}
      </div>

      <div className="year-form-dates">
        <div className={`field${error?.field === 'dates' ? ' invalid' : ''}`}>
          <label className="field-label" htmlFor="year-start">
            Ngày bắt đầu
          </label>
          <div className="input-wrap">
            <input id="year-start" type="date" className="input" value={form.startDate} onChange={set('startDate')} />
          </div>
        </div>
        <div className={`field${error?.field === 'dates' ? ' invalid' : ''}`}>
          <label className="field-label" htmlFor="year-end">
            Ngày kết thúc
          </label>
          <div className="input-wrap">
            <input id="year-end" type="date" className="input" value={form.endDate} onChange={set('endDate')} />
          </div>
        </div>
      </div>
      {error?.field === 'dates' && <span className="field-error year-form-date-error">{error.text}</span>}

      {editing && (
        <div className="notice ink">
          <Icon name="info" />
          <p>Các học kỳ đã tạo phải nằm trong khoảng thời gian mới của năm học.</p>
        </div>
      )}

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
          {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm năm học'}
        </button>
      </div>
    </form>
  );
}
