import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getTeachingWeek } from '../../api/timetables.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import WeekTimetable, { ViewSwitch, WeekNav } from './WeekTimetable.jsx';
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

  const setParam = (key, value) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set(key, value);
      return n;
    });
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
        {week && <WeekNav week={week} busy={loading} onGo={(d) => setParam('date', d)} />}
      </div>
      {error && <div className="notice amber"><Icon name="error_outline" /><p>{error}</p></div>}
      {week && (
        <div aria-busy={loading}>
          <WeekTimetable week={week} view={view} teacherView secondLine={(l) => `Lớp ${l.className}`} emptyText="Tuần này bạn không có tiết dạy nào." />
        </div>
      )}
    </div>
  );
}
