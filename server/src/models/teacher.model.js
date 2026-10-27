// Shapes of the FE-03 teacher API responses (SCR-13 list, SCR-14 detail, SCR-15 subject options).

function groupBy(rows, key, pick) {
  const map = {};
  for (const r of rows) (map[r[key]] ??= []).push(pick(r));
  return map;
}

// SCR-13 row: teacher + subjects + current homeroom class + current load.
export function toTeacherListItems(rows, { subjectRows, homeroomRows, loadRows }) {
  const subjects = groupBy(subjectRows, 'teacherId', (r) => r.name);
  const homeroom = {};
  for (const r of homeroomRows) homeroom[r.teacherId] ??= r.className;
  const load = {};
  for (const r of loadRows) load[r.teacherId] = { classCount: Number(r.classCount), periodsPerWeek: Number(r.periodsPerWeek) };

  return rows.map((t) => ({
    ...t,
    subjects: subjects[t.teacherId] ?? [],
    homeroomClass: homeroom[t.teacherId] ?? null,
    classCount: load[t.teacherId]?.classCount ?? 0,
    periodsPerWeek: load[t.teacherId]?.periodsPerWeek ?? 0,
  }));
}

export function toTeacherPage({ teachers, total, page, limit }) {
  return { teachers, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

function toAssignment(a) {
  return {
    ...a,
    periodsPerWeek: a.periodsPerWeek == null ? null : Number(a.periodsPerWeek),
    isActive: Boolean(a.isActive),
    isHomeroomClass: Boolean(a.isHomeroomClass),
  };
}

// Workload = assignments running today: distinct classes and sum of periods per week.
function toWorkload(assignments) {
  const active = assignments.filter((a) => a.isActive);
  return {
    classCount: new Set(active.map((a) => String(a.classId))).size,
    periodsPerWeek: active.reduce((sum, a) => sum + Number(a.periodsPerWeek ?? 0), 0),
  };
}

// The schedule query returns one row even for an empty week (it carries weekStart / weekEnd).
function toSchedule(rows) {
  return {
    weekStart: rows[0]?.weekStart ?? null,
    weekEnd: rows[0]?.weekEnd ?? null,
    slots: rows.filter((r) => r.date).map(({ weekStart, weekEnd, ...slot }) => slot),
  };
}

// SCR-14 detail
export function toTeacherDetail({ profile, subjects, homeroomClasses, assignmentRows, scheduleRows, schoolYear }) {
  const assignments = assignmentRows.map(toAssignment);
  return {
    teacher: { ...profile, tempLocked: Boolean(profile.tempLocked), subjects, homeroomClasses },
    schoolYear: schoolYear?.name ?? null,
    assignments,
    workload: toWorkload(assignments),
    schedule: toSchedule(scheduleRows),
  };
}

// SCR-15 subject picker
export function toSubjectOptions(rows) {
  return { subjects: rows };
}
