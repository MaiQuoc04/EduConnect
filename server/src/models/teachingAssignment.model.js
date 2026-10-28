import { TEACHING_RULES } from '../constants/teacher.constants.js';

// SCR-17 matrix: { schoolYears, schoolYear, date, today, subjects, classes, assignments, teachers, rules }
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
