import { HOMEROOM_RULES } from '../constants/teacher.constants.js';

// Rules the client shows in the SCR-16 banner and uses to disable options.
export function homeroomRules() {
  return {
    maxClassesPerTeacher: HOMEROOM_RULES.MAX_CLASSES_PER_TEACHER,
    lockedTeacherAllowed: HOMEROOM_RULES.LOCKED_TEACHER_ALLOWED,
  };
}

// SCR-16 board: { schoolYears, schoolYear, classes, teachers, rules }
export function toHomeroomBoard({ schoolYears, schoolYear, classes = [], teachers = [] }) {
  return {
    schoolYears,
    schoolYear,
    classes: classes.map((c) => ({ ...c, studentCount: Number(c.studentCount) })),
    teachers,
    rules: homeroomRules(),
  };
}
