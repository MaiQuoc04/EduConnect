import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPeriodTimes, savePeriodTimes } from '../../api/timetables.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { checkTimes, planTimes, SESSION_NAMES } from './periodTimes.js';
import './timetable.css';

// FE-10 period times (School Manager, 13/11/2026): the start of each session and one length for every period; the
// breaks between periods stay as they are. Every class timetable stores period numbers only, so all lessons (every
// day, past weeks too) move to the new times.

export default function PeriodTimesPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [starts, setStarts] = useState([]);
  const [duration, setDuration] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const load = useCallback(async () => {
    setLoadError('');
    setSaveError(null);
    try {
      const d = await getPeriodTimes();
      setData(d);
      setStarts(d.sessions.map((s) => s.start));
      setDuration(d.duration != null ? String(d.duration) : '');
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const minutes = /^\d{1,3}$/.test(duration) ? Number(duration) : NaN;
  const problems = useMemo(
    () => (data?.sessions.length ? checkTimes(data.sessions, starts, minutes, data.limits) : {}),
    [data, starts, minutes],
  );
  const valid = data && Object.keys(problems).length === 0;
  const rows = valid ? planTimes(data.sessions, starts, minutes) : [];
  const current = Object.fromEntries((data?.slots ?? []).map((s) => [s.period, s]));
  const changed = rows.filter((r) => current[r.period]?.start !== r.start || current[r.period]?.end !== r.end).length;

  useEffect(() => {
    if (!changed) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changed]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const d = await savePeriodTimes({ sessionStarts: starts, duration: minutes, stamp: data.stamp });
      setConfirming(false);
      setData(d);
      setStarts(d.sessions.map((s) => s.start));
      setDuration(d.duration != null ? String(d.duration) : '');
      toast(d.changed ? `Đã cập nhật giờ học cho ${d.changed} tiết.` : 'Giờ học không thay đổi.');
    } catch (err) {
      setConfirming(false);
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return <div className="tt-page"><div className="notice amber" role="alert"><Icon name="error_outline" /><div><p>{loadError}</p><button type="button" className="btn btn-secondary" onClick={load}>Thử lại</button></div></div></div>;
  }
  if (!data) return <div className="tt-page" aria-busy="true"><p className="muted">Đang tải…</p></div>;

  return (
    <div className="tt-page">
      <nav className="tt-crumb" aria-label="Breadcrumb">
        <span>EduConnect</span><span className="tt-crumb-sep">/</span><Link to="/timetables">Thời khoá biểu</Link><span className="tt-crumb-sep">/</span><strong className="tt-ink">Giờ học</strong>
      </nav>
      <div className="tt-head">
        <div>
          <h1 className="headline-xl">Giờ học các tiết</h1>
          <p>Đặt giờ bắt đầu của từng buổi và thời lượng một tiết. Giờ nghỉ giữa các tiết giữ nguyên như hiện tại.</p>
        </div>
      </div>

      {!data.sessions.length ? (
        <div className="notice amber"><Icon name="warning" /><p>Chưa có tiết học nào trong cơ sở dữ liệu (bảng time_slots trống).</p></div>
      ) : (
        <div className="tt-pt-grid">
          <section className="card card-outline tt-pt-form">
            <h2 className="title-sm tt-pt-title">Thiết lập</h2>
            {data.sessions.map((se, k) => (
              <label key={se.periods[0].period} className="field">
                <span className="field-label">{SESSION_NAMES[k] ?? `Buổi ${k + 1}`} bắt đầu (tiết {se.periods[0].period}–{se.periods[se.periods.length - 1].period})</span>
                <input type="time" className="input" value={starts[k] ?? ''} step={300}
                  onChange={(e) => setStarts((s) => s.map((v, i) => (i === k ? e.target.value : v)))} aria-invalid={Boolean(problems[`session${k}`])} />
                <span className="field-help">Hiện tại: {se.start} – {se.end}</span>
                {problems[`session${k}`] && <span className="field-error">{problems[`session${k}`]}</span>}
              </label>
            ))}
            <label className="field">
              <span className="field-label">Thời lượng một tiết (phút)</span>
              <input type="number" className="input" inputMode="numeric" min={data.limits.DURATION_MIN} max={data.limits.DURATION_MAX} value={duration}
                onChange={(e) => setDuration(e.target.value.trim())} aria-invalid={Boolean(problems.duration)} />
              <span className="field-help">
                {data.duration != null ? `Hiện tại: ${data.duration} phút.` : 'Hiện các tiết dài khác nhau; lưu sẽ đặt cùng một thời lượng.'} Cho phép {data.limits.DURATION_MIN}–{data.limits.DURATION_MAX} phút.
              </span>
              {problems.duration && <span className="field-error">{problems.duration}</span>}
            </label>
            <div className="notice ink"><Icon name="info" /><p>Áp dụng cho <strong>mọi ngày, mọi lớp</strong> (cả các tuần đã qua) vì thời khoá biểu chỉ lưu số tiết. Thời khoá biểu, lịch dạy và lịch dạy trong hồ sơ giáo viên hiển thị theo giờ mới ngay sau khi lưu.</p></div>
            {saveError && (
              <div className="notice amber" role="alert"><Icon name="error_outline" />
                <div>
                  <p>{errorText(saveError)}</p>
                  {saveError.code === 'MSG_PERIOD_TIMES_CHANGED' && <button type="button" className="btn btn-secondary" onClick={load}><Icon name="refresh" size="sm" /> Tải lại</button>}
                </div>
              </div>
            )}
            <div className="tt-pt-actions">
              <button type="button" className="btn btn-secondary" disabled={!changed || saving} onClick={() => { setStarts(data.sessions.map((s) => s.start)); setDuration(data.duration != null ? String(data.duration) : ''); }}>Đặt lại</button>
              <button type="button" className="btn btn-primary" disabled={!valid || !changed || saving} onClick={() => setConfirming(true)}>
                <Icon name="save" size="sm" /> Lưu giờ học
              </button>
            </div>
          </section>

          <section className="card card-outline tt-pt-preview" aria-label="Xem trước">
            <h2 className="title-sm tt-pt-title">Xem trước {changed > 0 && <span className="tt-pt-badge">{changed} tiết đổi giờ</span>}</h2>
            <div className="tt-pt-table-wrap">
              <table className="table tt-pt-table">
                <thead><tr><th>Tiết</th><th>Hiện tại</th><th>Sau khi lưu</th><th>Nghỉ sau tiết</th></tr></thead>
                <tbody>
                  {data.sessions.map((se, k) => [
                    <tr key={`s${k}`} className="tt-pt-session"><td colSpan={4}>{SESSION_NAMES[k] ?? `Buổi ${k + 1}`}</td></tr>,
                    ...se.periods.map((p) => {
                      const now = current[p.period];
                      const next = rows.find((r) => r.period === p.period);
                      const moved = next && (next.start !== now.start || next.end !== now.end);
                      return (
                        <tr key={p.period} className={moved ? 'is-moved' : ''}>
                          <td className="tt-pt-num">{p.period}</td>
                          <td className="tt-pt-time">{now.start} – {now.end}</td>
                          <td className="tt-pt-time">{next ? `${next.start} – ${next.end}` : '—'}</td>
                          <td className="muted">{p.breakAfter != null ? `${p.breakAfter} phút` : 'Hết buổi'}</td>
                        </tr>
                      );
                    }),
                  ])}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {confirming && (
        <div className="tt-overlay" onClick={() => !saving && setConfirming(false)}>
          <div className="tt-dialog tt-dialog-sm" role="dialog" aria-modal="true" aria-labelledby="pt-confirm" onClick={(e) => e.stopPropagation()}>
            <header className="tt-dialog-head"><div><span className="label-upper">Giờ học</span><h2 id="pt-confirm" className="tt-dialog-title">Lưu giờ học mới?</h2></div></header>
            <div className="tt-dialog-body">
              <p>{changed} tiết sẽ đổi giờ: {data.sessions.map((se, k) => `${(SESSION_NAMES[k] ?? `Buổi ${k + 1}`).toLowerCase()} từ ${starts[k]}`).join(', ')}, mỗi tiết {minutes} phút.</p>
              <p className="muted">Mọi thời khoá biểu và lịch dạy hiển thị theo giờ mới, kể cả các tuần đã qua.</p>
            </div>
            <footer className="tt-dialog-foot">
              <span />
              <div className="tt-dialog-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={saving}>Huỷ</button>
                <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu giờ học'}</button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
