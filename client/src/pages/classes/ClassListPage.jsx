import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';
import ClassCard from './ClassCard.jsx';
import ClassCreateForm from './ClassCreateForm.jsx';
import ClassImportPanel from './ClassImportPanel.jsx';
import ClassTable from './ClassTable.jsx';

const GRADES = ['10', '11', '12'];

// Search ignores spaces and case: "10 a1" finds "10A1", "thu hà" finds "Phạm Thu Hà".
const compact = (text) => String(text ?? '').replace(/\s+/g, '').toLowerCase();

// SCR-22 Group List ("Lớp & nhóm lớp"), School Manager view – UC-29 View Group List (every class group of a year
// and the school-wide teacher group), UC-27 Import Class List and UC-28 Create Class Group. The School Manager opens
// a group's information and members only, never class feeds or chats.
// Classes are shown as cards grouped by grade (default) or as one table (?view=table) for a quick scan.
export default function ClassListPage() {
  const [params, setParams] = useSearchParams();
  const yearParam = params.get('schoolYearId') ?? '';
  const view = params.get('view') === 'table' ? 'table' : 'cards';
  const [years, setYears] = useState([]);
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [version, setVersion] = useState(0);
  const [mode, setMode] = useState(null); // null | 'import' | 'create'
  const [grade, setGrade] = useState(''); // '' = every grade
  const [query, setQuery] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false); // classes without a homeroom teacher
  const [teacherGroup, setTeacherGroup] = useState(null);

  useEffect(() => {
    api
      .get('/school-years')
      .then(({ data }) => setYears(data))
      .catch(() => setYears([]));
    api
      .get('/groups')
      .then(({ data }) => setTeacherGroup(data.teacherGroup))
      .catch(() => setTeacherGroup(null));
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
  // Filters and search run here: a school has only a few dozen classes per year.
  const gradeCounts = useMemo(
    () => Object.fromEntries(GRADES.map((g) => [g, classes.filter((c) => c.gradeLevel === g).length])),
    [classes],
  );
  const missingCount = useMemo(() => classes.filter((c) => !c.homeroomName).length, [classes]);
  const shown = useMemo(() => {
    const q = compact(query);
    return classes.filter(
      (c) =>
        (!grade || c.gradeLevel === grade) &&
        (!onlyMissing || !c.homeroomName) &&
        (!q || compact(c.className).includes(q) || compact(c.homeroomName).includes(q)),
    );
  }, [classes, grade, onlyMissing, query]);
  const sections = useMemo(
    () =>
      GRADES.map((g) => {
        const items = shown.filter((c) => c.gradeLevel === g);
        return { grade: g, items, students: items.reduce((sum, c) => sum + c.studentCount, 0) };
      }).filter((s) => s.items.length),
    [shown],
  );
  const canChange = Boolean(schoolYear) && !schoolYear.ended;
  const selectedYear = yearParam || (schoolYear ? String(schoolYear.schoolYearId) : '');
  const filtered = Boolean(grade || onlyMissing || query.trim());

  // Year and view live in the URL so a refresh or a shared link keeps them.
  function updateParam(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  function clearFilters() {
    setGrade('');
    setOnlyMissing(false);
    setQuery('');
  }

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

      {teacherGroup && !mode && (
        <section className="card card-outline class-school-group" aria-label="Nhóm toàn trường">
          <span className="class-school-icon" aria-hidden="true">
            <Icon name="co_present" />
          </span>
          <div className="class-school-text">
            <p className="label-upper">Toàn trường</p>
            <h2 className="title-sm">{teacherGroup.groupName}</h2>
            <p className="caption muted">
              {teacherGroup.memberCount !== undefined && `${teacherGroup.memberCount} thành viên · `}
              Toàn bộ giáo viên và quản lý trường
            </p>
          </div>
          <Link to={`/groups/${teacherGroup.groupId}`} className="btn btn-secondary">
            Mở nhóm
            <Icon name="arrow_forward" size="sm" />
          </Link>
        </section>
      )}

      {mode === 'import' && schoolYear && (
        <ClassImportPanel schoolYear={schoolYear} onCancel={() => setMode(null)} onDone={handleDone} />
      )}
      {mode === 'create' && schoolYear && (
        <ClassCreateForm schoolYear={schoolYear} onCancel={() => setMode(null)} onDone={handleDone} />
      )}

      <div className="card card-outline class-toolbar">
        <select
          id="class-year"
          className="input year-select"
          aria-label="Năm học"
          value={selectedYear}
          onChange={(e) => updateParam('schoolYearId', e.target.value)}
          disabled={!years.length || Boolean(mode)}
        >
          {!years.length && <option value="">{schoolYear ? `Năm học ${yearLabel(schoolYear.yearName)}` : '—'}</option>}
          {years.map((y) => (
            <option key={y.schoolYearId} value={y.schoolYearId}>
              Năm học {yearLabel(y.yearName)}
            </option>
          ))}
        </select>
        <div className="tabs" role="tablist" aria-label="Lọc theo khối">
          <button type="button" role="tab" aria-selected={grade === ''} onClick={() => setGrade('')}>
            Tất cả <span className="tab-count">{classes.length}</span>
          </button>
          {GRADES.map((g) => (
            <button key={g} type="button" role="tab" aria-selected={grade === g} onClick={() => setGrade(g)}>
              Khối {g} <span className="tab-count">{gradeCounts[g]}</span>
            </button>
          ))}
        </div>
        {missingCount > 0 && (
          <button
            type="button"
            className={`class-filter-chip${onlyMissing ? ' is-on' : ''}`}
            aria-pressed={onlyMissing}
            onClick={() => setOnlyMissing((v) => !v)}
          >
            <Icon name="warning" size="sm" />
            Thiếu GVCN ({missingCount})
          </button>
        )}
        <div className="input-wrap subject-search class-search">
          <Icon name="search" size="sm" className="subject-search-icon" />
          <input
            className="input"
            type="search"
            placeholder="Tìm lớp hoặc GVCN…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm lớp hoặc giáo viên chủ nhiệm"
          />
        </div>
        <div className="tabs class-view-tabs" role="tablist" aria-label="Kiểu hiển thị">
          <button type="button" role="tab" aria-selected={view === 'cards'} onClick={() => updateParam('view', '')} title="Dạng thẻ">
            <Icon name="grid_view" size="sm" />
          </button>
          <button type="button" role="tab" aria-selected={view === 'table'} onClick={() => updateParam('view', 'table')} title="Dạng bảng">
            <Icon name="table_rows" size="sm" />
          </button>
        </div>
      </div>

      {schoolYear?.ended && (
        <div className="notice class-ended">
          <Icon name="lock" />
          <p>Năm học {yearLabel(schoolYear.yearName)} đã kết thúc nên chỉ xem, không nhập hay tạo lớp mới.</p>
        </div>
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
      ) : shown.length === 0 ? (
        <div className="card card-outline class-empty">
          <Icon name={classes.length ? 'search_off' : 'school'} />
          <p>
            {classes.length
              ? 'Không tìm thấy lớp phù hợp.'
              : `Năm học ${yearLabel(schoolYear.yearName)} chưa có lớp nào. Chọn “Nhập danh sách lớp” để bắt đầu.`}
          </p>
          {filtered && (
            <button type="button" className="btn btn-tertiary" onClick={clearFilters}>
              Xoá bộ lọc
            </button>
          )}
        </div>
      ) : (
        <>
          {view === 'table' ? (
            <ClassTable classes={shown} loading={state.loading} />
          ) : (
            <div className={state.loading ? 'is-loading' : undefined}>
              {sections.map((s) => (
                <section key={s.grade} className="class-section" aria-labelledby={`grade-${s.grade}`}>
                  <header className="class-section-head">
                    <h2 id={`grade-${s.grade}`} className="title-sm">
                      Khối {s.grade}
                    </h2>
                    <span className="caption muted">
                      {s.items.length} lớp · {s.students} học sinh
                    </span>
                  </header>
                  <div className="class-grid">
                    {s.items.map((c) => (
                      <ClassCard key={c.classId} cls={c} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          <p className="class-foot caption muted">
            Hiển thị {shown.length} / {classes.length} lớp · Năm học {yearLabel(schoolYear.yearName)}
            {filtered && (
              <>
                {' · '}
                <button type="button" className="link-button" onClick={clearFilters}>
                  Xoá bộ lọc
                </button>
              </>
            )}
          </p>
        </>
      )}
    </>
  );
}
