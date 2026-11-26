// FE-10 timetable (Dung) – periods per week of each subject in a weekly pattern (no database, unit tested).

// Subjects placed more often in the weekly pattern than track_subjects.periods_per_week allows (26/11/2026, Dung:
// Địa lí 10A1 could be saved with 2 / 1 periods). Fewer periods are allowed (the screen shows "Thiếu").
export function overQuota(subjects, entries) {
  const count = new Map();
  for (const e of entries) count.set(String(e.subjectId), (count.get(String(e.subjectId)) ?? 0) + 1);
  return subjects
    .filter((s) => (count.get(String(s.subjectId)) ?? 0) > s.periodsPerWeek)
    .map((s) => ({ subject: s.name, periods: count.get(String(s.subjectId)), periodsPerWeek: s.periodsPerWeek }));
}
