// Period times – the same rule as server/src/modules/timetable/timetable.periods.js: each session starts at its new
// start, every period lasts `duration` minutes and the break after each period keeps its current length.
export const toMinutes = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
export const toHm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const SESSION_NAMES = ['Buổi sáng', 'Buổi chiều', 'Buổi tối', 'Buổi 4'];

// sessions from GET /timetables/period-times: [{ start, end, periods: [{ period, breakAfter }] }]
export function planTimes(sessions, sessionStarts, duration) {
  const out = [];
  sessions.forEach((se, k) => {
    let t = toMinutes(sessionStarts[k]);
    for (const p of se.periods) {
      out.push({ period: p.period, start: toHm(t), end: toHm(t + duration), session: k, breakAfter: p.breakAfter });
      t += duration + (p.breakAfter ?? 0);
    }
  });
  return out;
}

// Vietnamese problems keyed by field: { duration?, session0?, session1? … }
export function checkTimes(sessions, sessionStarts, duration, limits) {
  const problems = {};
  if (!Number.isInteger(duration) || duration < limits.DURATION_MIN || duration > limits.DURATION_MAX) {
    problems.duration = `Thời lượng một tiết từ ${limits.DURATION_MIN} đến ${limits.DURATION_MAX} phút.`;
    return problems;
  }
  sessionStarts.forEach((v, k) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v ?? '')) problems[`session${k}`] = 'Nhập giờ bắt đầu (giờ:phút).';
  });
  if (Object.keys(problems).length) return problems;
  const rows = planTimes(sessions, sessionStarts, duration);
  sessions.forEach((se, k) => {
    const mine = rows.filter((r) => r.session === k);
    const first = toMinutes(sessionStarts[k]);
    const last = toMinutes(mine[mine.length - 1].end);
    if (first < toMinutes(limits.DAY_START) || last > toMinutes(limits.DAY_END)) {
      problems[`session${k}`] = `${SESSION_NAMES[k]} phải nằm trong ${limits.DAY_START} – ${limits.DAY_END} (đang kết thúc lúc ${toHm(last)}).`;
    } else if (k > 0) {
      const prev = rows.filter((r) => r.session === k - 1);
      const prevEnd = toMinutes(prev[prev.length - 1].end);
      if (first - prevEnd < limits.LUNCH_MIN) {
        problems[`session${k}`] = `${SESSION_NAMES[k - 1]} kết thúc lúc ${toHm(prevEnd)}; ${SESSION_NAMES[k].toLowerCase()} phải bắt đầu từ ${toHm(prevEnd + limits.LUNCH_MIN)} trở đi (nghỉ ít nhất ${limits.LUNCH_MIN} phút).`;
      }
    }
  });
  return problems;
}
