import { withTransaction } from '../config/db.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { HOMEROOM_RULES, USER_STATUS } from '../constants/teacher.constants.js';
import * as homeroomModel from '../models/homeroom.model.js';
import { currentYearId, toSchoolYear, toSchoolYearList } from '../models/schoolYear.model.js';
import * as classRepo from '../repositories/class.repository.js';
import * as schoolYearRepo from '../repositories/schoolYear.repository.js';
import * as teacherRepo from '../repositories/teacher.repository.js';
import { AppError, badRequest, notFound } from '../utils/AppError.js';

/**
 * SCR-16 / UC-19 – classes of one school year with their homeroom teacher, plus the teachers to choose from.
 * Default year: the current one (or the newest if none has started).
 */
export async function getHomeroomBoard({ schoolYearId } = {}) {
  const years = await schoolYearRepo.findAllSchoolYears();
  const currentId = currentYearId(years);
  const yearId = schoolYearId ?? currentId ?? years[0]?.id ?? null;
  const year = years.find((y) => String(y.id) === String(yearId));
  if (schoolYearId && !year) throw notFound(ERROR_CODES.SCHOOL_YEAR_NOT_FOUND, 'School year not found.');
  if (!year) return homeroomModel.toHomeroomBoard({ schoolYears: [], schoolYear: null });

  const [classes, teachers] = await Promise.all([
    classRepo.findClassesOfYear(year.id),
    teacherRepo.findAllTeachersWithSubjectNames(),
  ]);
  return homeroomModel.toHomeroomBoard({
    schoolYears: toSchoolYearList(years, currentId),
    schoolYear: toSchoolYear(year, currentId),
    classes,
    teachers,
  });
}

/**
 * SCR-16 / UC-19 – save several homeroom changes of one year at once (input already validated).
 * previousTeacherId is what the client saw; if someone else changed the class meanwhile → 409.
 */
export async function saveHomeroomAssignments({ schoolYearId, changes }) {
  await withTransaction(async (conn) => {
    const year = await schoolYearRepo.findSchoolYearById(schoolYearId, conn);
    if (!year) throw notFound(ERROR_CODES.SCHOOL_YEAR_NOT_FOUND, 'School year not found.');

    const classes = await classRepo.lockClassesOfYear(schoolYearId, conn);
    const byId = new Map(classes.map((c) => [String(c.classId), c]));

    const stale = [];
    for (const ch of changes) {
      const cls = byId.get(ch.classId);
      if (!cls) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Class is not in this school year.', { classId: ch.classId });
      const current = cls.homeroomTeacherId == null ? null : String(cls.homeroomTeacherId);
      if (current !== ch.previousTeacherId) stale.push(cls.className);
    }
    if (stale.length) throw new AppError(409, ERROR_CODES.HOMEROOM_STALE, 'Some classes were changed by someone else.', { classes: stale });

    const newTeacherIds = [...new Set(changes.map((c) => c.teacherId).filter(Boolean))];
    if (newTeacherIds.length) {
      const teachers = await teacherRepo.findTeachersStatusByIds(newTeacherIds, conn);
      if (teachers.length !== newTeacherIds.length) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Unknown teacher.');

      if (!HOMEROOM_RULES.LOCKED_TEACHER_ALLOWED) {
        // Only teachers newly placed on a class are checked; an unchanged locked homeroom is not in `changes`.
        const locked = teachers.filter((t) => t.status === USER_STATUS.LOCKED);
        if (locked.length) {
          throw new AppError(409, ERROR_CODES.TEACHER_LOCKED, 'A locked teacher cannot be a homeroom teacher.', {
            teachers: locked.map((t) => t.fullName),
          });
        }
      }

      // State of the year after the changes → per-teacher limit.
      const finalByClass = new Map(classes.map((c) => [String(c.classId), c.homeroomTeacherId == null ? null : String(c.homeroomTeacherId)]));
      for (const ch of changes) finalByClass.set(ch.classId, ch.teacherId);
      const held = new Map();
      for (const [classId, tid] of finalByClass) {
        if (!tid) continue;
        if (!held.has(tid)) held.set(tid, []);
        held.get(tid).push(byId.get(classId).className);
      }
      const over = teachers
        .filter((t) => (held.get(String(t.teacherId))?.length ?? 0) > HOMEROOM_RULES.MAX_CLASSES_PER_TEACHER)
        .map((t) => ({ teacher: t.fullName, classes: held.get(String(t.teacherId)) }));
      if (over.length) {
        throw new AppError(409, ERROR_CODES.HOMEROOM_LIMIT, 'A teacher would be homeroom teacher of too many classes.', {
          max: HOMEROOM_RULES.MAX_CLASSES_PER_TEACHER,
          conflicts: over,
        });
      }
    }

    for (const ch of changes) await classRepo.updateHomeroomTeacher(ch.classId, ch.teacherId, conn);
  });

  return getHomeroomBoard({ schoolYearId });
}
