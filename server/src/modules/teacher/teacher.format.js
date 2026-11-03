// FE-03 response shapes (DB rows -> JSON sent to the client).
import { HOMEROOM_RULES, TEACHING_RULES } from './teacher.constants.js';

// ══ schoolYear ══════════════════════════════════════════════════════════════

// School year as returned to the client: { id, name, startDate, endDate, isCurrent }.

export function currentYearId(years) {
  // years are sorted newest first; MOM-05: current = latest year that has started
  return years.find((y) => y.started)?.id ?? null;
}

export function toSchoolYear(year, currentId) {
  if (!year) return null;
  const { started, ...rest } = year;
  return { ...rest, isCurrent: String(year.id) === String(currentId) };
}

export function toSchoolYearList(years, currentId) {
  return years.map((y) => toSchoolYear(y, currentId));
}

// ══ teacher ══════════════════════════════════════════════════════════════

// Shapes of the FE-03 teacher API responses (SCR-14 list, SCR-15 detail, SCR-17 subject options).

function groupBy(rows, key, pick) {
  const map = {};
  for (const r of rows) (map[r[key]] ??= []).push(pick(r));
  return map;
}

// SCR-14 row: teacher + subjects + current homeroom class + current load.
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

// SCR-15 detail
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

// SCR-17 subject picker
export function toSubjectOptions(rows) {
  return { subjects: rows };
}

// SCR-17 department picker
export function toDepartmentOptions(rows) {
  return { departments: rows };
}

// ══ homeroom ══════════════════════════════════════════════════════════════

// Rules the client shows in the SCR-18 banner and uses to disable options.
export function homeroomRules() {
  return {
    maxClassesPerTeacher: HOMEROOM_RULES.MAX_CLASSES_PER_TEACHER,
    lockedTeacherAllowed: HOMEROOM_RULES.LOCKED_TEACHER_ALLOWED,
  };
}

// SCR-18 board: { schoolYears, schoolYear, classes, teachers, rules }
export function toHomeroomBoard({ schoolYears, schoolYear, classes = [], teachers = [] }) {
  return {
    schoolYears,
    schoolYear,
    classes: classes.map((c) => ({ ...c, studentCount: Number(c.studentCount) })),
    teachers,
    rules: homeroomRules(),
  };
}

// ══ teachingAssignment ══════════════════════════════════════════════════════════════

// SCR-19 matrix: { schoolYears, schoolYear, date, today, subjects, classes, assignments, teachers, rules }
export function toTeachingBoard({ schoolYears, schoolYear, date, today, classRows = [], cellRows = [], assignments = [], teacherRows = [], teacherSubjectRows = [] }) {
  // Columns = every subject studied by at least one class of the year.
  const subjectMap = new Map();
  const classSubjects = {};
  for (const c of cellRows) {
    if (!subjectMap.has(String(c.subjectId))) {
      subjectMap.set(String(c.subjectId), { subjectId: c.subjectId, name: c.subjectName, code: c.subjectCode });
    }
    (classSubjects[c.classId] ??= {})[c.subjectId] = Number(c.periodsPerWeek);
  }
  const subjects = [...subjectMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  const canTeach = {};
  for (const r of teacherSubjectRows) (canTeach[r.teacherId] ??= []).push(r.subjectId);

  return {
    schoolYears,
    schoolYear,
    date,
    today,
    subjects,
    classes: classRows.map(({ homeroomTeacherId, ...c }) => ({ ...c, studentCount: Number(c.studentCount), subjects: classSubjects[c.classId] ?? {} })),
    assignments,
    teachers: teacherRows.map((t) => ({ ...t, subjectIds: canTeach[t.teacherId] ?? [] })),
    rules: { lockedTeacherAllowed: TEACHING_RULES.LOCKED_TEACHER_ALLOWED },
  };
}

// "10A2 – Vật lý" used in error details
export const cellLabel = (className, subjectName) => `${className} – ${subjectName}`;
