import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { exportRegistrations, getRegistrations } from '../../api/extracurricular.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { at, countText, daysLeft, REG_STATUS, stateOf, whenText } from './activityUtils.js';
import './extracurricular.css';

// SCR-67 Registration List – UC-56 View Registration List, UC-57 Export Registration List (homeroom teacher).
// Every student of the class with their state (registered / cancelled / not registered), plus students who left the
// class after registering. Search: student name, student code, parent name (accent-insensitive, server side).

const TABS = [
  ['REGISTERED', 'Đã đăng ký'],
  ['NONE', 'Chưa đăng ký'],
  ['CANCELLED', 'Đã huỷ đăng ký'],
  ['all', 'Tất cả'],
];
const PAGE = 10;
const initials = (name) => name.trim().split(/\s+/).slice(-1)[0].slice(0, 2).toUpperCase();

export default function RegistrationListPage() {
  const { eventId } = useParams();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = TABS.some(([k]) => k === params.get('status')) ? params.get('status') : 'REGISTERED';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await getRegistrations(eventId, { status, search: query || undefined }));
      setPage(1);
    } catch (err) {
      setError(errorText(err));
    }
  }, [eventId, status, query]);
  useEffect(() => { load(); }, [load]);

  const setStatus = (s) => {
    const next = new URLSearchParams(params);
    if (s === 'REGISTERED') next.delete('status'); else next.set('status', s);
    setParams(next, { replace: true });
  };

  async function doExport() {
    setExporting(true);
    try {
      await exportRegistrations(eventId, { status, search: query || undefined });
    } catch (err) {
      toast(errorText(err), { type: 'error' });
    } finally {
      setExporting(false);
    }
  }

  if (error && !data) {
    return <div className="xa-page"><div className="notice amber"><Icon name="error_outline" /><div><p>{error}</p><Link to={`/extracurricular/${eventId}`} className="btn btn-secondary">Về chi tiết hoạt động</Link></div></div></div>;
  }
  if (!data) return <div className="xa-page" aria-busy="true"><p className="muted">Đang tải…</p></div>;

  const a = data.activity;
  const st = stateOf(a);
  const left = st.key === 'open' ? daysLeft(a.registrationDeadline) : 0;
  const ratio = a.classSize ? Math.round((a.registeredCount / a.classSize) * 1000) / 10 : 0;
  const pages = Math.max(1, Math.ceil(data.rows.length / PAGE));
  const shown = data.rows.slice((page - 1) * PAGE, page * PAGE);
  const gone = data.rows.filter((r) => !r.inClass && r.status === 'REGISTERED').length;

  return (
    <div className="xa-page">
      <nav className="xa-crumb" aria-label="Breadcrumb">
        <Link to={`/extracurricular?classId=${a.classId}`}>Ngoại khoá {a.className}</Link><span>/</span>
        <Link to={`/extracurricular/${a.eventId}`}>Chi tiết</Link><span>/</span><strong>Danh sách đăng ký</strong>
      </nav>
      <Link to={`/extracurricular/${a.eventId}`} className="xa-back"><Icon name="arrow_back" size="sm" /> Chi tiết hoạt động</Link>

      <header className="xa-hero">
        <div className="xa-hero-chips">
          <span className="label-upper xa-kicker"><Icon name="verified" size="sm" /> Sổ ngoại khoá · {a.className}</span>
          <span className={`xa-chip tone-${st.tone}`}>{st.label}{left > 0 && ` · còn ${left} ngày`}</span>
        </div>
        <h1 className="headline-lg xa-hero-title">{a.title}</h1>
        <dl className="xa-hero-facts">
          <div><dt><Icon name="schedule" size="sm" /> Thời gian</dt><dd>{whenText(a)}</dd></div>
          <div><dt><Icon name="event_busy" size="sm" /> Hạn đăng ký</dt><dd>{at(a.registrationDeadline)}</dd></div>
          <div><dt><Icon name="location_on" size="sm" /> Địa điểm</dt><dd>{a.location}</dd></div>
        </dl>
      </header>

      <div className="xa-stats">
        <div className="card card-outline"><span className="label-upper">Đã đăng ký</span><strong>{countText(a)}</strong><span className="caption muted">{a.capacity ? `Chỉ tiêu ${a.capacity} học sinh` : 'Không giới hạn chỉ tiêu'}</span></div>
        <div className="card card-outline"><span className="label-upper">Tỷ lệ lớp tham gia</span><strong>{String(ratio).replace('.', ',')}%</strong><span className="caption muted">Sĩ số {a.classSize} học sinh</span></div>
        <div className="card card-outline"><span className="label-upper">Chưa đăng ký</span><strong>{data.counts.NONE}</strong><span className="caption muted">Học sinh đang học lớp</span></div>
        <div className="card card-outline"><span className="label-upper">Còn trống</span><strong>{a.capacity ? Math.max(0, a.capacity - a.registeredCount) : '—'}</strong><span className="caption muted">{a.capacity ? 'Suất theo chỉ tiêu' : 'Không giới hạn'}</span></div>
      </div>

      <section className="card card-outline xa-table-card">
        <div className="xa-table-tools">
          <label className="xa-search">
            <Icon name="search" size="sm" />
            <input className="input" type="search" value={search} maxLength={100} placeholder="Tìm tên học sinh, mã HS hoặc phụ huynh…" onChange={(e) => setSearch(e.target.value)} aria-label="Tìm kiếm" />
          </label>
          <div className="pill-tabs" role="tablist" aria-label="Trạng thái">
            {TABS.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={status === k} className={`xa-tab${status === k ? ' is-on' : ''}`} onClick={() => setStatus(k)}>
                {label} ({k === 'all' ? data.counts.all : data.counts[k]})
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-secondary xa-export" onClick={doExport} disabled={exporting || !data.rows.length}>
            <Icon name="table_view" size="sm" /> {exporting ? 'Đang xuất…' : 'Xuất Excel'}
          </button>
        </div>
        {gone > 0 && <p className="caption xa-warn"><Icon name="info" size="sm" /> {gone} học sinh đã đăng ký nhưng không còn học lớp này (chuyển lớp, thôi học); không tính vào số đã đăng ký.</p>}

        {data.rows.length === 0 ? (
          <p className="muted xa-table-empty">{query ? 'Không có học sinh nào khớp tìm kiếm.' : status === 'REGISTERED' ? 'Chưa có học sinh nào được đăng ký.' : 'Không có học sinh nào.'}</p>
        ) : (
          <div className="xa-table-wrap">
            <table className="table xa-table">
              <thead>
                <tr><th>STT</th><th>Học sinh</th><th>Phụ huynh đăng ký</th><th>Thời gian</th><th>Trạng thái</th></tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.studentId} className={r.inClass ? '' : 'is-gone'}>
                    <td className="xa-mono">{String((page - 1) * PAGE + i + 1).padStart(2, '0')}</td>
                    <td>
                      <div className="xa-person">
                        <span className="xa-initials">{initials(r.fullName)}</span>
                        <div><strong>{r.fullName}</strong><span className="caption muted xa-mono">{r.studentCode}</span></div>
                      </div>
                    </td>
                    <td>{r.registeredByName ? <>{r.registeredByName}{r.relationship && <span className="caption muted"> ({r.relationship})</span>}{r.registeredByPhone && <span className="caption muted xa-block xa-mono">{r.registeredByPhone}</span>}</> : <span className="muted">—</span>}</td>
                    <td className="xa-mono">{r.status === 'REGISTERED' ? at(r.registeredAt) : r.status === 'CANCELLED' ? at(r.cancelledAt) : '—'}</td>
                    <td>
                      <span className={`xa-chip tone-${REG_STATUS[r.status].tone}`}>{REG_STATUS[r.status].label}</span>
                      {!r.inClass && <span className="caption muted xa-block">Không còn học lớp này</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.rows.length > PAGE && (
          <div className="xa-pager">
            <span className="caption muted">Hiển thị {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, data.rows.length)} trong {data.rows.length}</span>
            <button type="button" className="btn btn-icon" aria-label="Trang trước" disabled={page === 1} onClick={() => setPage(page - 1)}><Icon name="chevron_left" /></button>
            <span className="xa-mono">{page}/{pages}</span>
            <button type="button" className="btn btn-icon" aria-label="Trang sau" disabled={page === pages} onClick={() => setPage(page + 1)}><Icon name="chevron_right" /></button>
          </div>
        )}
      </section>
      <div className="notice ink"><Icon name="info" /><p>Danh sách xuất Excel theo đúng bộ lọc và từ khoá đang chọn. Số điện thoại phụ huynh chỉ hiện với giáo viên.</p></div>
    </div>
  );
}
