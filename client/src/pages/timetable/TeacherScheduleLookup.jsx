import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTeacherWeek } from '../../api/timetables.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { foldVietnamese } from '../../utils/teacherValidation.js';
import { EmptyWeekJump, TeachingOverview } from './TeachingOverview.jsx';
import WeekTimetable, { ViewSwitch, WeekNav } from './WeekTimetable.jsx';
import './timetable.css';

// "Tra cứu lịch dạy" on the teaching assignment screen (School Manager – Dung, 18/11/2026): type a teacher's name,
// code, department or subject, pick one and see their teaching schedule week by week (the same lessons the teacher
// sees on SCR-57). `teachers` / `subjects` come from the teaching board already loaded by the page.
const MAX_HITS = 8;

export default function TeacherScheduleLookup({ teachers = [], subjects = [], onClose }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState(null);
  const [date, setDate] = useState('');
  const [view, setView] = useState('week');
  const [week, setWeek] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const subjectName = useMemo(() => new Map(subjects.map((s) => [String(s.subjectId), s.name])), [subjects]);
  const rows = useMemo(() => teachers.map((t) => {
    const names = (t.subjectIds ?? []).map((id) => subjectName.get(String(id))).filter(Boolean);
    const split = (v) => foldVietnamese(v ?? '').split(/[\s,–-]+/).filter(Boolean);
    return { ...t, subjectNames: names, nameWords: split(t.fullName), code: foldVietnamese(t.teacherCode ?? ''),
      subjectWords: split(names.join(' ')), deptWords: split(t.department) };
  }), [teachers, subjectName]);
  // Every typed word must match; a name word counts most (whole word > start of a word), then the code, the
  // subjects and the department – so "Hoa" lists Lê Thị Hoa before teachers of "Hoá học" or "Khoa học".
  const hits = useMemo(() => {
    const words = foldVietnamese(query.trim()).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const score = (r, w) => Math.max(
      r.nameWords.includes(w) ? 6 : r.nameWords.some((x) => x.startsWith(w)) ? 4 : 0,
      r.code.includes(w) ? 5 : 0,
      r.subjectWords.includes(w) ? 3 : r.subjectWords.some((x) => x.startsWith(w)) ? 2 : 0,
      r.deptWords.some((x) => x.startsWith(w)) ? 1 : 0,
    );
    return rows
      .map((r) => ({ r, s: words.map((w) => score(r, w)) }))
      .filter((x) => x.s.every((v) => v > 0))
      .map((x) => ({ ...x.r, rank: x.s.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.rank - a.rank || a.fullName.localeCompare(b.fullName, 'vi'))
      .slice(0, MAX_HITS);
  }, [rows, query]);

  useEffect(() => {
    if (!picked) return undefined;
    let alive = true;
    setLoading(true);
    setError('');
    getTeacherWeek(picked.teacherId, date || undefined)
      .then((w) => alive && setWeek(w))
      .catch((err) => alive && setError(errorText(err)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [picked, date]);

  // A teacher without lessons this week: open the first week that has one (once per pick).
  const autoJump = useRef(null);
  useEffect(() => {
    if (!week || !picked || autoJump.current !== picked.teacherId) return;
    autoJump.current = null;
    const first = week.overview?.firstLessonDate;
    if (!date && week.lessons.length === 0 && first) setDate(first);
  }, [week, picked, date]);

  function choose(t) {
    autoJump.current = t.teacherId;
    setDate('');
    setPicked(t);
    setWeek(null);
    setQuery(t.fullName);
    setOpen(false);
  }
  function onKey(e) {
    if (!hits.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => (i + 1) % hits.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + hits.length) % hits.length); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(hits[active] ?? hits[0]); }
    else if (e.key === 'Escape') setOpen(false);
  }

  const t = week?.teacher;
  return (
    <section className="card tsl" aria-labelledby="tsl-title">
      <div className="tsl-head">
        <h2 id="tsl-title" className="title-md"><Icon name="person_search" size="sm" /> Tra cứu lịch dạy giáo viên</h2>
        {onClose && <button type="button" className="btn btn-tertiary" onClick={onClose}>Đóng</button>}
      </div>
      <div className="tsl-search">
        <Icon name="search" size="sm" />
        <input ref={inputRef} className="tsl-input" value={query} placeholder="Nhập tên, mã GV, tổ hoặc môn (ví dụ: Hoa, GV0114, Ngữ văn)…"
          role="combobox" aria-expanded={open && hits.length > 0} aria-controls="tsl-list" aria-autocomplete="list"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey} />
        {query && <button type="button" className="tsl-clear" aria-label="Xoá ô tìm" onClick={() => { setQuery(''); setOpen(true); inputRef.current?.focus(); }}><Icon name="close" size="sm" /></button>}
        {open && query.trim() && (
          <ul id="tsl-list" className="tsl-list" role="listbox">
            {hits.length === 0 && <li className="tsl-none">Không tìm thấy giáo viên phù hợp.</li>}
            {hits.map((h, i) => (
              <li key={h.teacherId} role="option" aria-selected={i === active}>
                <button type="button" className={`tsl-hit${i === active ? ' is-active' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(h)}>
                  <strong>{h.fullName}</strong>
                  <span>{h.teacherCode}{h.department ? ` · ${h.department}` : ''}{h.status === 'LOCKED' ? ' · Đã khoá' : ''}</span>
                  <em>{h.subjectNames.join(', ') || 'Chưa có môn'}</em>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!picked && <p className="caption tt-muted">Chọn một giáo viên để xem các tiết họ dạy theo từng tuần (lấy từ thời khoá biểu các lớp và phân công giảng dạy).</p>}
      {error && <div className="notice amber"><Icon name="error_outline" /><p>{error}</p></div>}
      {picked && week && (
        <>
          <div className="tsl-who">
            <div>
              <strong>{t.fullName}</strong>
              <span className="tt-muted"> · {t.teacherCode}{t.department ? ` · ${t.department}` : ''}{t.homeroomClass ? ` · GVCN ${t.homeroomClass}` : ''}{t.status === 'LOCKED' ? ' · Đã khoá' : ''}</span>
              <p className="caption tt-muted">Môn: {t.subjects || 'chưa có'} · Trong tuần: <strong>{week.periodsThisWeek}</strong> tiết{week.classesThisWeek.length ? ` · ${week.classesThisWeek.length} lớp: ${week.classesThisWeek.join(', ')}` : ''}</p>
            </div>
            <div className="tsl-tools">
              <ViewSwitch view={view} onChange={setView} />
              <WeekNav week={week} busy={loading} onGo={setDate} />
            </div>
          </div>
          <TeachingOverview week={week} onGo={setDate} who={t.fullName} />
          <EmptyWeekJump week={week} onGo={setDate} who={t.fullName} />
          <div aria-busy={loading}>
            <WeekTimetable week={week} view={view} teacherView mineTag={false} secondLine={(l) => `Lớp ${l.className}`}
              emptyText={null}
              lessonActions={(l) => <Link to={`/timetable?classId=${l.classId}&date=${l.date}`} className="btn btn-secondary"><Icon name="calendar_view_week" size="sm" /> TKB lớp {l.className}</Link>} />
          </div>
        </>
      )}
      {picked && !week && !error && <p className="tt-muted">Đang tải lịch dạy…</p>}
    </section>
  );
}
