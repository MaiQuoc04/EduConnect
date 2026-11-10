import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getClassEvents } from '../../api/classEvents.js';
import { getViewableClasses } from '../../api/timetables.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { errorText } from '../../messages.js';
import {
  addDays, dm, dmy, isoDate, longDate, mondayOf, styleOf, timeRange, WEEKDAY_SHORT, weekNumber,
} from './calendarUtils.js';
import './calendar.css';

// SCR-39 Class Calendar – UC-76 (FE-10, Teacher / Student / Parent), Stitch design. Events appear automatically for
// their audience (business rules §10); the server decides what each user sees. ?classId= &date= &view=week|day.

const RELATION = { HOMEROOM: 'Chủ nhiệm', TEACHING: 'Giảng dạy' };

function EventCard({ ev, isParent }) {
  const st = styleOf(ev.categoryCode);
  return (
    <Link to={`/calendar/events/${ev.eventId}`} className={`cal-card tone-${st.tone}`}>
      <div className="cal-card-main">
        <div className="cal-card-meta">
          <span className={`cal-cat tone-${st.tone}`}>{ev.categoryName}</span>
          <span className="cal-mono">{timeRange(ev)}</span>
          <span className="cal-sep">·</span>
          <span className="cal-card-class">Lớp {ev.className}</span>
          {isParent && ev.children && <><span className="cal-sep">·</span><span className="cal-muted">Con: {ev.children}</span></>}
        </div>
        <h2 className="cal-card-title">{ev.title}</h2>
        <div className="cal-card-foot">
          <span><Icon name="menu_book" size="sm" />Môn học: <strong>{ev.subjectName ?? 'Chung của lớp'}</strong></span>
          <span><Icon name="account_circle" size="sm" />Người tạo: <strong>{ev.createdByName}</strong>{ev.isMine ? ' (bạn)' : ''}</span>
        </div>
      </div>
      {ev.started && <span className="cal-past-tag">Đã diễn ra</span>}
    </Link>
  );
}

export default function ClassCalendarPage() {
  const { activeRole } = useAuth();
  const isTeacher = activeRole === 'TEACHER';
  const isParent = activeRole === 'PARENT';
  const [params, setParams] = useSearchParams();
  const [options, setOptions] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState(() => new Set()); // categories filtered out

  const classId = params.get('classId') ?? '';
  const view = params.get('view') === 'day' ? 'day' : 'week';
  const today = options?.today ?? data?.now?.slice(0, 10) ?? '';
  const date = isoDate(params.get('date')) ? params.get('date') : today;
  const weekStart = date ? mondayOf(date) : '';

  const setParam = (patch) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k));
      return n;
    });

  useEffect(() => {
    getViewableClasses().then(setOptions).catch((err) => setError(errorText(err)));
  }, []);

  // This week + the next one (for "Sắp tới tuần sau").
  const load = useCallback(async () => {
    if (!weekStart) return;
    setLoading(true);
    setError('');
    try {
      setData(await getClassEvents({ from: weekStart, to: addDays(weekStart, 13), classId }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [weekStart, classId]);
  useEffect(() => { load(); }, [load]);

  const items = options?.items ?? [];
  const current = items.find((it) => String(it.classId) === classId);
  const days = weekStart ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [];
  const weekEnd = days[6];
  const all = data?.events ?? [];
  const thisWeek = all.filter((e) => e.startAt.slice(0, 10) <= weekEnd);
  const nextWeek = all.filter((e) => e.startAt.slice(0, 10) > weekEnd).slice(0, 5);
  const categories = useMemo(() => {
    const m = new Map();
    for (const e of thisWeek) {
      const c = m.get(e.categoryCode) ?? { code: e.categoryCode, name: e.categoryName, n: 0 };
      c.n += 1;
      m.set(e.categoryCode, c);
    }
    return [...m.values()];
  }, [thisWeek]);
  const shown = thisWeek.filter((e) => !hidden.has(e.categoryCode));
  const byDay = (d) => shown.filter((e) => e.startAt.slice(0, 10) === d);
  const listDays = view === 'day' ? [date] : days.filter((d) => byDay(d).length);
  const weekNo = weekNumber(weekStart, options?.schoolYear?.startDate);
  const toggle = (code) => setHidden((h) => { const n = new Set(h); n.has(code) ? n.delete(code) : n.add(code); return n; });

  return (
    <div className="cal-page">
      <nav className="cal-crumb" aria-label="Breadcrumb">
        <span>EduConnect</span><span>/</span><span>Học vụ &amp; Lớp</span><span>/</span>
        <strong>Lịch lớp{current ? ` ${current.className}` : ''}</strong>
      </nav>
      <div className="cal-head">
        <div>
          <div className="cal-title-row">
            <h1 className="headline-lg">Lịch lớp</h1>
            <span className="cal-class-tag">{current ? `Lớp ${current.className}` : 'Tất cả lớp của bạn'}</span>
          </div>
          <p>Lịch kiểm tra, họp phụ huynh và các mốc sinh hoạt chung của lớp. Sự kiện tự hiện với người được xem.</p>
        </div>
        <div className="cal-head-actions">
          <div className="cal-seg" role="tablist" aria-label="Kiểu xem">
            <button type="button" role="tab" aria-selected={view === 'day'} onClick={() => setParam({ view: 'day' })}>Ngày</button>
            <button type="button" role="tab" aria-selected={view === 'week'} onClick={() => setParam({ view: '' })}>Tuần</button>
          </div>
          {isTeacher && (
            <Link to={`/calendar/events/new${classId ? `?classId=${classId}` : ''}${date ? `${classId ? '&' : '?'}date=${date}` : ''}`} className="btn btn-primary">
              <Icon name="add" size="sm" /> Tạo sự kiện
            </Link>
          )}
        </div>
      </div>

      <section className="cal-weekbar">
        <div className="cal-weekbar-top">
          <div className="cal-weeknav">
            <button type="button" className="cal-icon-btn" aria-label="Tuần trước" onClick={() => setParam({ date: addDays(weekStart, -7) })} disabled={!weekStart}>
              <Icon name="chevron_left" />
            </button>
            <button type="button" className="cal-icon-btn" aria-label="Tuần sau" onClick={() => setParam({ date: addDays(weekStart, 7) })} disabled={!weekStart}>
              <Icon name="chevron_right" />
            </button>
            <span className="cal-weeklabel">{weekNo ? `Tuần ${weekNo} · ` : ''}{dm(weekStart)} – {dmy(weekEnd)}</span>
            <button type="button" className="cal-today-btn" onClick={() => setParam({ date: '' })}>Hôm nay</button>
          </div>
          <label className="cal-picker">
            <span className="label-upper">{isParent ? 'Con' : 'Lớp'}</span>
            <select value={classId} onChange={(e) => setParam({ classId: e.target.value })}>
              <option value="">{isParent ? 'Tất cả các con' : 'Tất cả lớp'}</option>
              {items.map((it) => (
                <option key={`${it.classId}-${it.studentName ?? ''}`} value={it.classId}>
                  {isParent ? `${it.studentName} (${it.className})` : `Lớp ${it.className}${RELATION[it.relation] ? ` · ${RELATION[it.relation]}` : ''}`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="cal-strip">
          {days.map((d, i) => {
            const evs = thisWeek.filter((e) => e.startAt.slice(0, 10) === d);
            const tones = [...new Set(evs.map((e) => styleOf(e.categoryCode).tone))];
            const on = view === 'day' ? d === date : d === today;
            return (
              <button key={d} type="button" className={`cal-day${on ? ' is-on' : ''}${evs.length ? ' has-events' : ''}${i === 6 ? ' is-sunday' : ''}`}
                onClick={() => setParam({ date: d, view: 'day' })} aria-label={`${longDate(d)}: ${evs.length} sự kiện`}>
                <span className="cal-day-name">{WEEKDAY_SHORT[i]}</span>
                <span className="cal-day-num">{d.slice(8, 10)}</span>
                <span className="cal-dots">{tones.map((t) => <i key={t} className={`tone-${t}`} />)}</span>
                <span className="cal-day-note">{d === today ? 'Hôm nay' : evs.length ? `${evs.length} sự kiện` : ''}</span>
              </button>
            );
          })}
        </div>
      </section>

      {error && <div className="notice amber"><Icon name="error_outline" /><p>{error}</p></div>}
      {options && !items.length && (
        <div className="notice"><Icon name="info" /><p>{isParent ? 'Tài khoản chưa được liên kết với học sinh nào đang học.' : 'Bạn chưa thuộc lớp nào trong năm học này.'}</p></div>
      )}

      <div className="cal-layout" aria-busy={loading}>
        <div className="cal-stream">
          {data && listDays.length === 0 && (
            <div className="cal-empty">
              <Icon name="event_available" />
              <p>{view === 'day' ? `Không có sự kiện nào vào ${longDate(date)}.` : 'Tuần này chưa có sự kiện nào.'}</p>
              {isTeacher && <Link to={`/calendar/events/new?date=${view === 'day' ? date : weekStart}${classId ? `&classId=${classId}` : ''}`} className="btn btn-secondary">Tạo sự kiện</Link>}
            </div>
          )}
          {listDays.map((d) => (
            <section key={d} className="cal-dayblock">
              <div className="cal-dayblock-head">
                <span><strong>{longDate(d)}</strong>{d === today && <span className="cal-today-chip">Hôm nay</span>}</span>
                <span className="cal-muted">{byDay(d).length} sự kiện</span>
              </div>
              {byDay(d).length === 0 ? <p className="cal-day-empty">Không có sự kiện.</p>
                : byDay(d).map((ev) => <EventCard key={ev.eventId} ev={ev} isParent={isParent} />)}
            </section>
          ))}
        </div>

        <aside className="cal-side">
          <div className="cal-box">
            <div className="cal-box-head">
              <h3>Bộ lọc sự kiện</h3>
              {hidden.size > 0 && <button type="button" className="cal-link" onClick={() => setHidden(new Set())}>Mặc định</button>}
            </div>
            {categories.length === 0 ? <p className="cal-muted cal-small">Tuần này chưa có sự kiện để lọc.</p> : (
              <div className="cal-filters">
                <label>
                  <input type="checkbox" checked={hidden.size === 0} onChange={() => setHidden(hidden.size ? new Set() : new Set(categories.map((c) => c.code)))} />
                  <span>Tất cả sự kiện</span><em>{thisWeek.length}</em>
                </label>
                {categories.map((c) => (
                  <label key={c.code}>
                    <input type="checkbox" checked={!hidden.has(c.code)} onChange={() => toggle(c.code)} />
                    <span><i className={`cal-dot tone-${styleOf(c.code).tone}`} />{c.name}</span><em>{c.n}</em>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="cal-box">
            <span className="label-upper">Sắp tới tuần sau</span>
            {nextWeek.length === 0 ? <p className="cal-muted cal-small">Chưa có sự kiện nào.</p> : (
              <ul className="cal-next">
                {nextWeek.map((ev) => (
                  <li key={ev.eventId}>
                    <span className="cal-next-date">{dm(ev.startAt)}</span>
                    <Link to={`/calendar/events/${ev.eventId}`}>
                      <strong>{ev.title}</strong>
                      <span>{ev.categoryName} · Lớp {ev.className} · {timeRange(ev)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="cal-box cal-note">
            <Icon name="info" size="sm" />
            <span>
              {isTeacher
                ? 'Bạn tạo sự kiện cho môn mình dạy; giáo viên chủ nhiệm tạo thêm sự kiện chung của lớp. Người được xem nhận thông báo và được nhắc trước 1 ngày.'
                : 'Lịch chỉ để xem. Muốn điều chỉnh sự kiện, vui lòng trao đổi với giáo viên đã tạo sự kiện.'}
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
