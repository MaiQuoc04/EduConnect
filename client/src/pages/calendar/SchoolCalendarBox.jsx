import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUpcomingSchoolEvents } from '../../api/schoolEvents.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { timeRange } from './calendarUtils.js';
import './schoolCalendar.css';

// "Lịch sắp tới của trường" (Stitch SCR-34 right column, FE-08 school feed) – FE-10 school calendar, Dung. The next
// school-wide dates for this viewer (students / parents: whole school + their grades). The School Manager manages
// them on /school-events.
export default function SchoolCalendarBox({ limit = 5 }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    getUpcomingSchoolEvents(limit).then((d) => alive && setData(d)).catch((err) => alive && setError(err));
    return () => { alive = false; };
  }, [limit]);

  if (error) {
    return <p className="caption muted sc-box-note">{error.code === 'MSG_SCHOOL_EVENTS_NOT_READY' ? 'Lịch của trường chưa sẵn sàng.' : errorText(error)}</p>;
  }
  if (!data) return <p className="caption muted sc-box-note" aria-busy="true">Đang tải…</p>;
  return (
    <div className="sc-box">
      {data.events.length === 0 ? (
        <p className="caption muted sc-box-note">Chưa có lịch sắp tới.</p>
      ) : (
        <ul className="sc-box-list">
          {data.events.map((ev) => (
            <li key={ev.eventId}>
              <Link to={`/school-events?event=${ev.eventId}`} className="sc-box-item">
                <span className="sc-date"><strong>{ev.startAt.slice(8, 10)}</strong><span>TH{ev.startAt.slice(5, 7)}</span></span>
                <span className="sc-box-main">
                  <span className="sc-box-title">{ev.title}</span>
                  <span className="caption muted">{timeRange(ev)} · {ev.location ? `${ev.location} · ` : ''}{ev.audience}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="sc-box-foot">
        <Link to="/school-events" className="sc-box-link">Xem lịch của trường <Icon name="arrow_forward" size="sm" /></Link>
        {data.canManage && <Link to="/school-events?new=1" className="sc-box-link"><Icon name="add" size="sm" /> Thêm</Link>}
      </div>
    </div>
  );
}
