import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';
import { cohortOf, fitsGrade, formatDob, GENDER_LABELS } from './studentPick.js';

const TABS = [
  { value: 'previous', icon: 'history_edu', label: 'Từ lớp năm trước' },
  { value: 'paste', icon: 'content_paste', label: 'Dán mã học sinh' },
  { value: 'search', icon: 'person_search', label: 'Tìm từng học sinh' },
];

const PASTE_RESULTS = {
  ENROLLED: (item) => `Đang học lớp ${item.student.currentClassName}`,
  NOT_FOUND: () => 'Không có học sinh mã này. Cần tạo tài khoản trước.',
  DUPLICATE: () => 'Mã bị lặp trong danh sách, đã bỏ qua.',
};

// UC-28 student picker: three ways to fill a class from data the school already has – last year's class (grades 11
// and 12), a pasted column of student codes (grade 10 lists), or one by one – into one basket. Only students
// without a class this school year can be picked; `capacity` is how many more the class can take.
// picked / setPicked: the basket ([student]), owned by the caller.
export default function StudentPicker({ schoolYear, grade, gradeLevelId, capacity, picked, setPicked }) {
  const [tab, setTab] = useState(grade === '10' ? 'paste' : 'previous');
  const [note, setNote] = useState('');
  const pickedIds = new Set(picked.map((s) => s.studentId));
  const free = capacity - picked.length;
  const latest = useRef(picked); // the basket as it is now, for additions that land after a request
  latest.current = picked;

  // Adds the free students of a list, as many as the class can still take. Returns a short note for the tab.
  function addMany(list) {
    const now = latest.current;
    const ids = new Set(now.map((s) => s.studentId));
    const fresh = list.filter((s) => !s.currentClassName && !ids.has(s.studentId));
    const taken = fresh.slice(0, Math.max(0, capacity - now.length));
    if (taken.length) {
      latest.current = [...now, ...taken];
      setPicked(latest.current);
    }
    const parts = [taken.length ? `Đã chọn thêm ${taken.length} học sinh.` : 'Không có học sinh mới để chọn.'];
    if (fresh.length > taken.length) parts.push(`${fresh.length - taken.length} học sinh không được chọn vì lớp đã đủ sĩ số.`);
    return parts.join(' ');
  }

  function toggle(s) {
    if (pickedIds.has(s.studentId)) setPicked((cur) => cur.filter((x) => x.studentId !== s.studentId));
    else if (free > 0) setPicked((cur) => [...cur, s]);
  }

  const rowProps = { pickedIds, toggle, full: free <= 0, grade };

  return (
    <div className="pick-layout">
      <div className="pick-main">
        <div className="tabs pick-tabs" role="tablist" aria-label="Cách thêm học sinh">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => {
                setTab(t.value);
                setNote('');
              }}
            >
              <Icon name={t.icon} size="sm" />
              {t.label}
            </button>
          ))}
        </div>
        {note && (
          <p className="pick-note caption" role="status">
            <Icon name="check_circle" size="sm" />
            {note}
          </p>
        )}
        {tab === 'previous' && (
          <PreviousTab schoolYear={schoolYear} grade={grade} onLoaded={(list) => setNote(addMany(list))} {...rowProps} />
        )}
        {tab === 'paste' && <PasteTab schoolYear={schoolYear} onResolved={(list) => setNote(addMany(list))} {...rowProps} />}
        {tab === 'search' && <SearchTab schoolYear={schoolYear} gradeLevelId={gradeLevelId} {...rowProps} />}
      </div>
      <Basket picked={picked} capacity={capacity} onRemove={toggle} onClear={() => setPicked([])} />
    </div>
  );
}

// Last year's classes one grade below; choosing one selects all its students who have no class yet.
function PreviousTab({ schoolYear, grade, onLoaded, ...rowProps }) {
  const [source, setSource] = useState({ loading: true, year: null, classes: [] });
  const [chosen, setChosen] = useState(null); // { class, students } | { error }
  const [loadingClass, setLoadingClass] = useState(null);
  const fromGrade = String(Number(grade) - 1);

  useEffect(() => {
    if (grade === '10') return undefined;
    let alive = true;
    (async () => {
      try {
        const { data: years } = await api.get('/school-years');
        const current = years.find((y) => y.schoolYearId === schoolYear.schoolYearId);
        const prev = years.find((y) => current && y.startDate < current.startDate); // the list is newest first
        if (!prev) return alive && setSource({ loading: false, year: null, classes: [] });
        const { data } = await api.get('/classes', { params: { schoolYearId: prev.schoolYearId } });
        if (alive) setSource({ loading: false, year: prev, classes: data.classes.filter((c) => c.gradeLevel === fromGrade) });
      } catch {
        if (alive) setSource({ loading: false, year: null, classes: [] });
      }
    })();
    return () => {
      alive = false;
    };
  }, [grade, fromGrade, schoolYear.schoolYearId]);

  async function choose(c) {
    setLoadingClass(c.classId);
    try {
      const { data } = await api.get(`/classes/${c.classId}/students`, { params: { forSchoolYearId: schoolYear.schoolYearId } });
      setChosen(data);
      onLoaded(data.students);
    } catch (err) {
      setChosen({ error: errorText(err) });
    } finally {
      setLoadingClass(null);
    }
  }

  if (grade === '10') {
    return (
      <div className="notice">
        <Icon name="info" />
        <p>
          Khối 10 không có lớp năm trước để lên lớp. Hãy dùng “Dán mã học sinh” với danh sách trúng tuyển; học sinh lưu
          ban khối 10 tìm ở “Tìm từng học sinh”.
        </p>
      </div>
    );
  }
  if (source.loading) return <p className="loading">Đang tải lớp năm trước…</p>;
  if (!source.year || !source.classes.length) {
    return (
      <div className="notice">
        <Icon name="info" />
        <p>
          {source.year
            ? `Năm học ${yearLabel(source.year.yearName)} không có lớp khối ${fromGrade}.`
            : 'Chưa có dữ liệu năm học trước.'}{' '}
          Hãy dùng “Dán mã học sinh” hoặc “Tìm từng học sinh”.
        </p>
      </div>
    );
  }

  return (
    <div className="pick-pane">
      <p className="caption muted">
        Chọn lớp khối {fromGrade} của năm học {yearLabel(source.year.yearName)}. Học sinh chưa có lớp năm nay được chọn
        sẵn; bỏ chọn các em lưu ban hoặc chuyển đi.
      </p>
      <div className="pick-sources">
        {source.classes.map((c) => (
          <button
            key={c.classId}
            type="button"
            className={`pick-source${chosen?.class?.classId === c.classId ? ' is-on' : ''}`}
            onClick={() => choose(c)}
            disabled={loadingClass !== null}
            aria-pressed={chosen?.class?.classId === c.classId}
          >
            <strong>{c.className}</strong>
            <span className="caption muted">{loadingClass === c.classId ? 'Đang tải…' : `${c.studentCount} học sinh`}</span>
          </button>
        ))}
      </div>
      {chosen?.error && <p className="form-error">{chosen.error}</p>}
      {chosen?.students && (
        <StudentList
          title={`Lớp ${chosen.class.className} · ${yearLabel(chosen.class.yearName)}`}
          students={chosen.students}
          empty="Lớp này không có học sinh đang học."
          {...rowProps}
        />
      )}
    </div>
  );
}

// A pasted column of student codes (from Excel), checked by the server without saving anything.
function PasteTab({ schoolYear, onResolved, ...rowProps }) {
  const [text, setText] = useState('');
  const [state, setState] = useState({ busy: false, items: null, error: '' });

  async function check() {
    const codes = text.split(/[\s,;]+/).filter(Boolean);
    if (!codes.length) return setState({ busy: false, items: null, error: 'Vui lòng dán ít nhất một mã học sinh.' });
    setState((s) => ({ ...s, busy: true, error: '' }));
    try {
      const { data } = await api.post('/classes/resolve-students', { schoolYearId: schoolYear.schoolYearId, codes });
      setState({ busy: false, items: data.items, error: '' });
      onResolved(data.items.filter((i) => i.result === 'OK').map((i) => i.student));
    } catch (err) {
      setState({ busy: false, items: null, error: errorText(err) });
    }
  }

  const items = state.items ?? [];
  const ok = items.filter((i) => i.result === 'OK');
  const problems = items.filter((i) => i.result !== 'OK');

  return (
    <div className="pick-pane">
      <div className="field">
        <label className="field-label" htmlFor="pick-codes">
          Mã học sinh
        </label>
        <textarea
          id="pick-codes"
          className="input pick-codes"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Dán cột “Mã học sinh” từ Excel, mỗi dòng một mã\nHS260001\nHS260002'}
        />
        <span className="field-help">Có thể ngăn cách bằng xuống dòng, dấu phẩy hoặc khoảng trắng. Tối đa 200 mã mỗi lần.</span>
      </div>
      <div>
        <button type="button" className="btn btn-secondary" onClick={check} disabled={state.busy || !text.trim()}>
          <Icon name="fact_check" size="sm" />
          {state.busy ? 'Đang kiểm tra…' : 'Kiểm tra mã'}
        </button>
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      {state.items && (
        <>
          <p className="pick-summary caption">
            <span className="pill green">{ok.length} hợp lệ</span>
            {problems.length > 0 && <span className="pill amber">{problems.length} cần xem lại</span>}
          </p>
          {problems.length > 0 && (
            <ul className="pick-problems">
              {problems.map((i, n) => (
                <li key={`${i.code}-${n}`}>
                  <span className="mono">{i.code}</span>
                  {i.student && <span>{i.student.fullName}</span>}
                  <span className="class-warn">{PASTE_RESULTS[i.result](i)}</span>
                </li>
              ))}
            </ul>
          )}
          {ok.length > 0 && <StudentList title="Mã hợp lệ" students={ok.map((i) => i.student)} {...rowProps} />}
        </>
      )}
    </div>
  );
}

async function searchStudents(filters, offset) {
  const { data } = await api.get('/classes/eligible-students', { params: { ...filters, offset } });
  return data;
}

// One by one: students without a class this year, by default only those who fit the class's grade.
function SearchTab({ schoolYear, gradeLevelId, ...rowProps }) {
  const [query, setQuery] = useState('');
  const [allGrades, setAllGrades] = useState(false);
  const [found, setFound] = useState({ loading: true, students: [], hasMore: false });

  const filters = { schoolYearId: schoolYear.schoolYearId, q: query.trim(), gradeLevelId, allGrades };

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      setFound((f) => ({ ...f, loading: true }));
      searchStudents({ schoolYearId: schoolYear.schoolYearId, q: query.trim(), gradeLevelId, allGrades }, 0)
        .then((data) => alive && setFound({ loading: false, students: data.students, hasMore: data.hasMore }))
        .catch(() => alive && setFound({ loading: false, students: [], hasMore: false }));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, allGrades, gradeLevelId, schoolYear.schoolYearId]);

  function more() {
    setFound((f) => ({ ...f, loading: true }));
    searchStudents(filters, found.students.length)
      .then((data) => setFound((f) => ({ loading: false, students: [...f.students, ...data.students], hasMore: data.hasMore })))
      .catch(() => setFound((f) => ({ ...f, loading: false })));
  }

  return (
    <div className="pick-pane">
      <div className="pick-search">
        <div className="input-wrap subject-search">
          <Icon name="search" size="sm" className="subject-search-icon" />
          <input
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo họ tên hoặc mã học sinh…"
            aria-label="Tìm học sinh"
          />
        </div>
        <label className="pick-toggle caption">
          <input type="checkbox" checked={allGrades} onChange={(e) => setAllGrades(e.target.checked)} />
          Hiện cả học sinh khối khác
        </label>
      </div>
      <StudentList
        students={found.students}
        loading={found.loading}
        empty={found.loading ? 'Đang tìm…' : 'Không có học sinh chưa có lớp phù hợp.'}
        {...rowProps}
      />
      {found.hasMore && (
        <button type="button" className="btn btn-tertiary pick-more" onClick={more} disabled={found.loading}>
          Xem thêm
        </button>
      )}
    </div>
  );
}

// Checkbox rows with what tells two students apart: code, cohort, date of birth, gender and last class.
function StudentList({ title, students, empty, loading, pickedIds, toggle, full, grade }) {
  if (!students.length) return <p className="muted caption">{empty}</p>;
  return (
    <div className={`class-pick pick-list${loading ? ' is-loading' : ''}`}>
      {title && <p className="label-upper muted">{title}</p>}
      <ul>
        {students.map((s) => {
          const placed = Boolean(s.currentClassName);
          const checked = pickedIds.has(s.studentId);
          const disabled = placed || (full && !checked);
          return (
            <li key={s.studentId}>
              <label className={disabled ? 'is-disabled' : undefined}>
                <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(s)} />
                <StudentInfo student={s} grade={grade} />
                {placed && <span className="pill">Đã ở lớp {s.currentClassName}</span>}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function StudentInfo({ student: s, grade }) {
  const cohort = cohortOf(s.studentCode);
  return (
    <span className="pick-info">
      <span className="pick-name">
        {s.fullName}
        {s.status === 'LOCKED' && <span className="pill red">Đã khoá</span>}
        {grade && !fitsGrade(s, grade) && <span className="pill amber">Khác khối</span>}
      </span>
      <span className="caption muted">
        <span className="mono">{s.studentCode}</span>
        {cohort && ` · Khóa ${cohort}`}
        {s.dob && ` · ${formatDob(s.dob)}`}
        {GENDER_LABELS[s.gender] && ` · ${GENDER_LABELS[s.gender]}`}
        {s.previousClassName ? ` · Lớp cũ ${s.previousClassName}` : ' · Chưa có lớp cũ'}
      </span>
    </span>
  );
}

function Basket({ picked, capacity, onRemove, onClear }) {
  const male = picked.filter((s) => s.gender === 'MALE').length;
  const female = picked.filter((s) => s.gender === 'FEMALE').length;
  const ratio = capacity > 0 ? Math.min(100, (picked.length / capacity) * 100) : 100;
  return (
    <aside className="card card-outline pick-basket" aria-label="Học sinh đã chọn">
      <div className="pick-basket-head">
        <p className="title-sm">Đã chọn</p>
        <p className="pick-count mono">
          {picked.length}
          <span className="muted">/{capacity}</span>
        </p>
      </div>
      <div className={`pick-meter${picked.length >= capacity ? ' is-full' : ''}`} aria-hidden="true">
        <span style={{ width: `${ratio}%` }} />
      </div>
      <p className="caption muted">
        {picked.length >= capacity ? 'Đã đủ sĩ số tối đa.' : `Còn nhận được ${capacity - picked.length} học sinh.`}
        {picked.length > 0 && ` Nam ${male} · Nữ ${female}`}
      </p>
      {picked.length === 0 ? (
        <p className="pick-basket-empty caption muted">Chưa chọn học sinh nào. Có thể tạo lớp trống và thêm học sinh sau.</p>
      ) : (
        <>
          <ul className="pick-basket-list">
            {picked.map((s) => (
              <li key={s.studentId}>
                <span className="pick-basket-name">
                  {s.fullName}
                  <span className="caption muted mono">{s.studentCode}</span>
                </span>
                <button type="button" className="chip-remove" onClick={() => onRemove(s)} aria-label={`Bỏ ${s.fullName}`}>
                  <Icon name="close" size="sm" />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="link-button caption" onClick={onClear}>
            Bỏ chọn tất cả
          </button>
        </>
      )}
    </aside>
  );
}
