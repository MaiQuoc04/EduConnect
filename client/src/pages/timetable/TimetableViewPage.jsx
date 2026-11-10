import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getClassWeek, getViewableClasses } from '../../api/timetables.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { errorText } from '../../messages.js';
import WeekTimetable, { ViewSwitch, WeekNav, weekNumber } from './WeekTimetable.jsx';
import './timetable.css';

// SCR-29 (School Manager) / SCR-45 Timetable View, SCR-46 detail – UC-74 View Class Timetable (FE-10).
// Student: own class. Parent: picks a child first. Teacher: homeroom class and classes they teach. School Manager:
// any class (opened from Timetable Management with ?classId=). The server checks the data scope of every request.
// View: ?view=day|week (default: week for School Manager and teachers, day for students and parents).

const RELATION = { HOMEROOM: 'Chủ nhiệm', TEACHING: 'Giảng dạy' };

// Most used room of the week = the class's usual room.
function usualRoom(lessons) {
  const n = {};
  for (const l of lessons) if (l.room) n[l.room] = (n[l.room] ?? 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export default function TimetableViewPage() {
  const { activeRole } = useAuth();
  const [params, setParams] = useSearchParams();
  const [options, setOptions] = useState(null);
  const [week, setWeek] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isManager = activeRole === 'SCHOOL_MANAGER';
  const isParent = activeRole === 'PARENT';
  const classId = params.get('classId') ?? '';
  const date = params.get('date') ?? '';
  const view = params.get('view') ?? (isManager || activeRole === 'TEACHER' ? 'week' : 'day');

  useEffect(() => {
    getViewableClasses()
      .then((data) => {
        setOptions(data);
        if (!params.get('classId') && data.items.length) {
          setParams((p) => {
            const n = new URLSearchParams(p);
            n.set('classId', String(data.items[0].classId));
            return n;
          }, { replace: true });
        }
      })
      .catch((err) => setError(errorText(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError('');
    try {
      setWeek(await getClassWeek(classId, date || undefined));
    } catch (err) {
      setWeek(null);
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [classId, date]);
  useEffect(() => { load(); }, [load]);

  const setParam = (key, value) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set(key, value);
      return n;
    });

  const items = options?.items ?? [];
  const label = (it) =>
    isParent ? `${it.studentName} (${it.className})` : `Lớp ${it.className}${RELATION[it.relation] ? ` · ${RELATION[it.relation]}` : ''}`;
  const current = items.find((it) => String(it.classId) === classId);
  const room = useMemo(() => (week ? usualRoom(week.lessons) : null), [week]);
  const cls = week?.class;
  const weekNo = week ? weekNumber(week.weekStart, cls.schoolYear.startDate) : null;

  const title = cls ? (isParent || activeRole === 'STUDENT' ? 'Thời khoá biểu học sinh' : `Thời khoá biểu lớp ${cls.className}`) : 'Thời khoá biểu';
  const crumbs = isManager
    ? [<span key="a">EduConnect</span>, <span key="b">Đào tạo</span>, <Link key="c" to="/timetables">Thời khoá biểu</Link>, <strong key="d">{cls ? `Lớp ${cls.className}` : 'Xem'}</strong>]
    : isParent
      ? [<span key="a">Phụ huynh</span>, current && <span key="b">{current.studentName} ({current.className})</span>, <strong key="c">Thời khoá biểu</strong>]
      : [<span key="a">EduConnect</span>, <strong key="b">Thời khoá biểu</strong>];

  const picker = (
    <label className="tt-select">
      <span className="label-upper">{isParent ? 'Con' : 'Lớp'}</span>
      <select value={classId} onChange={(e) => setParam('classId', e.target.value)} disabled={!items.length}>
        {!current && classId && <option value={classId}>{cls ? `Lớp ${cls.className}` : 'Lớp đã chọn'}</option>}
        {items.map((it) => (
          <option key={`${it.classId}-${it.studentName ?? ''}`} value={it.classId}>{label(it)}</option>
        ))}
      </select>
      <Icon name="unfold_more" size="sm" />
    </label>
  );

  return (
    <div className="tt-page">
      <nav className="tt-crumb" aria-label="Breadcrumb">
        {crumbs.filter(Boolean).flatMap((c, i) => (i ? [<span key={`s${i}`} className="tt-crumb-sep">/</span>, c] : [c]))}
      </nav>

      <div className="tt-head">
        <div>
          <div className="tt-title-row">
            <h1 className="headline-lg">{title}</h1>
            {cls && <span className="stamp"><Icon name="verified" size="sm" />Năm học {cls.schoolYear.name}</span>}
          </div>
          <p>
            {cls
              ? (isManager
                ? [`Khối ${cls.gradeName}`, cls.trackName, 'Bấm vào một tiết để xem chi tiết']
                : [isParent || activeRole === 'STUDENT' ? `Lớp ${cls.className}` : null, room && `Phòng học: ${room}`, cls.homeroomTeacher && `Giáo viên chủ nhiệm: ${cls.homeroomTeacher}`])
                .filter(Boolean).join(' · ')
              : isParent ? 'Chọn con để xem thời khoá biểu của lớp.' : 'Lịch học theo tuần.'}
          </p>
        </div>
        <div className="tt-head-actions">
          {!isManager && <ViewSwitch view={view} onChange={(v) => setParam('view', v)} />}
          {isManager && classId && (
            <Link to={`/timetables/classes/${classId}/edit`} className="btn btn-primary"><Icon name="edit_calendar" size="sm" /> Sửa thời khoá biểu</Link>
          )}
        </div>
      </div>

      <div className="tt-toolbar">
        <div className="tt-toolbar-left">
          {picker}
          {isManager && cls && (
            <span className="tt-toolbar-meta">
              {room && <>Phòng học: <strong>{room}</strong> · </>}GVCN: <strong>{cls.homeroomTeacher ?? 'Chưa phân công'}</strong>
            </span>
          )}
          {isManager && <ViewSwitch view={view} onChange={(v) => setParam('view', v)} />}
        </div>
        {week && <WeekNav week={week} busy={loading} weekNo={weekNo} onGo={(d) => setParam('date', d)} />}
      </div>

      {options && !items.length && !classId && (
        <div className="notice"><Icon name="info" />
          <p>{isParent ? 'Tài khoản chưa được liên kết với học sinh nào đang học trong năm học này.' : 'Bạn chưa thuộc lớp nào trong năm học này.'}</p>
        </div>
      )}
      {error && <div className="notice amber"><Icon name="error_outline" /><p>{error}</p></div>}
      {week && (
        <div aria-busy={loading}>
          <WeekTimetable
            week={week}
            view={view}
            secondLine={(l) => l.teacherName}
            emptyText="Tuần này lớp chưa có tiết học nào trên thời khoá biểu."
            aside={cls?.homeroomTeacher ? (
              <div className="card tt-side-note">
                <span className="label-upper">Chủ nhiệm</span>
                <p className="tt-detail-strong">{cls.homeroomTeacher}</p>
                <p className="caption">Lớp {cls.className} · Năm học {cls.schoolYear.name}</p>
              </div>
            ) : null}
          />
        </div>
      )}
    </div>
  );
}
