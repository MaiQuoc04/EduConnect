import { useEffect, useState } from 'react';
import { getAttendanceOptions } from '../../api/attendance.js';
import { errorText } from '../../messages.js';

// FE-12 Attendance (owner: Quoc) – pieces shared by the attendance screens.

export const STATUS = {
  PRESENT: { label: 'Có mặt', short: 'Có mặt', tone: 'green' },
  LATE: { label: 'Đi muộn', short: 'Muộn', tone: 'amber' },
  ABSENT_EXCUSED: { label: 'Vắng có phép', short: 'Có phép', tone: 'blue' },
  ABSENT_UNEXCUSED: { label: 'Vắng không phép', short: 'Không phép', tone: 'red' },
};
export const STATUS_ORDER = ['PRESENT', 'LATE', 'ABSENT_EXCUSED', 'ABSENT_UNEXCUSED'];
export const ABSENCES = ['ABSENT_EXCUSED', 'ABSENT_UNEXCUSED'];

export function StatusTag({ status }) {
  const s = STATUS[status];
  if (!s) return <span className="muted">—</span>;
  return <span className={`pill ${s.tone}`}>{s.label}</span>;
}

export const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
export const weekday = (iso) => WEEKDAYS[new Date(`${iso}T00:00:00`).getDay()];
export const fmtDateTime = (value) => {
  if (!value) return '';
  const [d, t] = String(value).split(/[ T]/);
  return `${t?.slice(0, 5) ?? ''} ${dmy(d)}`.trim();
};
// A date moved by n days (YYYY-MM-DD, local calendar).
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const fmtRate = (r) => (r === null || r === undefined ? '—' : `${String(r).replace('.', ',')}%`);
export const num = (n) => Number(n ?? 0).toLocaleString('vi-VN');

// School years, semesters, grade levels, today and the deadline of the day (GET /attendances/options).
export function useAttendanceOptions() {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    let alive = true;
    getAttendanceOptions()
      .then((data) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, []);
  const semesters =
    state.data?.years.flatMap((y) => y.semesters.map((s) => ({ ...s, yearName: y.yearName, schoolYearId: y.schoolYearId }))) ?? [];
  return { ...state, semesters };
}

export function SemesterSelect({ id = 'att-semester', semesters, value, onChange }) {
  const years = [...new Map(semesters.map((s) => [s.schoolYearId, s.yearName])).entries()];
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">Học kỳ</span>
      <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {years.map(([yearId, yearName]) => (
          <optgroup key={yearId} label={`Năm học ${yearName}`}>
            {semesters
              .filter((s) => s.schoolYearId === yearId)
              .map((s) => (
                <option key={s.semesterId} value={s.semesterId}>
                  Học kỳ {s.semesterNo} – {yearName}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

// Totals as four small figures (present rate, late, excused, unexcused).
export function TotalsStrip({ totals }) {
  if (!totals) return null;
  return (
    <div className="att-totals">
      <div className="att-total">
        <span className="caption">Tỷ lệ có mặt</span>
        <strong>{fmtRate(totals.presentRate)}</strong>
        <span className="caption muted">{num(totals.records)} lượt ghi nhận</span>
      </div>
      <div className="att-total is-amber">
        <span className="caption">Đi muộn</span>
        <strong>{num(totals.late)}</strong>
      </div>
      <div className="att-total is-blue">
        <span className="caption">Vắng có phép</span>
        <strong>{num(totals.excused)}</strong>
      </div>
      <div className="att-total is-red">
        <span className="caption">Vắng không phép</span>
        <strong>{num(totals.unexcused)}</strong>
      </div>
    </div>
  );
}
