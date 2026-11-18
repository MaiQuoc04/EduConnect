import Icon from '../../components/Icon.jsx';
import { dmy } from './WeekTimetable.jsx';

// Where a teacher's lessons are (Dung, 18/11/2026) – used by "Lịch dạy" (SCR-57) and the School Manager's teacher
// schedule lookup, so a teacher without lessons for some months does not have to page week by week to find them.
// `week` is the answer of the week API (prevLessonDate, nextLessonDate, overview); onGo(date) opens that week.

// Shown above the grid when the week has no lesson: jump to the nearest week that has one.
export function EmptyWeekJump({ week, onGo, who = 'Bạn' }) {
  if (!week || week.lessons.length > 0) return null;
  const { prevLessonDate: prev, nextLessonDate: next } = week;
  return (
    <div className="notice tov-jump" role="status">
      <Icon name="event_busy" />
      <div>
        <p>{who} không có tiết dạy nào trong tuần {dmy(week.weekStart)} – {dmy(week.days[5])}.
          {!prev && !next && ' Hiện chưa có tiết dạy nào trong thời khoá biểu.'}</p>
        <div className="tov-jump-actions">
          {prev && <button type="button" className="btn btn-secondary" onClick={() => onGo(prev)}><Icon name="chevron_left" size="sm" /> Tuần có tiết trước ({dmy(prev)})</button>}
          {next && <button type="button" className="btn btn-primary" onClick={() => onGo(next)}>Tuần có tiết tiếp theo ({dmy(next)}) <Icon name="chevron_right" size="sm" /></button>}
        </div>
      </div>
    </div>
  );
}

// Same dates together: "17/01/2027 – 31/05/2027: Lớp 11A2 · Ngữ văn, Lớp 11C1 · Ngữ văn".
function groupGaps(list) {
  const m = new Map();
  for (const u of list) {
    const k = `${u.from}|${u.to}`;
    if (!m.has(k)) m.set(k, { from: u.from, to: u.to, what: [] });
    m.get(k).what.push(`Lớp ${u.className} · ${u.subjectName}`);
  }
  return [...m.values()];
}

// "Lịch dạy sắp tới": per class and subject, from when to when (from today), plus assignments without a timetable.
export function TeachingOverview({ week, onGo, who = 'Bạn' }) {
  const o = week?.overview;
  if (!o) return null;
  const inWeek = (d) => d >= week.weekStart && d <= week.weekEnd;
  return (
    <section className="card tov" aria-labelledby="tov-title">
      <div className="tov-head">
        <h2 id="tov-title" className="title-sm"><Icon name="event_note" size="sm" /> Lịch dạy sắp tới</h2>
        {o.firstLessonDate
          ? <span className="caption tt-muted">Tiết gần nhất: <strong>{dmy(o.firstLessonDate)}</strong></span>
          : <span className="caption tt-muted">Chưa có tiết nào từ hôm nay</span>}
      </div>
      {o.items.length === 0 && o.unscheduled.length === 0 && (
        <p className="caption tt-muted">{who} chưa được xếp tiết dạy và chưa có phân công giảng dạy nào từ hôm nay.</p>
      )}
      {o.items.length > 0 && (
        <ul className="tov-list">
          {o.items.map((it) => (
            <li key={`${it.classId}-${it.subjectId}`}>
              <div>
                <strong>Lớp {it.className} · {it.subjectName}</strong>
                <span className="caption tt-muted">
                  Từ {dmy(it.from)} đến {dmy(it.to)}{it.periodsPerWeek ? ` · ${it.periodsPerWeek} tiết/tuần` : ''} · còn {it.lessons} tiết
                </span>
              </div>
              <button type="button" className="tt-link" onClick={() => onGo(it.from)} disabled={inWeek(it.from)}>
                {inWeek(it.from) ? 'Đang xem' : 'Xem tuần đầu'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {o.unscheduled.length > 0 && (
        <div className="tov-unscheduled">
          <p className="caption"><Icon name="info" size="sm" /> Đã được phân công nhưng lớp chưa có thời khoá biểu cho những ngày này (ví dụ học kỳ II chưa xếp):</p>
          <ul>
            {groupGaps(o.unscheduled).map((g) => (
              <li key={`${g.from}-${g.to}`} className="caption"><strong>{dmy(g.from)} – {dmy(g.to)}</strong>: {g.what.join(', ')}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
