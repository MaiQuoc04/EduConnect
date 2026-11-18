import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listAttendanceClasses, listClassLessons, listMyLessons } from '../../api/attendance.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { errorText } from '../../messages.js';
import AttendanceSheet from './AttendanceSheet.jsx';
import { addDays, dmy, SemesterSelect, STATUS, useAttendanceOptions, weekday } from './attendanceShared.jsx';
import ClassReport from './ClassReport.jsx';
import './attendance.css';

// SCR-56 Class Attendance (teacher) and SCR-52 Attendance Correction (School Manager) – UC-90, UC-91, UC-93.
// Tab "Theo ngày": a class (teacher: or "Tiết dạy của tôi") and a day → its periods → the sheet of one period.
// Tab "Tổng hợp lớp": per student totals of a semester (ClassReport). Everything lives in the URL
// (?tab=&classId=&date=&lesson=&semesterId=&from=&to=), so the lesson detail of the teaching schedule can link here.

function useParamsUpdate() {
  const [params, setParams] = useSearchParams();
  const update = useCallback(
    (changes) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(changes)) (v ? next.set(k, String(v)) : next.delete(k));
      setParams(next, { replace: true });
    },
    [setParams],
  );
  return [params, update];
}

function LessonItem({ lesson, active, onOpen, showClass }) {
  const c = lesson.counts;
  const absent = c ? c.ABSENT_EXCUSED + c.ABSENT_UNEXCUSED : 0;
  return (
    <li>
      <button type="button" className={`att-lesson${active ? ' is-active' : ''}`} onClick={() => onOpen(lesson)} aria-current={active || undefined}>
        <span className="att-lesson-period">
          <strong>Tiết {lesson.period}</strong>
          <span className="caption muted">
            {lesson.start}–{lesson.end}
          </span>
        </span>
        <span className="att-lesson-main">
          <strong>
            {lesson.subjectName}
            {showClass && ` · ${lesson.className}`}
          </strong>
          <span className="caption muted">{lesson.mine ? 'Tiết của bạn' : lesson.teacherName}</span>
          {lesson.taken ? (
            <span className="caption att-lesson-counts">
              {absent > 0 && <span className="att-red">Vắng {absent}</span>}
              {c.LATE > 0 && <span className="att-amber">Muộn {c.LATE}</span>}
              {absent === 0 && c.LATE === 0 && <span className="att-green">Đủ lớp</span>}
            </span>
          ) : null}
        </span>
        <span className={`stamp${lesson.taken ? '' : ' stamp-soft'} att-lesson-stamp`}>
          {lesson.taken ? 'Đã điểm danh' : lesson.started ? 'Chưa điểm danh' : 'Chưa đến giờ'}
        </span>
      </button>
    </li>
  );
}

export default function ClassAttendancePage() {
  const { activeRole } = useAuth();
  const isManager = activeRole === 'SCHOOL_MANAGER';
  const options = useAttendanceOptions();
  const [params, update] = useParamsUpdate();
  const tab = params.get('tab') === 'report' ? 'report' : 'day';
  const today = options.data?.today ?? '';
  const date = params.get('date') || today;
  const classId = params.get('classId') ?? '';
  const lessonId = params.get('lesson') ?? '';
  const semesterId = params.get('semesterId') || String(options.data?.currentSemesterId ?? '');

  const [classes, setClasses] = useState({ items: [], error: '' });
  useEffect(() => {
    listAttendanceClasses()
      .then((d) => setClasses({ items: d.items, error: '' }))
      .catch((err) => setClasses({ items: [], error: errorText(err) }));
  }, []);
  // School Manager has no "my periods": open the first class.
  useEffect(() => {
    if (isManager && !classId && classes.items.length) update({ classId: classes.items[0].classId });
  }, [isManager, classId, classes.items, update]);

  const [day, setDay] = useState({ loading: false, data: null, error: '' });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (tab !== 'day' || !date || (isManager && !classId)) return undefined;
    let alive = true;
    setDay((s) => ({ ...s, loading: true, error: '' }));
    (classId ? listClassLessons(classId, date) : listMyLessons(date))
      .then((data) => alive && setDay({ loading: false, data, error: '' }))
      .catch((err) => alive && setDay({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [tab, classId, date, isManager, reload]);

  // Unsaved changes on the open sheet: ask before opening another period / day / class.
  const dirty = useRef(false);
  const onDirty = useCallback((v) => {
    dirty.current = v;
  }, []);
  const go = (changes) => {
    if (dirty.current && !window.confirm('Bảng điểm danh đang có thay đổi chưa lưu. Bỏ các thay đổi này?')) return;
    dirty.current = false;
    update(changes);
  };

  const title = isManager ? 'Sửa điểm danh' : 'Điểm danh lớp';
  const lessons = day.data?.items ?? [];
  const classOptions = classes.items;

  return (
    <div className="att-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Điểm danh</span>/<span className="current">{title}</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">{title}</h1>
          <p>
            {isManager
              ? 'Xem và sửa điểm danh của mọi lớp, nhập bù các tiết giáo viên chưa điểm danh. Mỗi thay đổi cần ghi lý do.'
              : `Điểm danh các tiết bạn dạy trong ngày, sửa được đến ${options.data?.deadline ?? '23:59'} cùng ngày. Giáo viên chủ nhiệm đổi được vắng có phép và không phép.`}
          </p>
        </div>
      </div>

      <div className="tabs att-tabs" role="tablist" aria-label="Chế độ xem">
        <button type="button" role="tab" aria-selected={tab === 'day'} onClick={() => go({ tab: null })}>
          Theo ngày
        </button>
        <button type="button" role="tab" aria-selected={tab === 'report'} onClick={() => go({ tab: 'report', lesson: null })}>
          Tổng hợp lớp
        </button>
      </div>

      {(options.error || classes.error) && <p className="form-error" role="alert">{options.error || classes.error}</p>}

      {tab === 'day' ? (
        <>
          <div className="att-filters">
            <label className="field" htmlFor="att-class">
              <span className="field-label">Lớp</span>
              <select id="att-class" className="input" value={classId} onChange={(e) => go({ classId: e.target.value, lesson: null })}>
                {!isManager && <option value="">Tiết dạy của tôi</option>}
                {classOptions.map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.className}
                    {c.isHomeroom ? ' (chủ nhiệm)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <label className="field-label" htmlFor="att-date">Ngày</label>
              <div className="att-date">
                <button type="button" className="btn btn-icon" aria-label="Ngày trước" onClick={() => go({ date: addDays(date, -1), lesson: null })} disabled={!date}>
                  <Icon name="chevron_left" />
                </button>
                <input id="att-date" type="date" className="input" value={date} onChange={(e) => e.target.value && go({ date: e.target.value, lesson: null })} />
                <button type="button" className="btn btn-icon" aria-label="Ngày sau" onClick={() => go({ date: addDays(date, 1), lesson: null })} disabled={!date}>
                  <Icon name="chevron_right" />
                </button>
                {date !== today && (
                  <button type="button" className="btn btn-tertiary" onClick={() => go({ date: null, lesson: null })}>
                    Hôm nay
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="att-layout">
            <section className="att-lessons" aria-label="Các tiết trong ngày">
              <h2 className="title-sm">
                {date ? `${weekday(date)}, ${dmy(date)}` : ''}
                {day.data?.scope === 'SUBJECTS' && <span className="caption muted"> · các môn bạn dạy</span>}
              </h2>
              {day.error && <p className="form-error" role="alert">{day.error}</p>}
              {!day.error && day.data && lessons.length === 0 && (
                <p className="muted att-empty">{classId ? 'Không có tiết nào của lớp trong ngày này.' : 'Bạn không có tiết dạy nào trong ngày này.'}</p>
              )}
              <ul className={`att-lesson-list${day.loading ? ' is-refreshing' : ''}`}>
                {lessons.map((l) => (
                  <LessonItem key={l.lessonId} lesson={l} active={String(l.lessonId) === lessonId} showClass={!classId} onOpen={(x) => go({ lesson: x.lessonId })} />
                ))}
              </ul>
              <p className="caption muted att-legend">
                {Object.values(STATUS).map((s) => (
                  <span key={s.label} className={`att-dot is-${s.tone}`}>{s.label}</span>
                ))}
              </p>
            </section>
            <div className="att-sheet-col">
              {lessonId ? (
                <AttendanceSheet key={lessonId} lessonId={lessonId} onDirty={onDirty} onSaved={() => setReload((n) => n + 1)} />
              ) : (
                <div className="card card-outline att-placeholder">
                  <Icon name="fact_check" />
                  <p className="muted">Chọn một tiết để điểm danh hoặc xem điểm danh.</p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="att-filters">
            <label className="field" htmlFor="att-rclass">
              <span className="field-label">Lớp</span>
              <select id="att-rclass" className="input" value={classId} onChange={(e) => update({ classId: e.target.value })}>
                <option value="">Chọn lớp</option>
                {classOptions.map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.className}
                    {c.isHomeroom ? ' (chủ nhiệm)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <SemesterSelect semesters={options.semesters} value={semesterId} onChange={(v) => update({ semesterId: v, from: null, to: null })} />
            <label className="field" htmlFor="att-from">
              <span className="field-label">Từ ngày</span>
              <input id="att-from" type="date" className="input" value={params.get('from') ?? ''} onChange={(e) => update({ from: e.target.value })} />
            </label>
            <label className="field" htmlFor="att-to">
              <span className="field-label">Đến ngày</span>
              <input id="att-to" type="date" className="input" value={params.get('to') ?? ''} onChange={(e) => update({ to: e.target.value })} />
            </label>
          </div>
          <section className="card card-outline">
            <ClassReport classId={classId} semesterId={semesterId} from={params.get('from') ?? ''} to={params.get('to') ?? ''} />
          </section>
        </>
      )}
    </div>
  );
}
