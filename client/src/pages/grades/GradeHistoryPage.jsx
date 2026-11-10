import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listGradeBooks, listGradeHistory } from '../../api/grades.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import '../admin/admin.css';
import { fmtScore, formatDateTime } from './gradeFormat.js';
import SemesterSelect from './SemesterSelect.jsx';
import useGradeOptions from './useGradeOptions.js';
import './grades.css';

// UC-87 View Grade Change History (School Manager, part of SCR-68): who changed which score and when, newest first.

export default function GradeHistoryPage() {
  const options = useGradeOptions();
  const [params, setParams] = useSearchParams();
  const semesterId = params.get('semesterId') ?? '';
  const classId = params.get('classId') ?? '';
  const subjectId = params.get('subjectId') ?? '';
  const page = Number(params.get('page')) || 1;
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [books, setBooks] = useState([]);
  const [state, setState] = useState({ loading: false, data: null, error: '' });

  const update = useCallback(
    (changes) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
      if (!('page' in changes)) next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  useEffect(() => {
    if (options.data && !semesterId) update({ semesterId: String(options.data.currentSemesterId ?? '') });
  }, [options.data, semesterId, update]);

  useEffect(() => {
    if (!semesterId) return;
    listGradeBooks({ semesterId })
      .then((d) => setBooks(d.items))
      .catch(() => setBooks([]));
  }, [semesterId]);

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('search') ?? '') !== search.trim()) update({ search: search.trim() });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (!semesterId) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    listGradeHistory({
      semesterId,
      classId: classId || undefined,
      subjectId: subjectId || undefined,
      search: params.get('search') || undefined,
      page,
    })
      .then((data) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [semesterId, classId, subjectId, page, params]);

  const classes = [...new Map(books.map((b) => [String(b.classId), b.className])).entries()];
  const subjects = [...new Map(books.map((b) => [String(b.subjectId), b.subjectName])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1], 'vi'),
  );
  const data = state.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="grade-wide">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<Link to={`/grades/control${semesterId ? `?semesterId=${semesterId}` : ''}`}>Quản lý sổ điểm</Link>/
        <span className="current">Lịch sử sửa điểm</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Lịch sử sửa điểm</h1>
          <p>Mỗi lần nhập, sửa hoặc xoá điểm đều được ghi lại và không thể thay đổi.</p>
        </div>
      </div>

      <div className="grade-toolbar">
        <SemesterSelect semesters={options.semesters} value={semesterId} onChange={(v) => update({ semesterId: v, classId: '', subjectId: '' })} />
        <label className="field" htmlFor="h-class">
          <span className="field-label">Lớp</span>
          <select id="h-class" className="input" value={classId} onChange={(e) => update({ classId: e.target.value })}>
            <option value="">Tất cả lớp</option>
            {classes.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor="h-subject">
          <span className="field-label">Môn</span>
          <select id="h-subject" className="input" value={subjectId} onChange={(e) => update({ subjectId: e.target.value })}>
            <option value="">Tất cả môn</option>
            {subjects.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field grow" htmlFor="h-search">
          <span className="field-label">Học sinh</span>
          <input id="h-search" className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Họ tên hoặc mã học sinh" />
        </label>
      </div>

      {(options.error || state.error) && <p className="form-error">{options.error || state.error}</p>}
      <p className="caption muted" style={{ marginBottom: 8 }}>
        {data && `${data.total} lần thay đổi`}
      </p>

      <section className="card card-outline" style={{ padding: 0 }}>
        <div className="table-scroll" style={{ border: 0 }}>
          <table className={`table${state.loading ? ' is-loading' : ''}`}>
            <thead>
              <tr>
                <th>Thời điểm</th>
                <th>Học sinh</th>
                <th>Lớp – môn</th>
                <th>Cột điểm</th>
                <th>Thay đổi</th>
                <th>Người sửa</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((h) => (
                <tr key={h.id}>
                  <td className="mono caption">{formatDateTime(h.changedAt)}</td>
                  <td>
                    {h.studentName}
                    <div className="caption muted mono">{h.studentCode}</div>
                  </td>
                  <td>
                    {h.className} – {h.subjectName}
                  </td>
                  <td>{h.scoreCount > 1 ? `${h.componentName}${h.attemptNo}` : h.componentName}</td>
                  <td className="mono">
                    {h.oldScore === null ? <span className="muted">(trống)</span> : fmtScore(h.oldScore)} →{' '}
                    {h.newScore === null ? <span className="muted">(xoá)</span> : <strong>{fmtScore(h.newScore)}</strong>}
                  </td>
                  <td>
                    {h.changedBy}
                    <div className="caption muted mono">{h.changedByUsername}</div>
                  </td>
                </tr>
              ))}
              {data && !data.items.length && (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: 'center', height: 72 }}>
                    Không có kết quả tìm kiếm.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {data && pages > 1 && (
        <div className="pager">
          <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
            <Icon name="chevron_left" size="sm" /> Mới hơn
          </button>
          <span className="caption muted">
            Trang {page} / {pages}
          </span>
          <button type="button" className="btn btn-secondary" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>
            Cũ hơn <Icon name="chevron_right" size="sm" />
          </button>
        </div>
      )}
    </div>
  );
}
