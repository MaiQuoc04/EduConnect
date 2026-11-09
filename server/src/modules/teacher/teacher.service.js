// FE-03 (Dung) – teachers: SCR-14 list (UC-15), SCR-15 detail (UC-16), SCR-17 update (UC-17).
import { withTransaction } from '../../config/db.js';
import { AppError, badRequest, notFound } from '../../utils/AppError.js';
import { ERROR_CODES } from './teacher.constants.js';
import * as format from './teacher.format.js';
import * as queries from './teacher.queries.js';

// SCR-14 / UC-15 – paginated teacher list with subjects, current homeroom class, class count and periods.
export async function listTeachers({ page, limit, search, subject, homeroom, status }) {
  const filters = { search, subject, homeroom, status };
  const total = await queries.countTeachers(filters);
  const rows = await queries.findTeachersPage(filters, { limit, offset: (page - 1) * limit });
  if (!rows.length) return format.toTeacherPage({ teachers: [], total, page, limit });

  const ids = rows.map((r) => r.teacherId);
  const [subjectRows, homeroomRows, loadRows] = await Promise.all([
    queries.findSubjectNamesByTeacherIds(ids),
    queries.findCurrentHomeroomByTeacherIds(ids),
    queries.findCurrentLoadByTeacherIds(ids),
  ]);
  const teachers = format.toTeacherListItems(rows, { subjectRows, homeroomRows, loadRows });
  return format.toTeacherPage({ teachers, total, page, limit });
}

// SCR-15 / UC-16 – profile, subjects, homeroom class, assignments of the current year and one week of schedule.
export async function getTeacherDetail({ id, week }) {
  const profile = await queries.findTeacherProfileById(id);
  if (!profile) throw notFound(ERROR_CODES.TEACHER_NOT_FOUND, 'Teacher not found.');

  const schoolYear = await queries.findCurrentSchoolYear();
  const yearId = schoolYear?.id ?? 0;
  const [subjects, homeroomClasses, assignmentRows, scheduleRows] = await Promise.all([
    queries.findSubjectsOfTeacher(id),
    queries.findHomeroomClassesOfTeacher(id, yearId),
    queries.findAssignmentsOfTeacher(id, yearId),
    queries.findWeekSchedule(id, week),
  ]);
  return format.toTeacherDetail({ profile, subjects, homeroomClasses, assignmentRows, scheduleRows, schoolYear });
}

// SCR-17 subject picker. ASSUMPTION: served from FE-03 until FE-04 publishes GET /subjects.
export async function listSubjectOptions() {
  return format.toSubjectOptions(await queries.findActiveSubjects());
}

// SCR-17 department picker: the departments list (tổ chuyên môn).
export async function listDepartmentOptions() {
  return format.toDepartmentOptions(await queries.findActiveDepartments());
}

// SCR-17 / UC-17 – update full name, department and subjects (input already validated).
// departmentId: undefined = keep the current department, null = none, id = that department of the list.
export async function updateTeacher({ id, fullName, departmentId, subjectIds }) {
  return withTransaction(async (conn) => {
    const teacher = await queries.lockTeacherForUpdate(id, conn);
    if (!teacher) throw notFound(ERROR_CODES.TEACHER_NOT_FOUND, 'Teacher not found.');

    const found = await queries.countActiveSubjectsByIds(subjectIds, conn);
    if (found !== subjectIds.length) throw badRequest(ERROR_CODES.SUBJECT_INVALID, 'Unknown subject.', { field: 'subjectIds' });

    // business-rules §4: teaching assignments only for subjects the teacher can teach,
    // so a subject still used by a current or future assignment cannot be removed.
    const inUse = await queries.findAssignmentsBlockingSubjectRemoval(id, subjectIds, conn);
    if (inUse.length) {
      const bySubject = {};
      for (const r of inUse) (bySubject[r.subjectName] ??= new Set()).add(r.className);
      throw new AppError(409, ERROR_CODES.SUBJECT_IN_USE, 'Some removed subjects are still assigned to classes.', {
        subjects: Object.entries(bySubject).map(([name, classes]) => ({ name, classes: [...classes] })),
      });
    }

    // Department after this save: departmentId undefined = keep the current one.
    let department = teacher.department ? await queries.findActiveDepartmentByName(teacher.department, conn) : null;
    if (departmentId !== undefined) {
      department = null;
      if (departmentId !== null) {
        department = await queries.findActiveDepartmentById(departmentId, conn);
        if (!department) throw badRequest(ERROR_CODES.DEPARTMENT_INVALID, 'Unknown department.', { field: 'departmentId' });
      }
    }

    // business-rules §4 (07/11/2026): a subject ADDED to a teacher must belong to the teacher's department or to no
    // department. ASSUMPTION: subjects the teacher already has are kept even when they are outside the department
    // (data from before the rule, or a department change) – the School Manager removes them when needed.
    const current = new Set((await queries.findSubjectsOfTeacher(id, conn)).map((s) => String(s.subjectId)));
    const added = subjectIds.filter((sid) => !current.has(String(sid)));
    if (added.length && (await queries.hasDepartmentSubjects(conn))) {
      const deptId = department ? String(department.departmentId) : null;
      const outside = (await queries.findDepartmentOfSubjects(added, conn))
        .filter((s) => s.departmentId != null && String(s.departmentId) !== deptId)
        .map((s) => s.name);
      if (outside.length) {
        throw badRequest(ERROR_CODES.SUBJECT_NOT_IN_DEPARTMENT, 'Some subjects belong to another department.', {
          field: 'subjectIds',
          subjects: outside,
          department: department?.name ?? null,
        });
      }
    }

    await queries.updateUserFullName(teacher.userId, fullName, conn);
    // teachers.department keeps the name, spelled exactly as in the list
    if (departmentId !== undefined) await queries.updateDepartment(id, department?.name ?? null, conn);
    await queries.replaceTeacherSubjects(id, subjectIds, conn);
    return { teacherId: Number(id) };
  });
}
