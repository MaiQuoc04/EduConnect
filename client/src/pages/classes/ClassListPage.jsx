import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';
import ClassCreateForm from './ClassCreateForm.jsx';
import ClassImportPanel from './ClassImportPanel.jsx';

const GROUP_LABELS = { GENERAL: 'Nhóm chung', STUDENT: 'Nhóm học sinh', PARENT: 'Nhóm phụ huynh' };
const GRADES = ['10', '11', '12'];

// Class names are compared without spaces or case: "10 a1" finds "10A1".
const compact = (text) => String(text ?? '').replace(/\s+/g, '').toLowerCase();

// SCR-22 Group List ("Lớp & nhóm lớp"), School Manager view – UC-27 Import Class List and UC-28 Create Class Group.
// The list itself is interim: UC-29 View Group List completes it. The School Manager sees member counts only,
// never class feeds or chats.
export default function ClassListPage() {
  const [params, setParams] = useSearchParams();
  const yearParam = params.get('schoolYearId') ?? '';
  const [years, setYears] = useState([]);
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [version, setVersion] = useState(0);
  const [mode, setMode] = useState(null); // null | 'import' | 'create'
  const [grade, setGrade] = useState(''); // '' = every grade
  const [query, setQuery] = useState('');

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
      .get('/classes', { params: yearParam ? { schoolYearId: yearParam } : {} })
      .then(({ data }) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [yearParam, version]);

  const schoolYear = state.data?.schoolYear ?? null;
  const classes = useMemo(() => state.data?.classes ?? [], [state.data]);
  // The grade filter and the search run here: a school has only a few dozen classes per year.
  const gradeCounts = useMemo(
    () => Object.fromEntries(GRADES.map((g) => [g, classes.filter((c) => c.gradeLevel === g).length])),
    [classes],
  );
  const shown = useMemo(() => {
    const q = compact(query);
    return classes.filter((c) => (!grade || c.gradeLevel === grade) && (!q || compact(c.className).includes(q)));
  }, [classes, grade, query]);
  const canChange = Boolean(schoolYear) && !schoolYear.ended;
  const selectedYear = yearParam || (schoolYear ? String(schoolYear.schoolYearId) : '');

  function handleDone() {
    setMode(null);
    setVersion((v) => v + 1);
  }

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Đào tạo</span>/<span className="current">Lớp & nhóm lớp</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Lớp & nhóm lớp</h1>
          <p>Mỗi lớp có ba nhóm: nhóm chung, nhóm học sinh và nhóm phụ huynh.</p>
        </div>
        <div className="class-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setMode('create')} disabled={!canChange || Boolean(mode)}>
            <Icon name="group_add" size="sm" />
            Tạo nhóm lớp
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setMode('import')} disabled={!canChange || Boolean(mode)}>
            <Icon name="upload_file" size="sm" />
            Nhập danh sách lớp
          </button>
        </div>
      </div>

      <div className="card card-outline class-toolbar">
        <label className="field-label" htmlFor="class-year">
          Năm học
        </label>
        <select
          id="class-year"
          className="input year-select"
          value={selectedYear}
          onChange={(e) => setParams(e.target.value ? { schoolYearId: e.target.value } : {})}
          disabled={!years.length || Boolean(mode)}
        >
          {!years.length && <option value="">{schoolYear ? yearLabel(schoolYear.yearName) : '—'}</option>}
          {years.map((y) => (
            <option key={y.schoolYearId} value={y.schoolYearId}>
              {yearLabel(y.yearName)}
            </option>
          ))}
        </select>
        {schoolYear?.ended && <span className="muted">Năm học đã kết thúc nên chỉ xem.</span>}
        <div className="tabs class-grade-tabs" role="tablist" aria-label="Lọc theo khối">
          <button type="button" role="tab" aria-selected={grade === ''} onClick={() => setGrade('')}>
            Tất cả ({classes.length})
          </button>
          {GRADES.map((g) => (
            <button key={g} type="button" role="tab" aria-selected={grade === g} onClick={() => setGrade(g)}>
              Lớp {g} ({gradeCounts[g]})
            </button>
          ))}
        </div>
        <div className="input-wrap subject-search class-search">
          <Icon name="search" size="sm" className="subject-search-icon" />
          <input
            className="input"
            type="search"
            placeholder="Tìm theo tên lớp…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm theo tên lớp"
          />
        </div>
      </div>

      {mode === 'import' && schoolYear && (
        <ClassImportPanel schoolYear={schoolYear} onCancel={() => setMode(null)} onDone={handleDone} />
      )}
      {mode === 'create' && schoolYear && (
        <ClassCreateForm schoolYear={schoolYear} onCancel={() => setMode(null)} onDone={handleDone} />
      )}

      {state.error ? (
        <p className="form-error">{state.error}</p>
      ) : state.loading && !state.data ? (
        <p className="loading">Đang tải lớp…</p>
      ) : !schoolYear ? (
        <div className="notice">
          <Icon name="info" />
          <p>Chưa có năm học nào. Hãy tạo năm học trước khi nhập danh sách lớp.</p>
        </div>
      ) : (
        <div className={`card card-outline class-table${state.loading ? ' is-loading' : ''}`}>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Lớp</th>
                  <th>Loại lớp</th>
                  <th>Giáo viên chủ nhiệm</th>
                  <th className="num">Sĩ số</th>
                  <th>Nhóm trực thuộc</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.classId}>
                    <td className="subject-name">
                      {c.className} <span className="muted caption">· Khối {c.gradeLevel}</span>
                    </td>
                    <td>{c.trackName}</td>
                    <td>
                      {c.homeroomName ? (
                        <>
                          {c.homeroomName}
                          {c.homeroomStatus === 'LOCKED' && <span className="pill"> Đã khoá</span>}
                        </>
                      ) : (
                        <span className="class-warn">Chưa có giáo viên chủ nhiệm</span>
                      )}
                    </td>
                    <td className="num">{c.studentCount} học sinh</td>
                    <td>
                      <span className="chips">
                        {c.groups.map((g) => (
                          <span key={g.groupId} className="chip" title={g.groupName}>
                            {GROUP_LABELS[g.groupType]} · {g.memberCount}
                          </span>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length === 0 && (
            <p className="subject-empty muted">
              {classes.length
                ? 'Không tìm thấy lớp phù hợp.'
                : `Năm học ${yearLabel(schoolYear.yearName)} chưa có lớp nào. Chọn “Nhập danh sách lớp” để bắt đầu.`}
            </p>
          )}
          <p className="subject-foot caption muted">
            Hiển thị {shown.length} / {classes.length} lớp · Năm học {yearLabel(schoolYear.yearName)}
          </p>
        </div>
      )}
    </>
  );
}
