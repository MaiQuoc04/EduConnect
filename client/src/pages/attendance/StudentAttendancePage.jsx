import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getStudentAttendance, listAttendanceStudents } from '../../api/attendance.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { errorText } from '../../messages.js';
import { dmy, SemesterSelect, StatusTag, TotalsStrip, useAttendanceOptions, weekday } from './attendanceShared.jsx';
import './attendance.css';

// SCR-55 Personal Attendance (student), SCR-54 Child Attendance with SCR-53 Select Child (parent) – UC-92.
// Also opened by a teacher / School Manager from the class report (/attendance/students/:studentId).
// Totals of the semester and the periods that were not "present", filtered by month (§12 point 8). Mobile layout.

// Months (YYYY-MM) from the semester's start to its end.
function monthsOf(semester) {
  if (!semester) return [];
  const out = [];
  let [y, m] = semester.startDate.split('-').map(Number);
  const [ey, em] = semester.endDate.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export default function StudentAttendancePage() {
  const { activeRole } = useAuth();
  const own = activeRole === 'STUDENT' || activeRole === 'PARENT';
  const { studentId: routeStudentId } = useParams();
  const [params, setParams] = useSearchParams();
  const update = useCallback(
    (changes) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(changes)) (v ? next.set(k, String(v)) : next.delete(k));
      setParams(next, { replace: true });
    },
    [setParams],
  );
  const options = useAttendanceOptions();
  const semesterId = params.get('semesterId') || String(options.data?.currentSemesterId ?? '');
  const month = params.get('month') ?? '';

  const [students, setStudents] = useState({ items: null, error: '' });
  useEffect(() => {
    if (!own) return;
    listAttendanceStudents()
      .then((d) => setStudents({ items: d.items, error: '' }))
      .catch((err) => setStudents({ items: [], error: errorText(err) }));
  }, [own]);
  const studentId = routeStudentId ?? (params.get('studentId') || String(students.items?.[0]?.studentId ?? ''));

  const [state, setState] = useState({ loading: false, data: null, error: '' });
  useEffect(() => {
    if (!studentId || !semesterId) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    getStudentAttendance(studentId, { semesterId, month: month || undefined })
      .then((data) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [studentId, semesterId, month]);

  const semester = useMemo(() => options.semesters.find((s) => String(s.semesterId) === String(semesterId)), [options.semesters, semesterId]);
  const months = monthsOf(semester);
  const data = state.data;
  const title = activeRole === 'PARENT' ? 'Điểm danh của con' : own ? 'Điểm danh của tôi' : 'Điểm danh học sinh';

  return (
    <div className="att-page att-own">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Điểm danh</span>/<span className="current">{title}</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">{title}</h1>
          <p>Tổng hợp theo học kỳ và các tiết đi muộn hoặc vắng. Có thắc mắc, vui lòng liên hệ giáo viên chủ nhiệm.</p>
        </div>
        {!own && (
          <button type="button" className="btn btn-secondary" onClick={() => window.history.back()}>
            <Icon name="arrow_back" size="sm" /> Quay lại
          </button>
        )}
      </div>

      {(options.error || students.error) && <p className="form-error" role="alert">{options.error || students.error}</p>}
      {own && students.items?.length === 0 && (
        <div className="notice">
          <Icon name="info" />
          <p>{activeRole === 'PARENT' ? 'Tài khoản chưa được liên kết với học sinh nào.' : 'Không tìm thấy hồ sơ học sinh của bạn.'}</p>
        </div>
      )}

      {activeRole === 'PARENT' && students.items?.length > 1 && (
        <div className="att-children" role="tablist" aria-label="Chọn con">
          {students.items.map((s) => (
            <button
              key={s.studentId}
              type="button"
              role="tab"
              aria-selected={String(s.studentId) === String(studentId)}
              className={`att-child${String(s.studentId) === String(studentId) ? ' is-on' : ''}`}
              onClick={() => update({ studentId: s.studentId, month: null })}
            >
              <Icon name="face" size="sm" />
              <span>
                <strong>{s.fullName}</strong>
                <span className="caption muted">{s.studentCode}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {studentId && (
        <>
          <div className="att-filters att-filters-own">
            <SemesterSelect semesters={options.semesters} value={semesterId} onChange={(v) => update({ semesterId: v, month: null })} />
            <label className="field" htmlFor="att-month">
              <span className="field-label">Tháng</span>
              <select id="att-month" className="input" value={month} onChange={(e) => update({ month: e.target.value })}>
                <option value="">Cả học kỳ</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    Tháng {Number(m.slice(5))}/{m.slice(0, 4)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {state.error && <p className="form-error" role="alert">{state.error}</p>}
          {data && (
            <div className={state.loading ? 'is-refreshing' : undefined}>
              <section className="card card-outline att-own-card">
                <h2 className="title-sm">
                  {data.student.fullName}
                  <span className="caption muted">
                    {' '}
                    · {data.student.studentCode}
                    {data.student.className ? ` · Lớp ${data.student.className}` : ''}
                  </span>
                </h2>
                <p className="caption muted">Học kỳ {data.semester.semesterNo}, năm học {data.semester.yearName} (cả học kỳ)</p>
                <TotalsStrip totals={data.totals} />
              </section>

              <section className="card card-outline att-own-card">
                <h2 className="title-sm">
                  Các tiết đi muộn, vắng {month ? `trong tháng ${Number(month.slice(5))}/${month.slice(0, 4)}` : 'trong học kỳ'}
                </h2>
                {data.records.length === 0 ? (
                  <p className="muted att-empty">Không có tiết nào đi muộn hoặc vắng.</p>
                ) : (
                  <ul className="att-records">
                    {data.records.map((r) => (
                      <li key={r.attendanceId} className="att-record">
                        <div className="att-record-when">
                          <strong>{dmy(r.date)}</strong>
                          <span className="caption muted">{weekday(r.date)}</span>
                        </div>
                        <div className="att-record-main">
                          <strong>{r.subjectName}</strong>
                          <span className="caption muted">
                            Tiết {r.period} ({r.start}–{r.end}) · Lớp {r.className}
                          </span>
                          {r.note && <span className="caption">Ghi chú: {r.note}</span>}
                        </div>
                        <StatusTag status={r.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
          {!own && (
            <p className="caption muted">
              <Link to="/attendance?tab=report">Về tổng hợp lớp</Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
