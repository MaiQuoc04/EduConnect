import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { exportAttendanceStats, getAttendanceStats, listMissingLessons } from '../../api/attendance.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { dmy, fmtRate, num, SemesterSelect, TotalsStrip, useAttendanceOptions } from './attendanceShared.jsx';
import ClassReport from './ClassReport.jsx';
import './attendance.css';

// SCR-51 Attendance Statistics (School Manager) – UC-94. Semester or date range, grade filter; per class periods
// held / taken, present rate, late, excused, unexcused; a class opens its students (ClassReport); tab "Tiết chưa
// điểm danh" lists started periods without attendance (overdue ones can only be entered by SM, §12 point 4).
// Excel export of both. No "too many absences" warning (no agreed threshold, §12 point 9).

const PAGE_SIZE = 20;

export default function AttendanceStatsPage() {
  const toast = useToast();
  const options = useAttendanceOptions();
  const [params, setParams] = useSearchParams();
  const update = useCallback(
    (changes) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(changes)) (v ? next.set(k, String(v)) : next.delete(k));
      setParams(next, { replace: true });
    },
    [setParams],
  );
  const tab = params.get('tab') === 'missing' ? 'missing' : 'classes';
  const semesterId = params.get('semesterId') || String(options.data?.currentSemesterId ?? '');
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const gradeLevelId = params.get('gradeLevelId') ?? '';
  const openClass = params.get('classId') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const filter = { semesterId, from: from || undefined, to: to || undefined, gradeLevelId: gradeLevelId || undefined };
  const filterKey = JSON.stringify(filter);

  const [stats, setStats] = useState({ loading: false, data: null, error: '' });
  const [missing, setMissing] = useState({ loading: false, data: null, error: '' });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!semesterId) return undefined;
    let alive = true;
    const f = JSON.parse(filterKey);
    setStats((s) => ({ ...s, loading: true, error: '' }));
    getAttendanceStats(f)
      .then((data) => alive && setStats({ loading: false, data, error: '' }))
      .catch((err) => alive && setStats({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [semesterId, filterKey]);

  useEffect(() => {
    if (!semesterId || tab !== 'missing') return undefined;
    let alive = true;
    setMissing((s) => ({ ...s, loading: true, error: '' }));
    listMissingLessons({ ...JSON.parse(filterKey), page, pageSize: PAGE_SIZE })
      .then((data) => alive && setMissing({ loading: false, data, error: '' }))
      .catch((err) => alive && setMissing({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [semesterId, filterKey, tab, page]);

  async function runExport() {
    setExporting(true);
    try {
      await exportAttendanceStats(filter);
    } catch (err) {
      toast(errorText(err), { type: 'error' });
    } finally {
      setExporting(false);
    }
  }

  const data = stats.data;
  const pages = missing.data ? Math.max(1, Math.ceil(missing.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="att-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Điểm danh</span>/<span className="current">Thống kê điểm danh</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Thống kê điểm danh</h1>
          <p>Tình hình chuyên cần của toàn trường theo học kỳ. Chọn một lớp để xem từng học sinh.</p>
        </div>
        <div className="actions-row">
          <Link to="/attendance" className="btn btn-secondary">
            <Icon name="edit_note" size="sm" /> Sửa điểm danh
          </Link>
          <button type="button" className="btn btn-primary" onClick={runExport} disabled={exporting || !semesterId}>
            <Icon name="download" size="sm" /> {exporting ? 'Đang xuất…' : 'Xuất Excel'}
          </button>
        </div>
      </div>

      {options.error && <p className="form-error" role="alert">{options.error}</p>}
      <div className="att-filters">
        <SemesterSelect semesters={options.semesters} value={semesterId} onChange={(v) => update({ semesterId: v, from: null, to: null, page: null, classId: null })} />
        <label className="field" htmlFor="att-sfrom">
          <span className="field-label">Từ ngày</span>
          <input id="att-sfrom" type="date" className="input" value={from} onChange={(e) => update({ from: e.target.value, page: null })} />
        </label>
        <label className="field" htmlFor="att-sto">
          <span className="field-label">Đến ngày</span>
          <input id="att-sto" type="date" className="input" value={to} onChange={(e) => update({ to: e.target.value, page: null })} />
        </label>
        <label className="field" htmlFor="att-grade">
          <span className="field-label">Khối</span>
          <select id="att-grade" className="input" value={gradeLevelId} onChange={(e) => update({ gradeLevelId: e.target.value, page: null, classId: null })}>
            <option value="">Tất cả khối</option>
            {(options.data?.gradeLevels ?? []).map((g) => (
              <option key={g.gradeLevelId} value={g.gradeLevelId}>
                Khối {g.gradeLevelName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {stats.error && <p className="form-error" role="alert">{stats.error}</p>}
      {data && (
        <section className="card card-outline att-own-card">
          <p className="caption muted">
            Từ {dmy(data.from)} đến {dmy(data.to)} · {num(data.totals.taken)}/{num(data.totals.held)} tiết đã diễn ra có điểm danh
          </p>
          <TotalsStrip totals={data.totals} />
        </section>
      )}

      <div className="tabs att-tabs" role="tablist" aria-label="Nội dung">
        <button type="button" role="tab" aria-selected={tab === 'classes'} onClick={() => update({ tab: null, page: null })}>
          Theo lớp
        </button>
        <button type="button" role="tab" aria-selected={tab === 'missing'} onClick={() => update({ tab: 'missing', classId: null })}>
          Tiết chưa điểm danh
        </button>
      </div>

      {tab === 'classes' ? (
        <>
          <section className={`card card-outline att-table-card${stats.loading ? ' is-refreshing' : ''}`}>
            <div className="att-table-wrap">
              <table className="table att-table">
                <thead>
                  <tr>
                    <th>Lớp</th>
                    <th className="num">Sĩ số</th>
                    <th className="num">Tiết đã điểm danh</th>
                    <th className="num">Có mặt</th>
                    <th className="num">Đi muộn</th>
                    <th className="num">Vắng có phép</th>
                    <th className="num">Vắng không phép</th>
                    <th className="num">Tỷ lệ có mặt</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.classes.length === 0 && (
                    <tr>
                      <td colSpan={8} className="muted">Chưa có lớp nào.</td>
                    </tr>
                  )}
                  {data?.classes.map((c) => (
                    <tr key={c.classId} className={String(c.classId) === openClass ? 'is-selected' : undefined}>
                      <td>
                        <button type="button" className="link-button att-link" onClick={() => update({ classId: String(c.classId) === openClass ? null : c.classId })}>
                          {c.className}
                        </button>
                        <span className="caption muted"> · Khối {c.gradeLevelName}</span>
                      </td>
                      <td className="num mono">{num(c.students)}</td>
                      <td className={`num mono${c.taken < c.held ? ' att-amber' : ''}`}>
                        {num(c.taken)}/{num(c.held)}
                      </td>
                      <td className="num mono">{num(c.present)}</td>
                      <td className="num mono">{num(c.late)}</td>
                      <td className="num mono">{num(c.excused)}</td>
                      <td className={`num mono${c.unexcused ? ' att-red' : ''}`}>{num(c.unexcused)}</td>
                      <td className="num mono">{fmtRate(c.presentRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {openClass && (
            <section className="card card-outline">
              <ClassReport classId={openClass} semesterId={semesterId} from={from} to={to} />
            </section>
          )}
        </>
      ) : (
        <section className={`card card-outline att-table-card${missing.loading ? ' is-refreshing' : ''}`}>
          {missing.error && <p className="form-error" role="alert">{missing.error}</p>}
          <p className="caption muted att-missing-note">
            Tiết đã bắt đầu nhưng chưa có điểm danh. Tiết quá hạn chỉ quản lý nhà trường nhập bù được, kèm lý do.
          </p>
          <div className="att-table-wrap">
            <table className="table att-table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Tiết</th>
                  <th>Lớp</th>
                  <th>Môn</th>
                  <th>Giáo viên</th>
                  <th>Tình trạng</th>
                  <th aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {missing.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted">Không có tiết nào chưa điểm danh.</td>
                  </tr>
                )}
                {missing.data?.items.map((m) => (
                  <tr key={m.lessonId}>
                    <td className="mono">{dmy(m.date)}</td>
                    <td className="mono">
                      {m.period} ({m.start})
                    </td>
                    <td>{m.className}</td>
                    <td>{m.subjectName}</td>
                    <td>{m.teacherName}</td>
                    <td>{m.overdue ? <span className="pill red">Quá hạn</span> : <span className="pill amber">Còn trong hạn</span>}</td>
                    <td>
                      <Link to={`/attendance?classId=${m.classId}&date=${m.date}&lesson=${m.lessonId}`} className="btn btn-tertiary">
                        Mở
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {missing.data && missing.data.total > PAGE_SIZE && (
            <div className="att-pager">
              <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>
                Trang trước
              </button>
              <span className="caption">
                Trang {page}/{pages} · {num(missing.data.total)} tiết
              </span>
              <button type="button" className="btn btn-secondary" disabled={page >= pages} onClick={() => update({ page: page + 1 })}>
                Trang sau
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
