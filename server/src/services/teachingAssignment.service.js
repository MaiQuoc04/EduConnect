import { withTransaction } from '../config/db.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { TEACHING_RULES, USER_STATUS } from '../constants/teacher.constants.js';
import { currentYearId, toSchoolYear, toSchoolYearList } from '../models/schoolYear.model.js';
import { cellLabel, toTeachingBoard } from '../models/teachingAssignment.model.js';
import * as classRepo from '../repositories/class.repository.js';
import * as schoolYearRepo from '../repositories/schoolYear.repository.js';
import * as assignmentRepo from '../repositories/teachingAssignment.repository.js';
import * as teacherRepo from '../repositories/teacher.repository.js';
import * as timetableRepo from '../repositories/timetable.repository.js';
import { AppError, badRequest, notFound } from '../utils/AppError.js';

/**
 * Picks the school year and the matrix "view date". Assignments are date ranges, so the matrix shows the
 * assignment running on that date. Default: today if inside the year, otherwise the year's first day;
 * a date outside the year is clamped into it.
 */
async function resolveYearAndDate({ schoolYearId, date }) {
  const [years, today] = await Promise.all([schoolYearRepo.findAllSchoolYears(), schoolYearRepo.findToday()]);
  const currentId = currentYearId(years);

  let year;
  if (schoolYearId) {
    year = years.find((y) => String(y.id) === String(schoolYearId));
    if (!year) throw notFound(ERROR_CODES.SCHOOL_YEAR_NOT_FOUND, 'School year not found.');
  } else {
    year = years.find((y) => String(y.id) === String(currentId)) ?? years[0] ?? null;
  }
  if (!year) return { years, year: null, date: null, today, currentId };

  let viewDate;
  if (date) viewDate = date < year.startDate ? year.startDate : date > year.endDate ? year.endDate : date;
  else viewDate = today >= year.startDate && today <= year.endDate ? today : year.startDate;
  return { years, year, date: viewDate, today, currentId };
}

// SCR-17 / UC-18 – matrix of classes × subjects with the teacher assigned on `date`.
export async function getTeachingBoard({ schoolYearId, date } = {}) {
  const { years, year, date: viewDate, today, currentId } = await resolveYearAndDate({ schoolYearId, date });
  const schoolYears = toSchoolYearList(years, currentId);
  if (!year) return toTeachingBoard({ schoolYears, schoolYear: null, date: null, today });

  const [classRows, cellRows, assignments, teacherRows, teacherSubjectRows] = await Promise.all([
    classRepo.findClassesOfYear(year.id),
    classRepo.findClassSubjectsOfYear(year.id),
    assignmentRepo.findActiveOnDate(year.id, viewDate),
    teacherRepo.findAllTeachersBasic(),
    teacherRepo.findAllTeacherSubjectPairs(),
  ]);
  return toTeachingBoard({
    schoolYears,
    schoolYear: toSchoolYear(year, currentId),
    date: viewDate,
    today,
    classRows,
    cellRows,
    assignments,
    teacherRows,
    teacherSubjectRows,
  });
}

/**
 * SCR-17 / UC-18 – save (class, subject) → teacher changes, effective from `date` to the end of the year.
 * Per pair: the running assignment ends the day before, rows planned later are soft-deleted, a new row
 * [date, year end] is inserted, and timetable periods from `date` without attendance move to the new teacher
 * (business-rules §10: no substitute teaching; rows with attendance are kept). All or nothing.
 */
export async function saveTeachingAssignments({ schoolYearId, date, changes }) {
  await withTransaction(async (conn) => {
    const year = await schoolYearRepo.findSchoolYearById(schoolYearId, conn);
    if (!year) throw notFound(ERROR_CODES.SCHOOL_YEAR_NOT_FOUND, 'School year not found.');
    const today = await schoolYearRepo.findToday(conn);
    // ASSUMPTION: never back-dated – past lessons, attendance and grades stay with the old teacher.
    if (date < today || date < year.startDate || date > year.endDate) {
      throw badRequest(ERROR_CODES.EFFECTIVE_DATE, 'The effective date must be today or later, inside the school year.', {
        min: today > year.startDate ? today : year.startDate,
        max: year.endDate,
      });
    }

    const classes = await classRepo.lockClassesOfYear(schoolYearId, conn);
    const classById = new Map(classes.map((c) => [String(c.classId), c]));
    const pairs = await classRepo.findClassSubjectsOfYear(schoolYearId, conn);
    const subjectName = new Map(pairs.map((p) => [`${p.classId}:${p.subjectId}`, p.subjectName]));
    const running = await assignmentRepo.findActiveOnDate(schoolYearId, date, conn);
    const currentByPair = new Map(running.map((a) => [`${a.classId}:${a.subjectId}`, String(a.teacherId)]));
    const label = (ch) => cellLabel(classById.get(ch.classId)?.className ?? ch.classId, subjectName.get(`${ch.classId}:${ch.subjectId}`) ?? ch.subjectId);

    const stale = [];
    for (const ch of changes) {
      if (!classById.has(ch.classId)) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Class is not in this school year.', { classId: ch.classId });
      // business-rules §4: the subject must be part of the class's track for that year.
      if (!subjectName.has(`${ch.classId}:${ch.subjectId}`)) {
        throw badRequest(ERROR_CODES.SUBJECT_NOT_IN_CLASS, 'This class does not study that subject.', { pair: `${ch.classId}:${ch.subjectId}` });
      }
      if ((currentByPair.get(`${ch.classId}:${ch.subjectId}`) ?? null) !== ch.previousTeacherId) stale.push(label(ch));
    }
    if (stale.length) throw new AppError(409, ERROR_CODES.ASSIGNMENT_STALE, 'Some cells were changed by someone else.', { cells: stale });

    const teacherIds = [...new Set(changes.map((c) => c.teacherId).filter(Boolean))];
    if (teacherIds.length) {
      const teachers = await teacherRepo.findTeachersWithSubjectIds(teacherIds, conn);
      if (teachers.length !== teacherIds.length) throw badRequest(ERROR_CODES.INVALID_INPUT, 'Unknown teacher.');
      const byId = new Map(teachers.map((t) => [String(t.teacherId), t]));

      if (!TEACHING_RULES.LOCKED_TEACHER_ALLOWED) {
        const locked = teachers.filter((t) => t.status === USER_STATUS.LOCKED).map((t) => t.fullName);
        if (locked.length) throw new AppError(409, ERROR_CODES.TEACHER_LOCKED, 'A locked teacher cannot be assigned.', { teachers: locked });
      }
      // business-rules §4: only subjects the teacher can teach (teacher_subjects).
      const notQualified = changes
        .filter((ch) => ch.teacherId && !byId.get(ch.teacherId).subjectIds.map(String).includes(ch.subjectId))
        .map((ch) => ({ teacher: byId.get(ch.teacherId).fullName, cell: label(ch) }));
      if (notQualified.length) {
        throw new AppError(409, ERROR_CODES.TEACHER_NOT_QUALIFIED, 'Teacher is not registered for that subject.', { items: notQualified });
      }
    }

    const clashes = [];
    const blocked = [];
    for (const ch of changes) {
      await assignmentRepo.softDeleteStartingFrom(ch.classId, ch.subjectId, date, conn);
      await assignmentRepo.endRunningBefore(ch.classId, ch.subjectId, date, conn);

      if (!ch.teacherId) {
        const periods = await timetableRepo.countFreeSlotsFrom(ch.classId, ch.subjectId, date, conn);
        if (periods > 0) blocked.push({ cell: label(ch), periods });
        continue;
      }
      // The new teacher must be free in every moved period (DB also has UNIQUE (teacher_id, date, slot_id)).
      const busy = await timetableRepo.findTeacherClashes(ch.teacherId, ch.classId, ch.subjectId, date, conn);
      if (busy.length) {
        clashes.push({ cell: label(ch), items: busy });
        continue;
      }
      await assignmentRepo.insertAssignment(
        { classId: ch.classId, subjectId: ch.subjectId, teacherId: ch.teacherId, startDate: date, endDate: year.endDate },
        conn,
      );
      await timetableRepo.moveFreeSlotsToTeacher(ch.teacherId, ch.classId, ch.subjectId, date, conn);
    }

    if (blocked.length) {
      throw new AppError(409, ERROR_CODES.ASSIGNMENT_IN_TIMETABLE, 'Cannot leave a pair without teacher while it has lessons.', { items: blocked });
    }
    if (clashes.length) {
      throw new AppError(409, ERROR_CODES.TIMETABLE_CLASH, 'The new teacher already teaches at those periods.', { items: clashes });
    }
  });

  return getTeachingBoard({ schoolYearId, date });
}
