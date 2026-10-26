import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';
import { formatWeight } from './subjectText.js';

const TEACHERS_SHOWN = 5; // longer lists open with "+n giáo viên khác"
const MISSING = 'MISSING'; // table filter: classes without an active teacher

// A class "has a teacher" only when its current teacher's account is active (a locked teacher must be replaced).
const hasActiveTeacher = (c) => c.teacher?.status === 'ACTIVE';

function classStatus(teacher) {
  if (!teacher) return { label: 'Chưa có giáo viên', pill: 'amber' };
  if (teacher.status !== 'ACTIVE') return { label: 'Giáo viên đã khoá', pill: 'red' };
  return { label: 'Đang dạy', pill: 'green' };
}

// SCR-20 Subject Detail – UC-23 View Subject Detail (School Manager): the subject, its class types, periods and
// weights for the chosen school year, the classes that study it with their teacher, and who can teach it.
// The year lives in ?schoolYearId= so the list and this page stay on the same year.
export default function SubjectDetailPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const yearId = params.get('schoolYearId') ?? '';
  const [years, setYears] = useState([]);
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [grade, setGrade] = useState(''); // '' = all, a grade level, or MISSING
  const [allTeachers, setAllTeachers] = useState(false);

  useEffect(() => {
    api
      .get('/school-years')
      .then(({ data }) => setYears(data))
      .catch(() => setYears([]));
  }, []);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    api
      .get(`/subjects/${id}`, { params: yearId ? { schoolYearId: yearId } : {} })
      .then(({ data }) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [id, yearId]);

  const classes = useMemo(() => state.data?.classes ?? [], [state.data]);
  const grades = useMemo(() => [...new Set(classes.map((c) => c.gradeLevel))].sort(), [classes]);
  const missing = useMemo(() => classes.filter((c) => !hasActiveTeacher(c)), [classes]);
  let shown = classes;
  if (grade === MISSING) shown = missing;
  else if (grade) shown = classes.filter((c) => c.gradeLevel === grade);

  function showMissing() {
    setGrade(MISSING);
    document.getElementById('subject-classes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (state.loading && !state.data) return <p className="loading">Đang tải môn học…</p>;
  if (state.error) {
    return (
      <>
        <Link to="/subjects" className="back-link">
          <Icon name="arrow_back" size="sm" />
          Danh sách môn học
        </Link>
        <p className="form-error">{state.error}</p>
      </>
    );
  }

  const { subject, schoolYear, tracks, teachers, summary } = state.data;
  const selectedYear = yearId || (schoolYear ? String(schoolYear.schoolYearId) : '');
  const yearQuery = yearId ? `?schoolYearId=${yearId}` : '';

  return (
    <div className={state.loading ? 'is-loading' : undefined}>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Đào tạo</span>/<Link to={`/subjects${yearQuery}`}>Môn học</Link>/
        <span className="current">{subject.subjectName}</span>
      </nav>
      <Link to={`/subjects${yearQuery}`} className="back-link">
        <Icon name="arrow_back" size="sm" />
        Danh sách môn học
      </Link>

      <div className="page-header">
        <div>
          <h1 className="headline-lg subject-title">
            {subject.subjectName}
            <span className="chip mono">{subject.subjectCode}</span>
          </h1>
          <p>Nơi môn học được dạy và giáo viên phụ trách trong năm học đang chọn.</p>
        </div>
        <div className="actions-row">
          <select
            className="input year-select"
            value={selectedYear}
            onChange={(e) => {
              setGrade('');
              setParams(e.target.value ? { schoolYearId: e.target.value } : {});
            }}
            aria-label="Năm học"
            disabled={!years.length}
          >
            {!years.length && <option value="">{schoolYear ? `Năm học ${yearLabel(schoolYear.yearName)}` : 'Năm học'}</option>}
            {years.map((y) => (
              <option key={y.schoolYearId} value={y.schoolYearId}>
                Năm học {yearLabel(y.yearName)}
              </option>
            ))}
          </select>
          <Link to={`/subjects/${subject.subjectId}/edit`} className="btn btn-primary">
            <Icon name="edit" size="sm" />
            Sửa thông tin môn
          </Link>
        </div>
      </div>

      <section className="card card-outline subject-overview">
        <h2 className="card-title title-sm">
          <Icon name="library_books" />
          Thông tin tổng quan
        </h2>

        <div className="subject-stats">
          <div>
            <p className="label-upper muted">Lớp học môn</p>
            <p className="subject-figure">
              {summary.classCount} <span>lớp</span>
            </p>
          </div>
          <div>
            <p className="label-upper muted">Có giáo viên đang dạy</p>
            <p className={`subject-figure${missing.length ? ' amber' : ''}`}>
              {summary.classCount - missing.length}/{summary.classCount} <span>lớp</span>
            </p>
          </div>
          <div>
            <p className="label-upper muted">Tổng tiết/tuần</p>
            <p className="subject-figure">
              {summary.totalPeriodsPerWeek} <span>tiết/tuần</span>
            </p>
          </div>
        </div>

        {missing.length > 0 && (
          <div className="notice amber subject-missing">
            <Icon name="warning" />
            <p>
              {missing.length} lớp chưa có giáo viên đang dạy: {missing.map((c) => c.className).join(', ')}.
            </p>
            <button type="button" className="btn btn-secondary push" onClick={showMissing}>
              Xem các lớp
            </button>
          </div>
        )}

        <div className="subject-split">
          <div>
            <p className="label-upper muted">Tiết & hệ số theo loại lớp</p>
            {tracks.length ? (
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>Loại lớp</th>
                    <th className="num">Tiết/tuần</th>
                    <th className="num">Hệ số</th>
                  </tr>
                </thead>
                <tbody>
                  {tracks.map((t) => (
                    <tr key={t.trackId}>
                      <td>{t.trackName}</td>
                      <td className="num">{t.periodsPerWeek}</td>
                      <td className="num">{formatWeight(t.weight)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">Chưa thiết lập cho năm học này.</p>
            )}
          </div>
          <div>
            <p className="label-upper muted">Giáo viên dạy được ({teachers.length})</p>
            {teachers.length ? (
              <ul className="plain-list">
                {(allTeachers ? teachers : teachers.slice(0, TEACHERS_SHOWN)).map((t) => (
                  <li key={t.teacherId}>
                    {t.fullName} <span className="mono muted">{t.teacherCode}</span>
                    {t.status !== 'ACTIVE' && <span className="pill red">Đã khoá</span>}
                  </li>
                ))}
                {teachers.length > TEACHERS_SHOWN && (
                  <li>
                    <button type="button" className="link-button" onClick={() => setAllTeachers((v) => !v)}>
                      {allTeachers ? 'Thu gọn' : `+${teachers.length - TEACHERS_SHOWN} giáo viên khác`}
                    </button>
                  </li>
                )}
              </ul>
            ) : (
              <p className="muted">Chưa có giáo viên nào.</p>
            )}
          </div>
        </div>
      </section>

      <section id="subject-classes" className="card card-outline subject-table">
        <div className="subject-table-head">
          <div>
            <h2 className="title-sm">
              Phân bổ giảng dạy tại các lớp <span className="chip">{classes.length} lớp</span>
            </h2>
            {schoolYear && <p className="caption muted">Năm học {yearLabel(schoolYear.yearName)}</p>}
          </div>
          {(grades.length > 1 || missing.length > 0) && (
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={!grade} onClick={() => setGrade('')}>
                Tất cả ({classes.length})
              </button>
              {grades.length > 1 &&
                grades.map((g) => (
                  <button key={g} type="button" role="tab" aria-selected={grade === g} onClick={() => setGrade(g)}>
                    Lớp {g} ({classes.filter((c) => c.gradeLevel === g).length})
                  </button>
                ))}
              {missing.length > 0 && (
                <button type="button" role="tab" aria-selected={grade === MISSING} onClick={() => setGrade(MISSING)}>
                  Chưa có giáo viên ({missing.length})
                </button>
              )}
            </div>
          )}
        </div>

        {shown.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Lớp</th>
                  <th>Loại lớp</th>
                  <th className="num">Sĩ số</th>
                  <th>Giáo viên giảng dạy</th>
                  <th className="num">Tiết/tuần</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const status = classStatus(c.teacher);
                  return (
                    <tr key={c.classId}>
                      <td className="subject-name">{c.className}</td>
                      <td>{c.trackName}</td>
                      <td className="num">{c.studentCount} HS</td>
                      <td>
                        {c.teacher ? (
                          <>
                            {c.teacher.fullName} <span className="mono muted">{c.teacher.teacherCode}</span>
                          </>
                        ) : (
                          <span className="muted">Chưa phân công</span>
                        )}
                      </td>
                      <td className="num">{c.periodsPerWeek ? `${c.periodsPerWeek} tiết` : '—'}</td>
                      <td>
                        <span className={`pill ${status.pill}`}>{status.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="subject-empty muted">Năm học này chưa có lớp nào học môn này.</p>
        )}
      </section>
    </div>
  );
}
