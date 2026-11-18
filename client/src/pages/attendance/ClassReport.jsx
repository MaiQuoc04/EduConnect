import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { exportClassReport, getClassReport } from '../../api/attendance.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { dmy, fmtRate, num, TotalsStrip } from './attendanceShared.jsx';

// UC-93 View Class Attendance: per student totals of a class in a semester (optionally a date range), with export.
// A subject teacher sees only the subjects they teach; the homeroom teacher and School Manager the whole class.
// Used on SCR-56 (tab "Tổng hợp lớp") and in the SCR-51 statistics (a class opened from the table).
export default function ClassReport({ classId, semesterId, from, to }) {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [exporting, setExporting] = useState(false);
  const params = { semesterId, from: from || undefined, to: to || undefined };

  useEffect(() => {
    if (!classId || !semesterId) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    getClassReport(classId, { semesterId, from: from || undefined, to: to || undefined })
      .then((data) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [classId, semesterId, from, to]);

  async function runExport() {
    setExporting(true);
    try {
      await exportClassReport(classId, params);
    } catch (err) {
      toast(errorText(err), { type: 'error' });
    } finally {
      setExporting(false);
    }
  }

  if (!classId) return <p className="muted">Chọn một lớp để xem tổng hợp.</p>;
  if (state.error) return <p className="form-error" role="alert">{state.error}</p>;
  const data = state.data;
  if (!data) return <p className="muted">Đang tải…</p>;
  const totals = data.students.reduce(
    (t, s) => ({
      records: t.records + s.records,
      present: t.present + s.present,
      late: t.late + s.late,
      excused: t.excused + s.excused,
      unexcused: t.unexcused + s.unexcused,
    }),
    { records: 0, present: 0, late: 0, excused: 0, unexcused: 0 },
  );
  totals.presentRate = totals.records ? Math.round(((totals.present + totals.late) * 1000) / totals.records) / 10 : null;

  return (
    <div className={`att-report${state.loading ? ' is-refreshing' : ''}`}>
      <div className="att-report-head">
        <div>
          <h3 className="title-sm">
            Lớp {data.class.className} · Học kỳ {data.semester.semesterNo}, năm học {data.semester.yearName}
          </h3>
          <p className="caption muted">
            Từ {dmy(data.from)} đến {dmy(data.to)} · {num(data.taken)}/{num(data.held)} tiết đã diễn ra có điểm danh
            {data.scope === 'SUBJECTS' && ' · chỉ các môn bạn dạy'}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={runExport} disabled={exporting}>
          <Icon name="download" size="sm" /> {exporting ? 'Đang xuất…' : 'Xuất Excel'}
        </button>
      </div>
      <TotalsStrip totals={totals} />
      <div className="att-table-wrap">
        <table className="table att-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Học sinh</th>
              <th className="num">Lượt ghi nhận</th>
              <th className="num">Có mặt</th>
              <th className="num">Đi muộn</th>
              <th className="num">Vắng có phép</th>
              <th className="num">Vắng không phép</th>
              <th className="num">Tỷ lệ có mặt</th>
            </tr>
          </thead>
          <tbody>
            {data.students.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">Lớp chưa có học sinh.</td>
              </tr>
            )}
            {data.students.map((s, i) => (
              <tr key={s.enrollmentId}>
                <td className="mono">{i + 1}</td>
                <td>
                  <Link to={`/attendance/students/${s.studentId}?semesterId=${semesterId}`} className="att-link">
                    {s.fullName}
                  </Link>
                  <span className="caption muted"> · {s.studentCode}</span>
                  {s.enrollmentStatus !== 'STUDYING' && <span className="chip att-left">Đã rời lớp</span>}
                </td>
                <td className="num mono">{num(s.records)}</td>
                <td className="num mono">{num(s.present)}</td>
                <td className="num mono">{num(s.late)}</td>
                <td className="num mono">{num(s.excused)}</td>
                <td className={`num mono${s.unexcused ? ' att-red' : ''}`}>{num(s.unexcused)}</td>
                <td className="num mono">{fmtRate(s.presentRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
