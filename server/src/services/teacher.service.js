import { withTransaction } from '../config/db.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import * as teacherModel from '../models/teacher.model.js';
import * as schoolYearRepo from '../repositories/schoolYear.repository.js';
import * as subjectRepo from '../repositories/subject.repository.js';
import * as teacherRepo from '../repositories/teacher.repository.js';
import { AppError, badRequest, notFound } from '../utils/AppError.js';

// SCR-13 / UC-15 – paginated teacher list with subjects, current homeroom class, class count and periods.
export async function listTeachers({ page, limit, search, subject, homeroom, status }) {
  const filters = { search, subject, homeroom, status };
  const total = await teacherRepo.countTeachers(filters);
  const rows = await teacherRepo.findTeachersPage(filters, { limit, offset: (page - 1) * limit });
  if (!rows.length) return teacherModel.toTeacherPage({ teachers: [], total, page, limit });

  const ids = rows.map((r) => r.teacherId);
  const [subjectRows, homeroomRows, loadRows] = await Promise.all([
    teacherRepo.findSubjectNamesByTeacherIds(ids),
    teacherRepo.findCurrentHomeroomByTeacherIds(ids),
    teacherRepo.findCurrentLoadByTeacherIds(ids),
  ]);
  const teachers = teacherModel.toTeacherListItems(rows, { subjectRows, homeroomRows, loadRows });
  return teacherModel.toTeacherPage({ teachers, total, page, limit });
}

// SCR-14 / UC-16 – profile, subjects, homeroom class, assignments of the current year and one week of schedule.
export async function getTeacherDetail({ id, week }) {
  const profile = await teacherRepo.findTeacherProfileById(id);
  if (!profile) throw notFound(ERROR_CODES.TEACHER_NOT_FOUND, 'Teacher not found.');

  const schoolYear = await schoolYearRepo.findCurrentSchoolYear();
  const yearId = schoolYear?.id ?? 0;
  const [subjects, homeroomClasses, assignmentRows, scheduleRows] = await Promise.all([
    teacherRepo.findSubjectsOfTeacher(id),
    teacherRepo.findHomeroomClassesOfTeacher(id, yearId),
    teacherRepo.findAssignmentsOfTeacher(id, yearId),
    teacherRepo.findWeekSchedule(id, week),
  ]);
  return teacherModel.toTeacherDetail({ profile, subjects, homeroomClasses, assignmentRows, scheduleRows, schoolYear });
}

// SCR-15 subject picker. ASSUMPTION: served from FE-03 until FE-04 publishes GET /subjects.
export async function listSubjectOptions() {
  return teacherModel.toSubjectOptions(await subjectRepo.findActiveSubjects());
}

// SCR-15 / UC-17 – update full name, department and subjects (input already validated).
export async function updateTeacher({ id, fullName, department, subjectIds }) {
  return withTransaction(async (conn) => {
    const teacher = await teacherRepo.lockTeacherForUpdate(id, conn);
    if (!teacher) throw notFound(ERROR_CODES.TEACHER_NOT_FOUND, 'Teacher not found.');

    const found = await subjectRepo.countActiveSubjectsByIds(subjectIds, conn);
    if (found !== subjectIds.length) throw badRequest(ERROR_CODES.SUBJECT_INVALID, 'Unknown subject.', { field: 'subjectIds' });

    // business-rules §4: teaching assignments only for subjects the teacher can teach,
    // so a subject still used by a current or future assignment cannot be removed.
    const inUse = await teacherRepo.findAssignmentsBlockingSubjectRemoval(id, subjectIds, conn);
    if (inUse.length) {
      const bySubject = {};
      for (const r of inUse) (bySubject[r.subjectName] ??= new Set()).add(r.className);
      throw new AppError(409, ERROR_CODES.SUBJECT_IN_USE, 'Some removed subjects are still assigned to classes.', {
        subjects: Object.entries(bySubject).map(([name, classes]) => ({ name, classes: [...classes] })),
      });
    }

    await teacherRepo.updateUserFullName(teacher.userId, fullName, conn);
    await teacherRepo.updateDepartment(id, department, conn);
    await teacherRepo.replaceTeacherSubjects(id, subjectIds, conn);
    return { teacherId: Number(id) };
  });
}
