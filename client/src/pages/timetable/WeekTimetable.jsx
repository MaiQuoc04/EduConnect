import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';

// Shared views of FE-10 (Stitch "Ink & Paper" designs): week grid (SCR-29 / SCR-45 "Tuần"), day timeline with the
// week matrix (SCR-45 "Hôm nay"), lesson detail (SCR-46 / SCR-58). Used by the class timetable and the teaching
// schedule. Phones (≤ 720px, required for Timetable View) always get the day timeline.

export const WEEKDAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
export const WEEKDAY_LONG = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];
export const dm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
export const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export const isMorning = (period) => period <= 5;

const dayIndex = (iso) => (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
const nowHM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// Week number inside the school year (week of the year's first day = week 1).
export function weekNumber(weekStart, yearStart) {
  if (!weekStart || !yearStart) return null;
  const monday = new Date(`${yearStart}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const n = Math.floor((new Date(`${weekStart}T00:00:00Z`) - monday) / (7 * 86400000)) + 1;
  return n >= 1 ? n : null;
}

// "Toán" -> "Toán", "Ngữ văn" -> "NV", "Giáo dục thể chất" -> "GDTC" (week matrix cells).
export function shortName(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].length <= 4 ? words[0] : words[0].slice(0, 3);
  return words.map((w) => w[0].toUpperCase()).join('').slice(0, 4);
}

// Clash items of a save / import (one per date) grouped per weekday + period + teacher + other class.
export function groupClashes(items = []) {
  const groups = new Map();
  for (const p of items) {
    const k = `${dayIndex(p.date)}|${p.period}|${p.teacher}|${p.otherClass}`;
    const g = groups.get(k);
    if (g) {
      g.count += 1;
      if (p.date < g.from) g.from = p.date;
      if (p.date > g.to) g.to = p.date;
    } else groups.set(k, { ...p, weekday: dayIndex(p.date), from: p.date, to: p.date, count: 1 });
  }
  return [...groups.values()].sort((a, b) => a.weekday - b.weekday || a.period - b.period);
}
export const clashWhen = (g) =>
  `${WEEKDAY_LONG[g.weekday]} · Tiết ${g.period}${g.count > 1 ? ` (${g.count} tuần, ${dm(g.from)} – ${dm(g.to)})` : ` (${dm(g.from)})`}`;

export function initials(name = '') {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return w.slice(-2).map((x) => x[0].toUpperCase()).join('');
}

// done / live / upcoming for a lesson, from the client clock (Vietnam time on users' devices).
function lessonState(l, today, now) {
  if (l.date < today) return 'done';
  if (l.date > today) return 'upcoming';
  if (l.end <= now) return 'done';
  if (l.start <= now) return 'live';
  return 'upcoming';
}

function useNow() {
  const [now, setNow] = useState(nowHM);
  useEffect(() => {
    const t = setInterval(() => setNow(nowHM()), 60000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function sessionRange(slots, morning) {
  const s = slots.filter((x) => isMorning(x.period) === morning);
  return s.length ? `${s[0].start} – ${s[s.length - 1].end}` : '';
}

// ‹ [Tuần 7 · 19/10 – 24/10/2026] › [Tuần này]
export function WeekNav({ week, onGo, busy, weekNo }) {
  const isThisWeek = week.today >= week.weekStart && week.today <= week.weekEnd;
  const lastDay = week.days[5];
  return (
    <div className="tt-weeknav" role="group" aria-label="Chọn tuần">
      <button type="button" className="tt-navbtn" onClick={() => onGo(week.prevWeek)} disabled={busy} aria-label="Tuần trước" title="Tuần trước">
        <Icon name="chevron_left" size="sm" />
      </button>
      <label className="tt-weeknav-label">
        <Icon name="calendar_today" size="sm" />
        <span>{weekNo ? `Tuần ${weekNo} · ` : ''}{dm(week.weekStart)} – {dmy(lastDay)}</span>
        <input type="date" value={week.weekStart} onChange={(e) => e.target.value && onGo(e.target.value)} aria-label="Chọn ngày" />
      </label>
      <button type="button" className="tt-navbtn" onClick={() => onGo(week.nextWeek)} disabled={busy} aria-label="Tuần sau" title="Tuần sau">
        <Icon name="chevron_right" size="sm" />
      </button>
      {!isThisWeek && (
        <button type="button" className="btn btn-tertiary tt-thisweek" onClick={() => onGo(week.today)} disabled={busy}>Tuần này</button>
      )}
    </div>
  );
}

// Segmented "Hôm nay | Tuần".
export function ViewSwitch({ view, onChange }) {
  return (
    <div className="tt-seg" role="tablist" aria-label="Kiểu xem">
      <button type="button" role="tab" aria-selected={view === 'day'} onClick={() => onChange('day')}>Theo ngày</button>
      <button type="button" role="tab" aria-selected={view === 'week'} onClick={() => onChange('week')}>Tuần</button>
    </div>
  );
}

// SCR-46 / SCR-58 – lesson detail (dialog; bottom sheet on phones).
export function LessonDetail({ lesson, onClose, teacherView }) {
  useEffect(() => {
    if (!lesson) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lesson, onClose]);
  if (!lesson) return null;
  const morning = isMorning(lesson.period);
  return (
    <div className="tt-overlay" onClick={onClose}>
      <div className="tt-detail" role="dialog" aria-modal="true" aria-labelledby="tt-detail-title" onClick={(e) => e.stopPropagation()}>
        <header className="tt-detail-head">
          <div className="tt-detail-title">
            <Icon name="school" />
            <h2 id="tt-detail-title">Chi tiết tiết học</h2>
          </div>
          <button type="button" className="tt-navbtn is-plain" onClick={onClose} aria-label="Đóng"><Icon name="close" size="sm" /></button>
        </header>
        <div className="tt-detail-body">
          <section>
            <span className="label-upper">Thứ &amp; ngày</span>
            <p className="tt-detail-strong">{WEEKDAY_LONG[dayIndex(lesson.date)]}, ngày {dmy(lesson.date)}</p>
            <p className="tt-detail-time"><Icon name="schedule" size="sm" />Tiết {lesson.period} ({lesson.start} – {lesson.end}) · Buổi {morning ? 'sáng' : 'chiều'}</p>
          </section>
          <hr />
          <section>
            <span className="label-upper">Môn học &amp; giảng dạy</span>
            <div className="tt-detail-subject">
              <p className="title-md">{lesson.subjectName}</p>
              <span className="tt-chip-ink">Lớp {lesson.className}</span>
            </div>
            <div className="tt-teacher-card">
              <span className="tt-avatar">{initials(lesson.teacherName)}</span>
              <div>
                <p className="tt-detail-strong">{lesson.teacherName}</p>
                <p className="caption">{teacherView ? 'Tiết dạy của bạn' : 'Giáo viên bộ môn'}</p>
              </div>
            </div>
          </section>
          <section className="tt-detail-boxes">
            <div>
              <span className="caption">Phòng học</span>
              <p className="tt-detail-strong">{lesson.room || '—'}</p>
              {!lesson.room && <p className="tt-detail-note">Chưa xếp phòng</p>}
            </div>
            <div>
              <span className="caption">Điểm danh</span>
              <p className="tt-detail-strong">{lesson.attendanceTaken ? 'Đã điểm danh' : 'Chưa điểm danh'}</p>
              <p className={`tt-detail-note${lesson.attendanceTaken ? ' is-green' : ''}`}>
                {lesson.attendanceTaken ? 'Giáo viên đã ghi nhận' : lesson.date > lessonTodayHint() ? 'Tiết chưa diễn ra' : 'Chưa có dữ liệu'}
              </p>
            </div>
          </section>
        </div>
        <footer className="tt-detail-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Đóng</button>
        </footer>
      </div>
    </div>
  );
}
function lessonTodayHint() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Week grid: periods × Monday..Saturday (Sunday only when it has lessons), with morning / afternoon bands.
function WeekGrid({ week, days, slots, byCell, onPick, secondLine, now }) {
  const groups = [true, false]
    .map((morning) => ({ morning, slots: slots.filter((s) => isMorning(s.period) === morning) }))
    .filter((g) => g.slots.length);
  return (
    <div className="tt-wgrid-wrap">
      <table className="tt-wgrid">
        <thead>
          <tr>
            <th scope="col" className="tt-wgrid-corner">Tiết học</th>
            {days.map((d) => (
              <th key={d} scope="col" className={d === week.today ? 'is-today' : undefined}>
                <span className="tt-day-name">{WEEKDAY_LONG[dayIndex(d)]}{d === week.today && <i className="tt-today-dot" aria-hidden="true" />}</span>
                <span className="tt-day-date">{dmy(d)}{d === week.today ? ' (Hôm nay)' : ''}</span>
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={String(g.morning)}>
            <tr className="tt-band">
              <td colSpan={days.length + 1}>
                <span><Icon name={g.morning ? 'wb_sunny' : 'wb_twilight'} size="sm" />Buổi {g.morning ? 'sáng' : 'chiều'} · {sessionRange(g.slots, g.morning)}</span>
                <span className="caption">{g.slots.length} tiết</span>
              </td>
            </tr>
            {g.slots.map((s) => (
              <tr key={s.slotId}>
                <th scope="row">
                  <span className="tt-period">Tiết {s.period}</span>
                  <span className="tt-time">{s.start} – {s.end}</span>
                </th>
                {days.map((d) => {
                  const l = byCell[`${d}|${s.slotId}`];
                  const state = l ? lessonState(l, week.today, now) : null;
                  return (
                    <td key={d} className={`${d === week.today ? 'is-today' : ''}${state === 'live' ? ' is-live' : ''}`}>
                      {l ? (
                        <button type="button" className="tt-cell" onClick={() => onPick(l)}
                          aria-label={`${l.subjectName}, tiết ${l.period}, ${dmy(d)}, ${secondLine(l)}`}>
                          <span className="tt-cell-top">
                            <span className="tt-cell-subject">{l.subjectName}</span>
                            {l.room && <span className="tt-cell-room">{l.room}</span>}
                          </span>
                          <span className="tt-cell-sub">{secondLine(l)}</span>
                          {state === 'live' && <span className="tt-cell-flag is-live">Đang diễn ra</span>}
                          {state !== 'live' && l.attendanceTaken && <span className="tt-cell-flag is-done">Đã điểm danh</span>}
                        </button>
                      ) : (
                        <span className="tt-cell-empty">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

// Day timeline (SCR-45 "Hôm nay"): morning / noon break / afternoon, with the now line on today.
function DayTimeline({ week, date, lessons, slots, onPick, secondLine, now }) {
  const morning = lessons.filter((l) => isMorning(l.period));
  const afternoon = lessons.filter((l) => !isMorning(l.period));
  const isToday = date === week.today;
  const morningEnd = slots.filter((s) => isMorning(s.period)).at(-1)?.end;
  const afternoonStart = slots.find((s) => !isMorning(s.period))?.start;

  const renderGroup = (items, isAm) => {
    // Now line before the first lesson not finished yet (today only, once lessons have started).
    const firstOpen = isToday ? items.findIndex((l) => lessonState(l, week.today, now) !== 'done') : -1;
    const started = isToday && items.length && items[0].start <= now;
    return (
      <section className="tt-tl-group">
        <div className="tt-tl-head">
          <span><Icon name={isAm ? 'wb_twilight' : 'wb_sunny'} size="sm" /><strong>Buổi {isAm ? 'sáng' : 'chiều'}</strong>
            <span className="caption"> · Bắt đầu từ {items[0].start}</span></span>
          <span className="caption">{items.length} tiết học</span>
        </div>
        <ol className="tt-tl">
          {items.map((l, i) => {
            const state = lessonState(l, week.today, now);
            return (
              <li key={l.lessonId}>
                {started && i === firstOpen && (
                  <div className="tt-nowline" aria-label={`Bây giờ ${now}`}><i /><span>Bây giờ {now}</span></div>
                )}
                <button type="button" className={`tt-tl-item is-${state}`} onClick={() => onPick(l)}>
                  <i className="tt-tl-pin" aria-hidden="true" />
                  <span className="tt-tl-when">
                    <strong>Tiết {l.period}{state === 'live' && <i className="tt-pulse" aria-hidden="true" />}</strong>
                    <span>{l.start} – {l.end}</span>
                    <em>{state === 'done' ? (l.attendanceTaken ? 'Đã điểm danh' : 'Đã qua') : state === 'live' ? 'Đang diễn ra' : 'Sắp diễn ra'}</em>
                  </span>
                  <span className="tt-tl-main">
                    <span className="tt-tl-top">
                      <strong>{l.subjectName}</strong>
                      {l.room && <span className="tt-room-chip">{l.room}</span>}
                    </span>
                    <span>{secondLine(l)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    );
  };

  return (
    <div className="tt-day">
      <div className="tt-day-banner">
        <div className="tt-day-badge"><span>Thứ</span><strong>{dayIndex(date) === 6 ? 'CN' : dayIndex(date) + 2}</strong></div>
        <div className="tt-day-info">
          <strong>{WEEKDAY_LONG[dayIndex(date)]}, ngày {dmy(date)}</strong>
          {isToday && <span className="tt-chip-teal">Hôm nay</span>}
        </div>
        <div className="tt-day-total">
          <span className="caption">Tổng số tiết</span>
          <strong>{String(lessons.length).padStart(2, '0')} tiết{lessons.length ? ` (Sáng ${morning.length} · Chiều ${afternoon.length})` : ''}</strong>
        </div>
      </div>
      {lessons.length === 0 && <p className="tt-day-empty">Không có tiết học trong ngày này.</p>}
      {morning.length > 0 && renderGroup(morning, true)}
      {morning.length > 0 && afternoon.length > 0 && (
        <div className="tt-noon">
          <span><Icon name="bedtime" size="sm" /><strong>Nghỉ trưa</strong><span className="caption"> · {morningEnd} – {afternoonStart}</span></span>
        </div>
      )}
      {afternoon.length > 0 && renderGroup(afternoon, false)}
    </div>
  );
}

// Compact week matrix (right column of the day view); a day header picks the day.
function WeekMatrix({ week, days, slots, byCell, day, onDay, now }) {
  const groups = [true, false]
    .map((morning) => ({ morning, slots: slots.filter((s) => isMorning(s.period) === morning) }))
    .filter((g) => g.slots.length);
  return (
    <div className="tt-matrix card">
      <div className="tt-matrix-head">
        <div>
          <h2 className="title-sm">Lịch tuần này</h2>
          <span className="caption">Tiết 1 đến tiết {slots.at(-1)?.period ?? 5} ({WEEKDAY_SHORT[0]} – {WEEKDAY_SHORT[days.length - 1]})</span>
        </div>
        <Icon name="calendar_view_week" />
      </div>
      <div className="tt-matrix-grid" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
        {days.map((d, i) => (
          <button key={d} type="button" className={`tt-matrix-day${i === day ? ' is-on' : ''}`} onClick={() => onDay(i)} aria-pressed={i === day}>
            {WEEKDAY_SHORT[dayIndex(d)]}
          </button>
        ))}
        {groups.map((g) => (
          <MatrixGroup key={String(g.morning)} g={g} days={days} byCell={byCell} day={day} onDay={onDay} week={week} now={now} />
        ))}
      </div>
      <p className="tt-matrix-foot caption"><Icon name="info" size="sm" />Bấm vào ngày hoặc tiết để xem lịch của ngày đó.</p>
    </div>
  );
}
function MatrixGroup({ g, days, byCell, day, onDay, week, now }) {
  return (
    <>
      <span className="tt-matrix-band" style={{ gridColumn: `1 / ${days.length + 1}` }}>
        {g.morning ? 'Sáng' : 'Chiều'} (Tiết {g.slots[0].period} – {g.slots.at(-1).period})
      </span>
      {g.slots.map((s) =>
        days.map((d, i) => {
          const l = byCell[`${d}|${s.slotId}`];
          const live = l && lessonState(l, week.today, now) === 'live';
          return (
            <button key={`${s.slotId}-${d}`} type="button" title={l ? `Tiết ${s.period}: ${l.subjectName}` : `Tiết ${s.period}: trống`}
              className={`tt-matrix-cell${l ? '' : ' is-empty'}${i === day ? ' is-col' : ''}${live ? ' is-live' : ''}`} onClick={() => onDay(i)}>
              {l ? shortName(l.subjectName) : '--'}
            </button>
          );
        }),
      )}
    </>
  );
}

function DayTabs({ week, days, day, onDay }) {
  return (
    <div className="tt-daytabs" role="tablist" aria-label="Ngày trong tuần">
      {days.map((d, i) => (
        <button key={d} type="button" role="tab" aria-selected={i === day}
          className={`tt-daytab${i === day ? ' is-on' : ''}${d === week.today ? ' is-today' : ''}`} onClick={() => onDay(i)}>
          <span>{WEEKDAY_SHORT[dayIndex(d)]}</span>
          <strong>{d.slice(8, 10)}</strong>
          {week.lessons.some((l) => l.date === d) && <i className="tt-dot" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

// week = { days, timeSlots, lessons, today, weekStart }; secondLine(lesson) = teacher (class) or class (teaching).
export default function WeekTimetable({ week, view, secondLine, emptyText, aside, teacherView = false }) {
  const now = useNow();
  const [picked, setPicked] = useState(null);
  const showSunday = week.lessons.some((l) => l.date === week.days[6]);
  const days = week.days.slice(0, showSunday ? 7 : 6);
  const todayIndex = days.indexOf(week.today);
  const [day, setDay] = useState(todayIndex >= 0 ? todayIndex : 0);
  useEffect(() => {
    setDay(todayIndex >= 0 ? todayIndex : 0);
  }, [week.weekStart, todayIndex]);

  const byCell = useMemo(() => {
    const map = {};
    for (const l of week.lessons) map[`${l.date}|${l.slotId}`] = l;
    return map;
  }, [week.lessons]);
  // Afternoon periods only when the week has afternoon lessons.
  const lastPeriod = Math.max(5, ...week.lessons.map((l) => l.period));
  const slots = week.timeSlots.filter((s) => s.period <= lastPeriod);
  const dayLessons = week.lessons.filter((l) => l.date === days[day]);

  const dayView = (
    <div className={`tt-dayview${view === 'week' ? ' is-mobile-only' : ''}`}>
      <div className="tt-dayview-main">
        <DayTabs week={week} days={days} day={day} onDay={setDay} />
        <DayTimeline week={week} date={days[day]} lessons={dayLessons} slots={week.timeSlots} onPick={setPicked} secondLine={secondLine} now={now} />
      </div>
      <aside className="tt-dayview-side">
        <WeekMatrix week={week} days={days} slots={slots} byCell={byCell} day={day} onDay={setDay} now={now} />
        {aside}
      </aside>
    </div>
  );

  return (
    <>
      {week.lessons.length === 0 && (
        <div className="notice tt-empty"><Icon name="event_busy" /><p>{emptyText}</p></div>
      )}
      {view === 'week' && (
        <div className="tt-weekview">
          <WeekGrid week={week} days={days} slots={slots} byCell={byCell} onPick={setPicked} secondLine={secondLine} now={now} />
          <div className="tt-legend caption">
            <span><i className="tt-key" />Tiết học</span>
            <span><i className="tt-key is-today" />Hôm nay</span>
            <span><i className="tt-key is-live" />Tiết đang diễn ra</span>
            <span className="tt-legend-hint">Bấm vào một tiết để xem chi tiết.</span>
          </div>
        </div>
      )}
      {dayView}
      <LessonDetail lesson={picked} onClose={() => setPicked(null)} teacherView={teacherView} />
    </>
  );
}
