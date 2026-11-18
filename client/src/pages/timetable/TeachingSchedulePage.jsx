import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getTeachingWeek } from '../../api/timetables.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import LessonCalendarLinks from '../calendar/LessonCalendarLinks.jsx';
import { EmptyWeekJump, TeachingOverview } from './TeachingOverview.jsx';
import WeekTimetable, { dmy, ViewSwitch, WeekNav } from './WeekTimetable.jsx';
import './timetable.css';

// SCR-57 Teaching Schedule, SCR-58 detail – UC-75 (FE-10). Built automatically: the lessons of the class timetables
// whose teacher is the signed-in teacher (each lesson follows the teaching assignment of its date).
export default function TeachingSchedulePage() {
  const [params, setParams] = useSearchParams();
  const [week, setWeek] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const date = params.get('date') ?? '';
  const view = params.get('view') ?? 'week';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setWeek(await getTeachingWeek(date || undefined));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [date]);
  useEffect(() => { load(); }, [load]);

  const setParam = (key, value, replace = false) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set(key, value);
      return n;
    }, { replace });
  const go = (d) => { setJumped(null); setParam('date', d); };

  // Opening "Lịch dạy" on a week without lessons jumps once to the first week that has one (from today), so a teacher
  // who teaches only in a few months does not have to page through empty weeks. Dung, 18/11/2026.
  const [jumped, setJumped] = useState(null);
  const autoDone = useRef(false);
  useEffect(() => {
    if (!week || autoDone.current) return;
    autoDone.current = true;
    const first = week.overview?.firstLessonDate;
    if (!date && week.lessons.length === 0 && first) {
      setJumped(week.weekStart);
      setParam('date', first, true);
    }
  }, [week]); // eslint-disable-line react-hooks/exhaustive-deps
  const classes = week ? [...new Set(week.lessons.map((l) => l.className))] : [];
  const todayCount = week ? week.lessons.filter((l) => l.date === week.today).length : 0;

  return (
    <div className="tt-page">
      <nav className="tt-crumb" aria-label="Breadcrumb">
        <span>EduConnect</span><span className="tt-crumb-sep">/</span><strong>Lịch dạy</strong>
      </nav>
      <div className="tt-head">
        <div>
          <h1 className="headline-lg">Lịch dạy của tôi</h1>
          <p>Tự tạo từ thời khoá biểu các lớp và phân công giảng dạy. Bấm vào một tiết để xem chi tiết.</p>
        </div>
        <div className="tt-head-actions">
          <ViewSwitch view={view} onChange={(v) => setParam('view', v)} />
        </div>
      </div>
      <div className="tt-toolbar">
        <div className="tt-toolbar-left">
          <span className="tt-toolbar-meta">
            {week ? (
              <>
                <strong>{week.periodsThisWeek}</strong> tiết trong tuần
                {todayCount ? <> · hôm nay <strong>{todayCount}</strong> tiết</> : null}
                {classes.length ? <> · {classes.length} lớp: <strong>{classes.join(', ')}</strong></> : null}
              </>
            ) : 'Đang tải…'}
          </span>
        </div>
        {week && <WeekNav week={week} busy={loading} onGo={go} />}
      </div>
      {jumped && week && week.lessons.length > 0 && (
        <div className="notice tov-jump" role="status">
          <Icon name="fast_forward" />
          <div>
            <p>Tuần {dmy(jumped)} bạn không có tiết dạy nào, nên đang hiện tuần có tiết gần nhất ({dmy(week.weekStart)} – {dmy(week.days[5])}).</p>
            <div className="tov-jump-actions"><button type="button" className="btn btn-secondary" onClick={() => go(jumped)}>Về tuần này</button></div>
          </div>
        </div>
      )}
      {week && <TeachingOverview week={week} onGo={go} />}
      {week && <EmptyWeekJump week={week} onGo={go} />}
      {error && <div className="notice amber"><Icon name="error_outline" /><p>{error}</p></div>}
      {week && (
        <div aria-busy={loading}>
          <WeekTimetable week={week} view={view} teacherView mineTag={false} secondLine={(l) => `Lớp ${l.className}`} emptyText={null}
            lessonActions={(l) => (
              <>
                {/* FE-12 (Quoc, 18/11/2026): take / view the attendance of this period (SCR-56). */}
                <Link to={`/attendance?date=${l.date}&lesson=${l.lessonId}`} className="btn btn-primary"><Icon name="fact_check" size="sm" /> Điểm danh</Link>
                <LessonCalendarLinks lesson={l} canCreate />
                <Link to={`/timetable?classId=${l.classId}&date=${l.date}`} className="btn btn-secondary"><Icon name="calendar_view_week" size="sm" /> TKB lớp {l.className}</Link>
              </>
            )} />
        </div>
      )}
    </div>
  );
}
