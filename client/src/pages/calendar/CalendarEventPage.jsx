import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getClassEvent } from '../../api/classEvents.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { addDays, audienceText, dmy, hm, longDate, styleOf, timeRange, weekNumber } from './calendarUtils.js';
import './calendar.css';

// SCR-41 Calendar Event Detail – UC-77, Stitch design.

const KIND = { STUDENT: 'Học sinh', PARENT: 'Phụ huynh', TEACHER: 'Giáo viên' };

export default function CalendarEventPage() {
  const { eventId } = useParams();
  const [ev, setEv] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setEv(await getClassEvent(eventId));
    } catch (err) {
      setError(errorText(err));
    }
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

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
    : !ev.willRemind ? { tone: 'grey', title: 'Không nhắc', text: 'Sự kiện được tạo hoặc dời chưa đủ 1 ngày trước giờ bắt đầu.' }
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
            <p className="cal-muted cal-small">Người được xem nhận một thông báo nhắc trước giờ bắt đầu 1 ngày. Khi đổi giờ, hệ thống nhắc lại theo giờ mới.</p>
            <div className="cal-remind">
              <span className={`cal-remind-dot tone-${reminder.tone}`}><Icon name={ev.remindedAt ? 'check' : 'schedule'} size="sm" /></span>
              <div><strong>Trước 1 ngày</strong><span>{reminder.text}</span></div>
            </div>
          </section>
          <Link to={`/calendar?date=${day}`} className="btn btn-secondary cal-back"><Icon name="arrow_back" size="sm" /> Về lịch tuần này</Link>
        </aside>
      </div>

    </div>
  );
}
