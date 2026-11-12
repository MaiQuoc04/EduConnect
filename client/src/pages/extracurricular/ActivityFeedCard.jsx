import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { at, countText, daysLeft, dm, stateOf, whenText } from './activityUtils.js';
import './extracurricular.css';

// FE-07: the activity part of its post in the class feed (FE-05 PostCard). The post's text is the description;
// this card adds the title, time, place, deadline and registrations, and opens the detail (UC-53).
export default function ActivityFeedCard({ activity }) {
  const st = stateOf(activity);
  const left = st.key === 'open' ? daysLeft(activity.registrationDeadline) : 0;
  return (
    <section className="xa-feed-card" aria-label={`Hoạt động ngoại khoá: ${activity.title}`}>
      <div className="xa-feed-top">
        <span className="xa-flag"><Icon name="hiking" size="sm" /> Ngoại khoá · Hạn {dm(activity.registrationDeadline)}</span>
        <span className={`xa-chip tone-${st.tone}`}>{st.label}{left > 0 && ` · còn ${left} ngày`}</span>
      </div>
      <h3 className="xa-feed-title">{activity.title}</h3>
      <dl className="xa-feed-facts">
        <div><dt><Icon name="calendar_month" size="sm" /> Thời gian:</dt><dd>{whenText(activity)}</dd></div>
        {activity.location && <div><dt><Icon name="location_on" size="sm" /> Địa điểm:</dt><dd>{activity.location}</dd></div>}
        <div><dt><Icon name="event_busy" size="sm" /> Hạn đăng ký:</dt><dd>{at(activity.registrationDeadline)}</dd></div>
        <div><dt><Icon name="how_to_reg" size="sm" /> Đã đăng ký:</dt><dd>{countText(activity)}{activity.capacity ? ' học sinh' : ' học sinh (không giới hạn)'}</dd></div>
      </dl>
      <Link to={`/extracurricular/${activity.eventId}`} className="btn btn-primary xa-feed-btn">
        {st.key === 'open' ? 'Xem chi tiết & đăng ký' : 'Xem chi tiết'} <Icon name="arrow_forward" size="sm" />
      </Link>
    </section>
  );
}
