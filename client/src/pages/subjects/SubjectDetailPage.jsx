import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';
import { formatWeight } from './subjectText.js';

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
  const [grade, setGrade] = useState('');

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
  const shown = grade ? classes.filter((c) => c.gradeLevel === grade) : classes;

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
        </div>
      </div>

      <section className="card card-outline subject-overview">
        <h2 className="card-title title-sm">
          <Icon name="library_books" />
          Thông tin tổng quan
        </h2>
        <div className="subject-facts">
          <div>
            <p className="label-upper muted">Loại lớp áp dụng</p>
            {tracks.length ? (
              <ul className="plain-list">
                {tracks.map((t) => (
                  <li key={t.trackId}>
                    <span className="chip">{t.trackName}</span> {t.periodsPerWeek} tiết/tuần · hệ số{' '}
                    {formatWeight(t.weight)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Chưa thiết lập cho năm học này</p>
            )}
          </div>
          <div>
            <p className="label-upper muted">Phân công</p>
            <p className="subject-figure">
              {summary.assignedCount}/{summary.classCount} <span>lớp có giáo viên</span>
            </p>
          </div>
          <div>
            <p className="label-upper muted">Tổng số tiết/tuần</p>
            <p className="subject-figure">
              {summary.totalPeriodsPerWeek} <span>tiết toàn trường</span>
            </p>
          </div>
          <div>
            <p className="label-upper muted">Giáo viên dạy được</p>
            {teachers.length ? (
              <ul className="plain-list">
                {teachers.map((t) => (
                  <li key={t.teacherId}>
                    {t.fullName} <span className="mono muted">{t.teacherCode}</span>
                    {t.status !== 'ACTIVE' && <span className="pill red">Đã khoá</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Chưa có giáo viên nào</p>
            )}
          </div>
        </div>
      </section>

      <section className="card card-outline subject-table">
        <div className="subject-table-head">
          <div>
            <h2 className="title-sm">
              Phân bổ giảng dạy tại các lớp <span className="chip">{classes.length} lớp</span>
            </h2>
            {schoolYear && <p className="caption muted">Năm học {yearLabel(schoolYear.yearName)}</p>}
          </div>
          {grades.length > 1 && (
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={!grade} onClick={() => setGrade('')}>
                Tất cả ({classes.length})
              </button>
              {grades.map((g) => (
                <button key={g} type="button" role="tab" aria-selected={grade === g} onClick={() => setGrade(g)}>
                  Khối {g} ({classes.filter((c) => c.gradeLevel === g).length})
                </button>
              ))}
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
