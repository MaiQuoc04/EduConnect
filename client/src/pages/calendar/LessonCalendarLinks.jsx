import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';

// FE-10: links from a lesson (timetable lesson detail) to the class calendar of that day and, for a teacher, to a new
// event prefilled with the class, subject, date and the lesson's time (e.g. a 15-minute test in that period).
export default function LessonCalendarLinks({ lesson, canCreate }) {
  const q = `classId=${lesson.classId}&date=${lesson.date}`;
  return (
    <>
      <Link to={`/calendar?${q}&view=day`} className="btn btn-secondary"><Icon name="event" size="sm" /> Lịch lớp ngày này</Link>
      {canCreate && (
        <Link to={`/calendar/events/new?${q}&start=${lesson.start}&end=${lesson.end}&subjectId=${lesson.subjectId}`} className="btn btn-secondary">
          <Icon name="add" size="sm" /> Tạo sự kiện cho tiết này
        </Link>
      )}
    </>
  );
}
