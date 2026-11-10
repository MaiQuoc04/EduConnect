import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getTimetableClasses } from '../../api/timetables.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { foldVietnamese } from '../../utils/teacherValidation.js';
import { dm, dmy } from './WeekTimetable.jsx';
import './timetable.css';

// SCR-27 Timetable Management – UC-70 (FE-10, School Manager): every class of a school year with the timetable
// running today (or the next one), its periods per week against the class type's plan, and the actions.
// "Nhập TKB từ file" opens the UC-72 dialog; "Tạo TKB lớp" picks a class and opens the editor (UC-71).

const PAGE_SIZE = 15;
const STATUS = { running: 'Đang áp dụng', upcoming: 'Sắp áp dụng', missing: 'Chưa có TKB' };
const statusOf = (c) => (!c.timetable ? 'missing' : c.timetable.running ? 'running' : 'upcoming');
const stamp = (at) => (at ? `${dmy(at.slice(0, 10))} ${at.slice(11, 16)}` : '');

function CreateDialog({ classes, onClose }) {
  const navigate = useNavigate();
  const sorted = [...classes].sort((a, b) => Number(!!a.timetable) - Number(!!b.timetable));
  const [classId, setClassId] = useState(String(sorted[0]?.classId ?? ''));
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="tt-overlay" onClick={onClose}>
      <form className="tt-dialog tt-dialog-sm" role="dialog" aria-modal="true" aria-labelledby="tt-create-title" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (classId) navigate(`/timetables/classes/${classId}/edit`); }}>
        <header className="tt-dialog-head">
          <div>
            <span className="label-upper tt-ink">Tạo thời khoá biểu</span>
            <h2 id="tt-create-title" className="tt-dialog-title">Chọn lớp</h2>
          </div>
          <button type="button" className="tt-navbtn is-plain" onClick={onClose} aria-label="Đóng"><Icon name="close" size="sm" /></button>
        </header>
        <div className="tt-dialog-body">
          <div className="field">
            <label className="field-label" htmlFor="tt-create-class">Lớp</label>
            <select id="tt-create-class" className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {sorted.map((c) => (
                <option key={c.classId} value={c.classId}>{c.className} · {c.trackName}{c.timetable ? ' (đã có TKB)' : ''}</option>
              ))}
            </select>
          </div>
          <p className="caption tt-muted">Lớp đã có thời khoá biểu sẽ mở để sửa; các lớp chưa có được xếp lên đầu danh sách.</p>
        </div>
        <footer className="tt-dialog-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Huỷ</button>
          <button type="submit" className="btn btn-primary" disabled={!classId}>Tiếp tục <Icon name="arrow_forward" size="sm" /></button>
        </footer>
      </form>
    </div>
  );
}

export default function TimetableManagementPage() {
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [yearId, setYearId] = useState('');
  const [grade, setGrade] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (id) => {
    setLoading(true);
    setError('');
    try {
      const d = await getTimetableClasses(id || undefined);
      setData(d);
      setYearId(d.schoolYear ? String(d.schoolYear.id) : '');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(params.get('schoolYearId') || undefined); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = data?.classes ?? [];
  // An ended school year is read only (the server refuses saves and imports too).
  const yearEnded = !!data?.schoolYear && data.today > data.schoolYear.endDate;
  const grades = useMemo(() => [...new Set(all.map((c) => c.gradeName))], [all]);
  const counts = useMemo(() => {
    const n = { running: 0, upcoming: 0, missing: 0 };
    for (const c of all) n[statusOf(c)] += 1;
    return n;
  }, [all]);
  const classes = useMemo(() => {
    const q = foldVietnamese(search.trim());
    return all.filter((c) => (!grade || c.gradeName === grade) && (!status || statusOf(c) === status)
      && (!q || foldVietnamese(c.className).includes(q)));
  }, [all, grade, status, search]);
  useEffect(() => setPage(0), [grade, status, search, yearId]);
  const pages = Math.max(1, Math.ceil(classes.length / PAGE_SIZE));
  const shown = classes.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="tt-page">
      <nav className="tt-crumb" aria-label="Breadcrumb">
        <span>EduConnect</span><span className="tt-crumb-sep">/</span><span>Đào tạo</span><span className="tt-crumb-sep">/</span><strong className="tt-ink">Thời khoá biểu</strong>
      </nav>
      <div className="tt-head">
        <div>
          <h1 className="headline-xl">Thời khoá biểu</h1>
          <p>Quản lý thời khoá biểu từng lớp theo năm học. Giáo viên từng tiết lấy theo phân công giảng dạy của ngày học.</p>
        </div>
        <div className="tt-head-actions">
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)} disabled={!all.length || yearEnded}
            title={yearEnded ? 'Năm học đã kết thúc' : !all.length ? 'Năm học này chưa có lớp' : undefined}>
            <Icon name="add" size="sm" /> Tạo TKB lớp
          </button>
        </div>
      </div>

      <div className="tt-strip">
        <label className="tt-strip-field">
          <span>Năm học:</span>
          <span className="tt-select is-inline">
            <select value={yearId} onChange={(e) => load(e.target.value)} disabled={!data}>
              {(data?.schoolYears ?? []).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
            <Icon name="unfold_more" size="sm" />
          </span>
        </label>
        <div className="tt-metrics" role="group" aria-label="Lọc theo tình trạng">
          {Object.keys(STATUS).map((k, i) => (
            <span key={k} className="tt-metric-wrap">
              {i > 0 && <span className="tt-muted">·</span>}
              <button type="button" className={`tt-metric${status === k ? ' is-on' : ''}`} aria-pressed={status === k} onClick={() => setStatus(status === k ? '' : k)}>
                <i className={`tt-dot-${k}`} />{STATUS[k]}: <strong>{k === 'running' ? `${counts[k]}/${all.length} lớp` : `${counts[k]} lớp`}</strong>
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="tt-filterbar">
        <div className="tt-seg" role="tablist" aria-label="Khối">
          <button type="button" role="tab" aria-selected={!grade} onClick={() => setGrade('')}>Tất cả ({all.length})</button>
          {grades.map((g) => (
            <button key={g} type="button" role="tab" aria-selected={grade === g} onClick={() => setGrade(g)}>
              Khối {g} ({all.filter((c) => c.gradeName === g).length})
            </button>
          ))}
        </div>
        <label className="tt-search">
          <Icon name="search" size="sm" />
          <input type="search" placeholder="Tìm kiếm lớp…" value={search} maxLength={20} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm lớp" />
        </label>
      </div>

      {yearEnded && <div className="notice"><Icon name="lock" /><p>Năm học {data.schoolYear.name} đã kết thúc nên chỉ xem được thời khoá biểu.</p></div>}
      {error && <div className="notice amber"><Icon name="error_outline" /><div><p>{error}</p><button type="button" className="btn btn-secondary" onClick={() => load(yearId)}>Thử lại</button></div></div>}

      <div className="tt-ledger" aria-busy={loading}>
        <table>
          <thead>
            <tr>
              <th scope="col">Lớp</th>
              <th scope="col">Trạng thái</th>
              <th scope="col" className="is-right">Số tiết/tuần</th>
              <th scope="col" className="is-right">Cập nhật lần cuối</th>
              <th scope="col" className="is-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {data && shown.length === 0 && (
              <tr><td colSpan={5} className="tt-muted">{all.length ? 'Không có lớp nào khớp bộ lọc.' : 'Năm học này chưa có lớp nào.'}</td></tr>
            )}
            {shown.map((c) => {
              const t = c.timetable;
              const st = statusOf(c);
              const off = t && t.periodsPerWeek !== c.plannedPeriods;
              return (
                <tr key={c.classId}>
                  <td>
                    <span className="tt-ledger-class">
                      <i className={`tt-dot-${st}`} />{c.className}
                      <span className="caption tt-muted">{c.trackName}</span>
                    </span>
                  </td>
                  <td>
                    {st === 'running' && <span className="stamp">Đang áp dụng · từ {dm(t.startDate)}</span>}
                    {st === 'upcoming' && <span className="tt-badge-amber"><i />Áp dụng từ {dm(t.startDate)}</span>}
                    {st === 'missing' && <span className="tt-badge-red"><i />Chưa có thời khoá biểu</span>}
                  </td>
                  <td className="is-right tt-num">
                    {t ? <span className={off ? 'tt-off' : ''} title={off ? 'Khác số tiết của loại lớp' : undefined}>{t.periodsPerWeek}/{c.plannedPeriods} tiết</span>
                      : <span className="tt-muted">–/{c.plannedPeriods} tiết</span>}
                  </td>
                  <td className="is-right tt-num caption tt-muted" title={t?.updatedBy ? `Người lưu: ${t.updatedBy}` : undefined}>{t ? stamp(t.updatedAt) : '—'}</td>
                  <td className="is-right">
                    <span className="tt-ledger-actions">
                      {t && <><Link className="tt-act" to={`/timetable?classId=${c.classId}${t.running ? '' : `&date=${t.startDate}`}`}>Xem</Link>{!yearEnded && <span className="tt-muted">|</span>}</>}
                      {!yearEnded && <Link className={`tt-act${t ? ' is-quiet' : ''}`} to={`/timetables/classes/${c.classId}/edit`}>{t ? 'Sửa' : 'Tạo'}</Link>}
                      {yearEnded && !t && <span className="tt-muted caption">—</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="tt-ledger-foot caption">
          <span>{classes.length ? `Hiển thị ${page * PAGE_SIZE + 1} - ${page * PAGE_SIZE + shown.length} trên tổng số ${classes.length} lớp` : ''}</span>
          <span className="tt-pager">
            <button type="button" className="tt-navbtn" onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Trang trước"><Icon name="chevron_left" size="sm" /></button>
            <strong>{page + 1}</strong>
            <button type="button" className="tt-navbtn" onClick={() => setPage(page + 1)} disabled={page >= pages - 1} aria-label="Trang sau"><Icon name="chevron_right" size="sm" /></button>
          </span>
        </div>
      </div>

      {creating && <CreateDialog classes={all} onClose={() => setCreating(false)} />}
    </div>
  );
}
