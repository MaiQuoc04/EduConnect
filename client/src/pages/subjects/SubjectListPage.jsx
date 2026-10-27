import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';
import { fold, periodsText } from './subjectText.js';

// SCR-19 Subject List – UC-22 View Subject List (School Manager). Figures (class types, periods, classes) are for
// the chosen school year; search and filters run here because a school has only ~15 subjects, so no paging.
export default function SubjectListPage() {
  const navigate = useNavigate();
  const [years, setYears] = useState([]);
  const [params] = useSearchParams();
  const [yearId, setYearId] = useState(() => params.get('schoolYearId') ?? ''); // back from the detail page
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [query, setQuery] = useState('');
  const [trackId, setTrackId] = useState('');
  const [onlyUnset, setOnlyUnset] = useState(false); // subjects with no class type in the chosen year

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
      .get('/subjects', { params: yearId ? { schoolYearId: yearId } : {} })
      .then(({ data }) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [yearId]);

  const subjects = useMemo(() => state.data?.subjects ?? [], [state.data]);
  const tracks = useMemo(() => {
    const byId = new Map();
    subjects.forEach((s) => s.tracks.forEach((t) => byId.set(t.trackId, t.trackName)));
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [subjects]);
  const unsetCount = useMemo(() => subjects.filter((s) => !s.tracks.length).length, [subjects]);

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return subjects.filter(
      (s) =>
        (!q || fold(s.subjectCode).includes(q) || fold(s.subjectName).includes(q)) &&
        (!trackId || s.tracks.some((t) => String(t.trackId) === trackId)) &&
        (!onlyUnset || !s.tracks.length),
    );
  }, [subjects, query, trackId, onlyUnset]);

  const schoolYear = state.data?.schoolYear;
  // UC-23: the detail page opens on the same school year.
  const detailHref = (id) => `/subjects/${id}${yearId ? `?schoolYearId=${yearId}` : ''}`;
  const selectedYear = yearId || (schoolYear ? String(schoolYear.schoolYearId) : '');
  const filtered = Boolean(query.trim() || trackId || onlyUnset);

  function clearFilters() {
    setQuery('');
    setTrackId('');
    setOnlyUnset(false);
  }

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Đào tạo</span>/<span className="current">Môn học</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Danh mục môn học</h1>
          <p>
            {subjects.length ? `${subjects.length} môn học của trường.` : 'Các môn học của trường.'} Số tiết và số lớp
            tính theo năm học đang chọn.
          </p>
        </div>
        <Link to="/subjects/new" className="btn btn-primary">
          <Icon name="add" size="sm" />
          Thêm môn học
        </Link>
      </div>

      <div className="card card-outline subject-toolbar">
        <div className="input-wrap subject-search">
          <Icon name="search" size="sm" className="subject-search-icon" />
          <input
            className="input"
            type="search"
            placeholder="Tìm theo tên hoặc mã môn…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm môn học"
          />
        </div>
        <select className="input" value={trackId} onChange={(e) => setTrackId(e.target.value)} aria-label="Loại lớp">
          <option value="">Tất cả loại lớp</option>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={selectedYear}
          onChange={(e) => {
            setYearId(e.target.value);
            setTrackId('');
            setOnlyUnset(false);
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
        {unsetCount > 0 && (
          <button
            type="button"
            className={`class-filter-chip subject-unset-chip${onlyUnset ? ' is-on' : ''}`}
            aria-pressed={onlyUnset}
            onClick={() => setOnlyUnset((v) => !v)}
          >
            <Icon name="warning" size="sm" />
            Chưa thiết lập ({unsetCount})
          </button>
        )}
      </div>

      {state.error ? (
        <p className="form-error">{state.error}</p>
      ) : state.loading && !state.data ? (
        <p className="loading">Đang tải môn học…</p>
      ) : (
        <div className={`card card-outline subject-table${state.loading ? ' is-loading' : ''}`}>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Môn học</th>
                  <th>Loại lớp áp dụng</th>
                  <th className="num">Tiết/tuần</th>
                  <th className="num">Lớp đang dạy</th>
                  <th className="num">Giáo viên dạy được</th>
                  <th className="subject-arrow-col" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.subjectId} className="row-link" onClick={() => navigate(detailHref(s.subjectId))}>
                    <td>
                      <Link
                        to={detailHref(s.subjectId)}
                        className="subject-cell"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="subject-name">{s.subjectName}</span>
                        <span className="mono caption subject-code">{s.subjectCode}</span>
                      </Link>
                    </td>
                    <td>
                      {s.tracks.length ? (
                        <span className="chips">
                          {s.tracks.map((t) => (
                            <span key={t.trackId} className="chip subject-track">
                              {t.trackName}
                              <span className="subject-track-periods">{t.periodsPerWeek} tiết</span>
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="class-warn">Chưa thiết lập cho năm học này</span>
                      )}
                    </td>
                    <td className="num">{periodsText(s)}</td>
                    <td className="num">
                      {s.classCount ? `${s.classCount} lớp` : <span className="muted">Chưa phân công</span>}
                    </td>
                    <td className="num">
                      {s.teacherCount ? `${s.teacherCount} giáo viên` : <span className="class-warn">Chưa có</span>}
                    </td>
                    <td className="subject-arrow-col">
                      <Icon name="chevron_right" size="sm" className="subject-arrow" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length === 0 && (
            <div className="subject-empty muted">
              <p>{subjects.length ? 'Không tìm thấy môn học phù hợp.' : 'Trường chưa có môn học nào.'}</p>
              {filtered && (
                <button type="button" className="btn btn-tertiary" onClick={clearFilters}>
                  Xoá bộ lọc
                </button>
              )}
            </div>
          )}
          <p className="subject-foot caption muted">
            Hiển thị {shown.length} / {subjects.length} môn học
            {schoolYear && ` · Năm học ${yearLabel(schoolYear.yearName)}`}
            {filtered && shown.length > 0 && (
              <>
                {' · '}
                <button type="button" className="link-button" onClick={clearFilters}>
                  Xoá bộ lọc
                </button>
              </>
            )}
          </p>
        </div>
      )}

      <div className="notice subject-note">
        <Icon name="info" />
        <p>
          Số tiết/tuần và hệ số của môn được thiết lập theo loại lớp cho từng năm học, tại màn{' '}
          <Link to="/class-tracks">Loại lớp & hệ số</Link>.
        </p>
      </div>
    </>
  );
}
