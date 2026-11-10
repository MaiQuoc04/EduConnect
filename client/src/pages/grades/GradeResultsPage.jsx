import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getClassResults, listGradeClasses, listMyStudents } from '../../api/grades.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { errorText } from '../../messages.js';
import '../admin/admin.css';
import { fmtScore } from './gradeFormat.js';
import StudentReportCard from './StudentReportCard.jsx';
import useGradeOptions from './useGradeOptions.js';
import './grades.css';

// SCR-47 Academic Results (UC-88) and SCR-48 Class Ranking (UC-89). One page per mode:
//   mode="results": student / parent = own report card; teacher / SM = a class's averages (click a student for theirs)
//   mode="ranking": student / parent = own rank; teacher / SM = the whole class ranking
// Students and parents never see other students' averages or ranks.

function useParamsUpdate() {
  const [params, setParams] = useSearchParams();
  const update = useCallback(
    (changes) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
      setParams(next, { replace: true });
    },
    [params, setParams],
  );
  return [params, update];
}

function YearSelect({ years, value, onChange }) {
  return (
    <label className="field" htmlFor="year">
      <span className="field-label">Năm học</span>
      <select id="year" className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {years.map((y) => (
          <option key={y.schoolYearId} value={y.schoolYearId}>
            {y.yearName}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function GradeResultsPage({ mode = 'results' }) {
  const { activeRole } = useAuth();
  const own = activeRole === 'STUDENT' || activeRole === 'PARENT';
  const title = mode === 'ranking' ? 'Xếp hạng lớp' : 'Kết quả học tập';
  return (
    <div className="grade-wide">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Học tập</span>/<span className="current">{title}</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">{title}</h1>
          <p>
            {own
              ? mode === 'ranking'
                ? 'Thứ hạng trong lớp theo điểm trung bình chung. Chỉ bạn thấy thứ hạng của mình.'
                : 'Điểm từng môn, điểm trung bình học kỳ và cả năm.'
              : mode === 'ranking'
                ? 'Xếp hạng theo điểm trung bình chung; bằng điểm thì cùng hạng.'
                : 'Điểm trung bình các môn của học sinh trong lớp. Chọn một học sinh để xem chi tiết.'}
          </p>
        </div>
      </div>
      {own ? <OwnView mode={mode} /> : <ClassView mode={mode} />}
    </div>
  );
}

// Student / parent: the report card of self or a linked child.
function OwnView({ mode }) {
  const options = useGradeOptions();
  const [params, update] = useParamsUpdate();
  const [students, setStudents] = useState({ items: null, error: '' });
  const yearId = params.get('schoolYearId') ?? '';
  const studentId = params.get('studentId') ?? '';

  useEffect(() => {
    listMyStudents()
      .then((d) => setStudents({ items: d.items, error: '' }))
      .catch((err) => setStudents({ items: [], error: errorText(err) }));
  }, []);
  useEffect(() => {
    if (options.data && !yearId && options.data.currentYearId) update({ schoolYearId: String(options.data.currentYearId) });
  }, [options.data, yearId, update]);
  useEffect(() => {
    if (students.items?.length && !students.items.some((s) => String(s.studentId) === studentId)) {
      update({ studentId: String(students.items[0].studentId) });
    }
  }, [students.items, studentId, update]);

  return (
    <>
      <div className="grade-toolbar">
        <YearSelect years={options.data?.years ?? []} value={yearId} onChange={(v) => update({ schoolYearId: v })} />
        {students.items && students.items.length > 1 && (
          <label className="field" htmlFor="child">
            <span className="field-label">Con</span>
            <select id="child" className="input" value={studentId} onChange={(e) => update({ studentId: e.target.value })}>
              {students.items.map((s) => (
                <option key={s.studentId} value={s.studentId}>
                  {s.fullName}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {(options.error || students.error) && <p className="form-error">{options.error || students.error}</p>}
      {students.items && !students.items.length && (
        <div className="notice">
          <Icon name="info" />
          <p>Tài khoản chưa được liên kết với học sinh nào.</p>
        </div>
      )}
      {studentId && yearId && (mode === 'ranking' ? <OwnRanking studentId={studentId} yearId={yearId} /> : <StudentReportCard studentId={studentId} schoolYearId={yearId} />)}
    </>
  );
}

// UC-89 for a student / parent: own rank per period only (no subject table, no other students).
function OwnRanking({ studentId, yearId }) {
  return <StudentReportCard studentId={studentId} schoolYearId={yearId} rankOnly />;
}

// Teacher / School Manager: a class, a period, then averages or the ranking.
function ClassView({ mode }) {
  const options = useGradeOptions();
  const [params, update] = useParamsUpdate();
  const yearId = params.get('schoolYearId') ?? '';
  const classId = params.get('classId') ?? '';
  const period = params.get('period') ?? 'YEAR';
  const [classes, setClasses] = useState({ items: null, error: '' });
  const [state, setState] = useState({ loading: false, data: null, error: '' });

  useEffect(() => {
    if (options.data && !yearId && options.data.currentYearId) update({ schoolYearId: String(options.data.currentYearId) });
  }, [options.data, yearId, update]);
  useEffect(() => {
    if (!yearId) return;
    listGradeClasses(yearId)
      .then((d) => setClasses({ items: d.items, error: '' }))
      .catch((err) => setClasses({ items: [], error: errorText(err) }));
  }, [yearId]);
  useEffect(() => {
    if (classes.items?.length && !classes.items.some((c) => String(c.classId) === classId)) {
      update({ classId: String(classes.items[0].classId) });
    }
  }, [classes.items, classId, update]);
  useEffect(() => {
    if (!classId) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    getClassResults(classId, period)
      .then((data) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [classId, period]);

  const year = options.data?.years.find((y) => String(y.schoolYearId) === yearId);
  const d = state.data;
  const rows = useMemo(() => {
    if (!d) return [];
    if (mode !== 'ranking') return d.students;
    return [...d.students.filter((s) => s.rank !== null).sort((a, b) => a.rank - b.rank), ...d.students.filter((s) => s.rank === null)];
  }, [d, mode]);
  const studentLink = (s) => `/grades/students/${s.studentId}?schoolYearId=${yearId}`;

  return (
    <>
      <div className="grade-toolbar">
        <YearSelect years={options.data?.years ?? []} value={yearId} onChange={(v) => update({ schoolYearId: v, classId: '', period: '' })} />
        <label className="field" htmlFor="class">
          <span className="field-label">Lớp</span>
          <select id="class" className="input" value={classId} onChange={(e) => update({ classId: e.target.value })}>
            {classes.items?.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.className} ({c.studentCount} HS)
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span className="field-label">Kỳ</span>
          <div className="tabs" role="tablist">
            {[...(year?.semesters ?? []).map((s) => [String(s.semesterId), `Học kỳ ${s.semesterNo}`]), ['YEAR', 'Cả năm']].map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={period === value} onClick={() => update({ period: value === 'YEAR' ? '' : value })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(options.error || classes.error || state.error) && <p className="form-error">{options.error || classes.error || state.error}</p>}
      {classes.items && !classes.items.length && (
        <div className="notice">
          <Icon name="info" />
          <p>Không có lớp nào trong năm học này mà bạn được xem điểm.</p>
        </div>
      )}

      {d && (
        <>
          {d.provisional && (
            <div className="notice amber" style={{ marginBottom: 12 }}>
              <Icon name="info" />
              <p>Một số sổ điểm của kỳ này chưa chốt, điểm trung bình và thứ hạng đang là tạm tính.</p>
            </div>
          )}
          <section className="card card-outline" style={{ padding: 0 }}>
            <div className="table-scroll" style={{ border: 0 }}>
              <table className={`table report-table${state.loading ? ' is-loading' : ''}`}>
                <thead>
                  <tr>
                    {mode === 'ranking' && <th style={{ textAlign: 'center' }}>Hạng</th>}
                    <th style={{ textAlign: 'left' }}>Học sinh</th>
                    {mode !== 'ranking' && d.subjects.map((s) => <th key={s.subjectId}>{s.subjectName}</th>)}
                    <th>ĐTB chung</th>
                    {mode !== 'ranking' && <th>Hạng</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.studentId} className={s.status !== 'STUDYING' ? 'muted' : undefined}>
                      {mode === 'ranking' && (
                        <td>
                          {s.rank ? <span className={`rank-badge${s.rank <= 3 ? ' top' : ''}`}>{s.rank}</span> : <span className="muted">–</span>}
                        </td>
                      )}
                      <td style={{ textAlign: 'left' }}>
                        <Link to={studentLink(s)}>{s.fullName}</Link>
                        <div className="caption muted mono">
                          {s.studentCode}
                          {s.status !== 'STUDYING' && ' · đã rời lớp'}
                        </div>
                      </td>
                      {mode !== 'ranking' &&
                        d.subjects.map((sub) => <td key={sub.subjectId}>{fmtScore(s.averages[sub.subjectId]) || <span className="muted">–</span>}</td>)}
                      <td>
                        <strong>{fmtScore(s.overall) || <span className="muted">–</span>}</strong>
                      </td>
                      {mode !== 'ranking' && <td>{s.rank ?? <span className="muted">–</span>}</td>}
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={4 + d.subjects.length} className="muted" style={{ textAlign: 'center', height: 72 }}>
                        Lớp chưa có học sinh.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <p className="caption muted" style={{ marginTop: 8 }}>
            {d.ranked} học sinh được xếp hạng. Học sinh chưa có điểm nào hoặc đã rời lớp không được xếp hạng.
            {!d.subjects.length && ' Lớp chưa có môn nào được cấu hình điểm.'}
          </p>
        </>
      )}
    </>
  );
}

// Teacher / SM: one student's report card, opened from a class list (scope checked on the server).
export function StudentResultsPage() {
  const { studentId } = useParams();
  const [params] = useSearchParams();
  return (
    <div className="grade-wide">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<Link to="/grades/results">Kết quả học tập</Link>/<span className="current">Học sinh</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Kết quả học tập của học sinh</h1>
        </div>
      </div>
      <StudentReportCard studentId={studentId} schoolYearId={params.get('schoolYearId')} />
    </div>
  );
}
