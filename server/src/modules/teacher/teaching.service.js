// FE-03 (Dung) – SCR-19 Teaching Assignment (UC-18).
import { withTransaction } from '../../config/db.js';
import { AppError, badRequest, notFound } from '../../utils/AppError.js';
import { ERROR_CODES, TEACHING_RULES, USER_STATUS } from './teacher.constants.js';
import { cellLabel, currentYearId, toSchoolYear, toSchoolYearList, toTeachingBoard } from './teacher.format.js';
import * as queries from './teacher.queries.js';
import { syncClassTeachers } from '../classes/classGroups.js';

/**
 * Picks the school year and the view range [from, to]. Assignments are date ranges (business-rules §4), so the
 * matrix shows every assignment overlapping the range, each with its dates. Default: from = today if inside the
 * year (otherwise the year's first day), to = the year's last day. Dates outside the year are clamped into it.
 */
async function resolveYearAndRange({ schoolYearId, from, to }) {
  const [years, today] = await Promise.all([queries.findAllSchoolYears(), queries.findToday()]);
  const currentId = currentYearId(years);

  let year;
  if (schoolYearId) {
    year = years.find((y) => String(y.id) === String(schoolYearId));
    if (!year) throw notFound(ERROR_CODES.SCHOOL_YEAR_NOT_FOUND, 'School year not found.');
  } else {
    year = years.find((y) => String(y.id) === String(currentId)) ?? years[0] ?? null;
  }
  if (!year) return { years, year: null, from: null, to: null, today, currentId };

  const clamp = (d) => (d < year.startDate ? year.startDate : d > year.endDate ? year.endDate : d);
  const viewFrom = from ? clamp(from) : today >= year.startDate && today <= year.endDate ? today : year.startDate;
  let viewTo = to ? clamp(to) : year.endDate;
  if (viewTo < viewFrom) viewTo = viewFrom;
  return { years, year, from: viewFrom, to: viewTo, today, currentId };
}

// SCR-19 / UC-18 – matrix of classes × subjects with every assignment overlapping [from, to].
export async function getTeachingBoard({ schoolYearId, from, to } = {}) {
  const { years, year, from: viewFrom, to: viewTo, today, currentId } = await resolveYearAndRange({ schoolYearId, from, to });
  const schoolYears = toSchoolYearList(years, currentId);
  if (!year) return toTeachingBoard({ schoolYears, schoolYear: null, from: null, to: null, today });

  const [classRows, cellRows, assignments, teacherRows, teacherSubjectRows] = await Promise.all([
    queries.findClassesOfYear(year.id),
    queries.findClassSubjectsOfYear(year.id),
    queries.findOverlapping(year.id, viewFrom, viewTo),
    queries.findAllTeachersBasic(),
    queries.findAllTeacherSubjectPairs(),
  ]);
  return toTeachingBoard({
    schoolYears,
    schoolYear: toSchoolYear(year, currentId),
    from: viewFrom,
    to: viewTo,
    today,
    classRows,
    cellRows,
    assignments,
    teacherRows,
    teacherSubjectRows,
  });
}

/**
 * SCR-19 / UC-18 – save (class, subject) → teacher for the range [startDate, endDate] (endDate defaults to the end
 * of the school year). business-rules §4: history is kept – only the part of other rows inside the range changes
 * (clearRange), the new row covers exactly the range, and timetable periods inside the range without attendance
 * move to the new teacher (§10: no substitute teaching outside an assignment; rows with attendance are kept).
 * All or nothing.
 */
export async function saveTeachingAssignments({ schoolYearId, startDate, endDate, changes }) {
  let savedRange;
  await withTransaction(async (conn) => {
    const year = await queries.findSchoolYearById(schoolYearId, conn);
    if (!year) throw notFound(ERROR_CODES.SCHOOL_YEAR_NOT_FOUND, 'School year not found.');
    const today = await queries.findToday(conn);
    const start = startDate;
    const end = endDate ?? year.endDate;
    // business-rules §4: never back-dated – past lessons, attendance and grades stay with the old teacher.
    const min = today > year.startDate ? today : year.startDate;
    if (start < min || start > year.endDate || end < start || end > year.endDate) {
      throw badRequest(ERROR_CODES.EFFECTIVE_DATE, 'The range must start today or later and stay inside the school year.', {
        min,
        max: year.endDate,
      });
    }
    savedRange = { from: start, to: end };

    const classes = await queries.lockClassesOfYear(schoolYearId, conn);
    const classById = new Map(classes.map((c) => [String(c.classId), c]));
    const pairs = await queries.findClassSubjectsOfYear(schoolYearId, conn);
    const subjectName = new Map(pairs.map((p) => [`${p.classId}:${p.subjectId}`, p.subjectName]));
    const running = await queries.findActiveOnDate(schoolYearId, start, conn);
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
      const teachers = await queries.findTeachersWithSubjectIds(teacherIds, conn);
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
      await queries.clearRange(ch.classId, ch.subjectId, start, end, conn);

      if (!ch.teacherId) {
        const periods = await queries.countFreeSlots(ch.classId, ch.subjectId, start, end, conn);
        if (periods > 0) blocked.push({ cell: label(ch), periods });
        continue;
      }
      // The new teacher must be free in every moved period (DB also has UNIQUE (teacher_id, date, slot_id)).
      const busy = await queries.findTeacherClashes(ch.teacherId, ch.classId, ch.subjectId, start, end, conn);
      if (busy.length) {
        clashes.push({ cell: label(ch), items: busy });
        continue;
      }
      await queries.insertAssignment({ classId: ch.classId, subjectId: ch.subjectId, teacherId: ch.teacherId, startDate: start, endDate: end }, conn);
      await queries.mergeTouchingRows(ch.classId, ch.subjectId, conn);
      await queries.moveFreeSlotsToTeacher(ch.teacherId, ch.classId, ch.subjectId, start, end, conn);
    }

    if (blocked.length) {
      throw new AppError(409, ERROR_CODES.ASSIGNMENT_IN_TIMETABLE, 'Cannot leave a pair without teacher while it has lessons.', { items: blocked });
    }
    if (clashes.length) {
      throw new AppError(409, ERROR_CODES.TIMETABLE_CLASH, 'The new teacher already teaches at those periods.', { items: clashes });
    }

    // Business-rules §4 "Class group membership follows the class": the class groups follow the new assignments,
    // in this transaction (FE-04 syncClassTeachers; nothing happens for an ended school year).
    // ASSUMPTION: an assignment counts from the day it is saved even when it starts later (classPeopleSql takes
    // current and future assignments), and a teacher whose assignment ends later stays until the next sync of
    // the class – there is no daily job yet.
    for (const classId of new Set(changes.map((ch) => ch.classId))) await syncClassTeachers(conn, Number(classId));
  });

  return getTeachingBoard({ schoolYearId, ...savedRange });
}
