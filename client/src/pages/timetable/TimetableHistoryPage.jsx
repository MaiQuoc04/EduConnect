import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getTimetableHistory } from '../../api/timetables.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { dmy, WEEKDAY_LONG } from './WeekTimetable.jsx';
import './timetable.css';

// Timetable history of a class (FE-10, School Manager – Dung, 17/11/2026). Every saved timetable (manual save, Excel
// import, automatic scheduling) with its weekly pattern, who saved it and when, the dates it is still in force on,
// which later save replaced which dates, and the periods that took place. Nothing is deleted when a timetable is
// replaced, so this page can always be rebuilt; "Tải CSV" gives the same list for statistics.

const STATUS = {
  IN_FORCE: ['Còn hiệu lực', 'is-on'],
  PARTLY_REPLACED: ['Bị thay một phần', 'is-part'],
  REPLACED: ['Đã bị thay toàn bộ', 'is-gone'],
  ENDED: ['Đã hết hạn', 'is-ended'],
};
const FILTERS = [['all', 'Tất cả'], ['live', 'Còn hiệu lực'], ['replaced', 'Có ngày bị thay']];
const DAYS = [1, 2, 3, 4, 5, 6];
const at = (s) => (s ? `${dmy(s.slice(0, 10))} ${s.slice(11, 16)}` : '');
const range = (r) => (r.startDate === r.endDate ? dmy(r.startDate) : `${dmy(r.startDate)} – ${dmy(r.endDate)}`);
const ranges = (list) => list.map(range).join('; ');

function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // a name like "=..." must not run as a formula in Excel
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function Pattern({ plan, before, slots, subjectName }) {
  const cell = (list) => new Map(list.map((e) => [`${e.weekday}|${e.slotId}`, e]));
  const now = cell(plan.entries);
  const old = before ? cell(before.entries) : null;
  const used = new Set([...plan.entries, ...(before?.entries ?? [])].map((e) => String(e.slotId)));
  const rows = slots.filter((s) => s.period <= 5 || used.has(String(s.slotId)));
  return (
    <div className="ta-grid-wrap">
      <table className="ta-grid th-grid">
        <thead><tr><th scope="col">Tiết</th>{DAYS.map((w) => <th key={w} scope="col">{WEEKDAY_LONG[w - 1]}</th>)}</tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.slotId} className={s.period === 6 ? 'ta-afternoon-start' : ''}>
              <th scope="row">{s.period <= 5 ? `S${s.period}` : `C${s.period - 5}`}</th>
              {DAYS.map((w) => {
                const k = `${w}|${s.slotId}`;
                const e = now.get(k);
                const o = old?.get(k);
                const changed = old && (e?.subjectId !== o?.subjectId || (e?.room ?? null) !== (o?.room ?? null));
                return (
                  <td key={w} className={changed ? 'th-changed' : e ? '' : 'ta-empty'}>
                    {e && <><strong>{subjectName(e.subjectId)}</strong>{e.room && <span>{e.room}</span>}</>}
                    {changed && <span className="th-was">Trước: {o ? subjectName(o.subjectId) : 'trống'}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TimetableHistoryPage() {
  const { classId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(() => new Set());
  const [compare, setCompare] = useState(true);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    getTimetableHistory(classId).then((d) => alive && setData(d)).catch((err) => alive && setError(errorText(err)));
    return () => { alive = false; };
  }, [classId]);

  const subjectName = useMemo(() => {
    const m = new Map((data?.subjects ?? []).map((s) => [String(s.subjectId), s.name]));
    return (id) => m.get(String(id)) ?? `Môn #${id}`;
  }, [data]);
  const byId = useMemo(() => new Map((data?.plans ?? []).map((p) => [p.planId, p])), [data]);

  if (error) {
    return (
      <div className="tt-page">
        <div className="notice amber"><Icon name="error_outline" /><div><p>{error}</p>
          <Link to="/timetables" className="btn btn-secondary">Về danh sách lớp</Link></div></div>
      </div>
    );
  }
  if (!data) return <div className="tt-page" aria-busy="true"><p className="tt-muted">Đang tải…</p></div>;

  const cls = data.class;
  const plans = data.plans.filter((p) => filter === 'all'
    || (filter === 'live' ? p.inForce.length > 0 : p.replacedBy.length > 0));
  const held = data.plans.reduce((n, p) => n + p.held.periods, 0);
  const changes = data.plans.filter((p) => p.replaces.length).length;
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function downloadCsv() {
    const head = ['Mã bản lưu', 'Lưu lúc', 'Người lưu', 'Áp dụng từ', 'Đến', 'Trạng thái', 'Còn hiệu lực', 'Số ngày còn hiệu lực',
      'Tiết/tuần', 'Số tiết theo môn/tuần', 'Tiết đã diễn ra', 'Tiết đã điểm danh', 'Bị thay bởi', 'Thay cho'];
    const lines = data.plans.map((p) => {
      const per = {};
      for (const e of p.entries) per[subjectName(e.subjectId)] = (per[subjectName(e.subjectId)] ?? 0) + 1;
      return [p.planId, at(p.createdAt), p.createdBy ?? '', dmy(p.startDate), dmy(p.endDate), STATUS[p.status][0],
        ranges(p.inForce), p.inForceDays, p.periodsPerWeek, Object.entries(per).map(([k, v]) => `${k}: ${v}`).join('; '),
        p.held.periods, p.held.withAttendance,
        p.replacedBy.map((x) => `${ranges(x.ranges)} bởi bản ${x.by?.planId ?? '?'} (${at(x.at)}${x.by?.createdBy ? `, ${x.by.createdBy}` : ''})`).join(' | '),
        p.replaces.map((x) => `bản ${x.planId}: ${ranges(x.ranges)}`).join(' | ')];
    });
    const csv = `﻿${[head, ...lines].map((r) => r.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `lich-su-tkb-${cls.className}-${cls.schoolYear.name}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="tt-page">
      <nav className="tt-crumb" aria-label="Breadcrumb">
        <span>EduConnect</span><span className="tt-crumb-sep">/</span><Link to="/timetables">Thời khoá biểu</Link>
        <span className="tt-crumb-sep">/</span><span>Lớp {cls.className}</span><span className="tt-crumb-sep">/</span>
        <strong className="tt-ink">Lịch sử</strong>
      </nav>
      <div className="tt-head">
        <div>
          <h1 className="headline-lg">Lịch sử thời khoá biểu – Lớp {cls.className}</h1>
          <p>Năm học {cls.schoolYear.name} · Mọi lần lưu (sửa tay, nhập Excel, xếp tự động) đều được giữ lại, kể cả bản đã bị thay.</p>
        </div>
        <div className="tt-head-actions">
          <Link to={`/timetables/classes/${cls.classId}/edit`} className="btn btn-secondary"><Icon name="edit" size="sm" /> Sửa TKB</Link>
          <button type="button" className="btn btn-primary" onClick={downloadCsv} disabled={!data.plans.length}>
            <Icon name="download" size="sm" /> Tải CSV
          </button>
        </div>
      </div>

      <div className="ta-stats">
        <div className="card"><span className="caption tt-muted">Số lần lưu</span><strong>{data.plans.length}</strong></div>
        <div className="card"><span className="caption tt-muted">Lần thay bản cũ</span><strong>{changes}</strong></div>
        <div className="card"><span className="caption tt-muted">Bản bị thay toàn bộ</span><strong>{data.plans.filter((p) => p.status === 'REPLACED').length}</strong></div>
        <div className="card"><span className="caption tt-muted">Tiết đã diễn ra (đến {dmy(data.today)})</span><strong>{held}</strong></div>
      </div>

      {data.plans.length === 0 ? (
        <div className="card th-empty"><Icon name="history" /><p>Lớp {cls.className} chưa có thời khoá biểu nào.</p></div>
      ) : (
        <>
          <div className="th-bar">
            <div className="tt-seg is-small ta-tabs" role="tablist" aria-label="Lọc">
              {FILTERS.map(([k, t]) => (
                <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'is-on' : ''} onClick={() => setFilter(k)}>{t}</button>
              ))}
            </div>
            <label className="ta-check"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Tô các ô khác với bản bị thay</label>
          </div>
          {data.truncated && <p className="caption tt-muted">Chỉ hiện {data.plans.length} lần lưu gần nhất.</p>}
          {plans.length === 0 && <p className="tt-muted">Không có bản nào khớp bộ lọc.</p>}
          <ol className="th-list">
            {plans.map((p) => {
              const [statusText, statusClass] = STATUS[p.status];
              // Compare with the plan that was in force on this plan's first day (else the first one it replaced).
              const was = p.replaces.find((x) => x.ranges.some((r) => r.startDate <= p.startDate && r.endDate >= p.startDate)) ?? p.replaces[0];
              const before = compare && was ? byId.get(was.planId) : null;
              const shown = open.has(p.planId);
              return (
                <li key={p.planId} className={`card th-item ${statusClass}`}>
                  <div className="th-item-head">
                    <div>
                      <strong>Bản lưu {at(p.createdAt)}</strong>
                      <span className="tt-muted"> · {p.createdBy ?? 'Không rõ người lưu'} · mã {p.planId}</span>
                    </div>
                    <div className="th-tags">
                      {p.runningToday && <span className="stamp">Đang áp dụng</span>}
                      <span className={`th-status ${statusClass}`}>{statusText}</span>
                    </div>
                  </div>
                  <dl className="th-facts">
                    <div><dt>Lúc lưu áp dụng cho</dt><dd>{range(p)}</dd></div>
                    <div><dt>Còn hiệu lực</dt><dd>{p.inForce.length ? ranges(p.inForce) : 'Không còn ngày nào'}</dd></div>
                    <div><dt>Mẫu tuần</dt><dd>{p.periodsPerWeek} tiết/tuần</dd></div>
                    <div><dt>Đã diễn ra</dt><dd>{p.held.periods} tiết{p.held.withAttendance ? ` (${p.held.withAttendance} đã điểm danh)` : ''}</dd></div>
                  </dl>
                  {p.replaces.length > 0 && (
                    <p className="th-line"><Icon name="swap_horiz" size="sm" /> Thay cho: {p.replaces.map((x) => `bản mã ${x.planId} lưu ${at(x.createdAt)} (${ranges(x.ranges)})`).join('; ')}</p>
                  )}
                  {p.replacedBy.map((x, i) => (
                    <p key={`${x.by?.planId ?? 'x'}-${i}`} className="th-line is-warn">
                      <Icon name="history" size="sm" /> {ranges(x.ranges)} bị thay bởi {x.by ? `bản mã ${x.by.planId} lưu ${at(x.by.createdAt)}${x.by.createdBy ? ` của ${x.by.createdBy}` : ''}` : `một lần sửa lúc ${at(x.at)}`}
                    </p>
                  ))}
                  <button type="button" className="tt-link th-toggle" aria-expanded={shown} onClick={() => toggle(p.planId)}>
                    <Icon name={shown ? 'expand_less' : 'expand_more'} size="sm" /> {shown ? 'Ẩn mẫu tuần' : 'Xem mẫu tuần'}
                  </button>
                  {shown && (
                    <>
                      {before && <p className="caption tt-muted">Ô tô vàng: khác với bản mã {before.planId} (lưu {at(before.createdAt)}) mà bản này thay thế.</p>}
                      <Pattern plan={p} before={before} slots={data.timeSlots} subjectName={subjectName} />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
