import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteClassEvent, getClassEvent } from '../../api/classEvents.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { addDays, audienceText, dmy, hm, longDate, styleOf, timeRange, weekNumber } from './calendarUtils.js';
import './calendar.css';

// SCR-41 Calendar Event Detail – UC-77 (+ UC-80 Delete for the creator), Stitch design.

const KIND = { STUDENT: 'Học sinh', PARENT: 'Phụ huynh', TEACHER: 'Giáo viên' };

export function DeleteDialog({ ev, busy, onCancel, onConfirm }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);
  return (
    <div className="cal-overlay" onClick={() => !busy && onCancel()}>
      <div className="cal-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cal-del-title" onClick={(e) => e.stopPropagation()}>
        <div className="cal-dialog-row">
          <span className="cal-dialog-icon"><Icon name="warning" /></span>
          <div>
            <h2 id="cal-del-title">Xoá sự kiện này?</h2>
            <p>Người được xem sẽ không còn thấy sự kiện trên lịch lớp và không nhận nhắc lịch nữa.</p>
          </div>
        </div>
        <dl className="cal-dialog-facts">
          <div><dt>Sự kiện:</dt><dd>{ev.title}</dd></div>
          <div><dt>Thời gian:</dt><dd>{hm(ev.startAt)} · {dmy(ev.startAt)}</dd></div>
        </dl>
        <div className="cal-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Huỷ</button>
          <button type="button" className="btn cal-btn-danger" onClick={onConfirm} disabled={busy}>
            <Icon name="delete" size="sm" /> {busy ? 'Đang xoá…' : 'Xoá sự kiện'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CalendarEventPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [ev, setEv] = useState(null);
  const [error, setError] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setEv(await getClassEvent(eventId));
    } catch (err) {
      setError(errorText(err));
    }
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  async function remove() {
    setBusy(true);
    try {
      await deleteClassEvent(eventId);
      toast('Đã xoá sự kiện.');
      navigate(`/calendar?date=${ev.startAt.slice(0, 10)}`);
    } catch (err) {
      toast(errorText(err), { type: 'error' });
      setAsking(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="cal-page">
        <div className="notice amber"><Icon name="error_outline" /><div><p>{error}</p><Link to="/calendar" className="btn btn-secondary">Về lịch lớp</Link></div></div>
      </div>
    );
  }
  if (!ev) return <div className="cal-page" aria-busy="true"><p className="cal-muted">Đang tải…</p></div>;

  const st = styleOf(ev.categoryCode);
  const day = ev.startAt.slice(0, 10);
  const weekNo = weekNumber(day, ev.yearStart);
  const audience = audienceText(ev);
  const reminder = ev.remindedAt ? { tone: 'green', title: 'Đã gửi nhắc', text: `Lúc ${hm(ev.remindedAt)} · ${dmy(ev.remindedAt)}` }
    : !ev.willRemind ? { tone: 'grey', title: 'Không nhắc', text: 'Sự kiện được tạo chưa đủ 1 ngày trước giờ bắt đầu.' }
      : ev.started ? { tone: 'grey', title: 'Không còn nhắc', text: 'Sự kiện đã diễn ra.' }
        : { tone: 'ink', title: 'Sẽ nhắc trước 1 ngày', text: `Khoảng ${hm(ev.startAt)} · ${dmy(addDays(day, -1))}` };

  return (
    <div className="cal-page cal-page-narrow">
      <nav className="cal-crumb" aria-label="Breadcrumb">
        <span>EduConnect</span><span>/</span><span>Học vụ &amp; Lớp</span><span>/</span>
        <Link to={`/calendar?date=${day}`}>Lịch lớp {ev.className}</Link><span>/</span><strong>Chi tiết sự kiện</strong>
      </nav>

      <div className="cal-head">
        <div className="cal-detail-head">
          <div className="cal-chips">
            <span className={`cal-cat tone-${st.tone}`}>{ev.categoryName}</span>
            <span className="cal-chip">Lớp {ev.className}</span>
            {ev.started && <span className="cal-chip">Đã diễn ra</span>}
          </div>
          <h1 className="headline-lg cal-detail-title">{ev.title}</h1>
          <p className="cal-muted cal-small"><Icon name="menu_book" size="sm" /> Môn học: {ev.subjectName ?? 'Chung của lớp (giáo viên chủ nhiệm)'}</p>
        </div>
        {ev.canEdit && (
          <div className="cal-head-actions">
            <button type="button" className="btn cal-btn-text-danger" onClick={() => setAsking(true)}><Icon name="delete" size="sm" /> Xoá sự kiện</button>
            <Link to={`/calendar/events/${ev.eventId}/edit`} className="btn btn-primary"><Icon name="edit_calendar" size="sm" /> Sửa sự kiện</Link>
          </div>
        )}
      </div>
      {ev.isMine && ev.started && <div className="notice"><Icon name="lock" /><p>Sự kiện đã bắt đầu nên không sửa hoặc xoá được nữa.</p></div>}

      <div className="cal-detail-grid">
        <div className="cal-detail-main">
          <section className="cal-panel">
            <div className="cal-facts">
              <div>
                <span className="label-upper">Ngày diễn ra</span>
                <p className="cal-fact">{longDate(day)}</p>
                {weekNo && <span className="cal-muted cal-small">Tuần học thứ {weekNo}</span>}
              </div>
              <div>
                <span className="label-upper">Khung giờ</span>
                <p className="cal-fact cal-mono-ink">{timeRange(ev)}</p>
                {!ev.endAt && <span className="cal-muted cal-small">Chưa ghi giờ kết thúc</span>}
              </div>
              <div>
                <span className="label-upper">Lớp</span>
                <p className="cal-fact">Lớp {ev.className}</p>
                <span className="cal-muted cal-small">{ev.subjectName ?? 'Sự kiện chung'}</span>
              </div>
            </div>
            <div className="cal-creator">
              <span><Icon name="person" size="sm" />Người tạo: <strong>{ev.createdByName}</strong>{ev.isMine ? ' (bạn)' : ''}</span>
              <span className="cal-mono">Tạo lúc {hm(ev.createdAt)} · {dmy(ev.createdAt)}{ev.updatedAt ? ` · sửa lúc ${hm(ev.updatedAt)} · ${dmy(ev.updatedAt)}` : ''}</span>
            </div>
          </section>

          <section className="cal-panel">
            <h2 className="cal-panel-title"><Icon name="groups" />Phạm vi hiển thị</h2>
            <div className="cal-audience">
              <p>{audience ? `${audience}.` : 'Không chọn cả nhóm nào.'} Giáo viên chủ nhiệm và người tạo luôn thấy sự kiện.</p>
              {ev.viewers && ev.viewers.length > 0 && (
                <>
                  <span className="label-upper">Người được chọn riêng ({ev.viewers.length})</span>
                  <ul className="cal-people">
                    {ev.viewers.map((v) => <li key={v.userId}><span className="cal-chip">{KIND[v.kind]}</span>{v.name}</li>)}
                  </ul>
                </>
              )}
            </div>
          </section>

          <section className="cal-panel">
            <h2 className="cal-panel-title"><Icon name="menu_book" />Mô tả &amp; dặn dò</h2>
            <div className="cal-notebook">
              {ev.description ? <p className="cal-reading">{ev.description}</p> : <p className="cal-muted">Không có mô tả.</p>}
            </div>
          </section>
        </div>

        <aside className="cal-detail-side">
          <section className="cal-panel">
            <div className="cal-box-head">
              <h3 className="cal-panel-title"><Icon name="notifications_active" />Nhắc lịch tự động</h3>
              <span className={`cal-state tone-${reminder.tone}`}><i />{reminder.title}</span>
            </div>
            <p className="cal-muted cal-small">Người được xem nhận một thông báo nhắc trước giờ bắt đầu 1 ngày. Khi đổi giờ, hệ thống nhắc lại theo giờ mới (dời sát giờ hơn 1 ngày thì nhắc ngay).</p>
            <div className="cal-remind">
              <span className={`cal-remind-dot tone-${reminder.tone}`}><Icon name={ev.remindedAt ? 'check' : 'schedule'} size="sm" /></span>
              <div><strong>Trước 1 ngày</strong><span>{reminder.text}</span></div>
            </div>
          </section>
          <Link to={`/timetable?classId=${ev.classId}&date=${day}`} className="btn btn-secondary cal-back"><Icon name="calendar_view_week" size="sm" /> Thời khoá biểu ngày này</Link>
          <Link to={`/calendar?date=${day}`} className="btn btn-secondary cal-back"><Icon name="arrow_back" size="sm" /> Về lịch tuần này</Link>
        </aside>
      </div>

      {asking && <DeleteDialog ev={ev} busy={busy} onCancel={() => setAsking(false)} onConfirm={remove} />}
    </div>
  );
}
