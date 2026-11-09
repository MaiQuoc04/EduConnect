// FE-03 (Dung) – UC-114 Manage Departments (tổ chuyên môn), agreed with the lead 07/11/2026 (business-rules §4).
// School Manager creates, renames and deletes departments and chooses the subjects of each one. A subject belongs to
// at most one department. teachers.department stores the department NAME, so a rename is copied to its teachers.
import { withTransaction } from '../../config/db.js';
import { AppError, badRequest, notFound } from '../../utils/AppError.js';
import { ERROR_CODES } from './teacher.constants.js';
import * as queries from './teacher.queries.js';
import { departmentKey } from './teacher.text.js';

// GET /departments – the departments (with subjects and teacher count) and every subject with its department.
export async function listDepartments() {
  const [departments, subjects] = await Promise.all([queries.findDepartmentsWithSubjects(), queries.findActiveSubjects()]);
  return { departments, subjects };
}

// Same name as another department, ignoring case, accents and the kind of dash ("Tổ toán - tin" = "Tổ Toán – Tin").
function sameNameAs(all, name, exceptId) {
  const key = departmentKey(name);
  return all.find((d) => String(d.departmentId) !== String(exceptId) && departmentKey(d.name) === key) ?? null;
}

async function checkSubjects(departmentId, subjectIds, conn) {
  if (!subjectIds.length) return;
  const found = await queries.countActiveSubjectsByIds(subjectIds, conn);
  if (found !== subjectIds.length) throw badRequest(ERROR_CODES.SUBJECT_INVALID, 'Unknown subject.', { field: 'subjectIds' });
  const taken = await queries.findSubjectsInOtherDepartments(departmentId, subjectIds, conn);
  if (taken.length) {
    throw new AppError(409, ERROR_CODES.SUBJECT_IN_OTHER_DEPARTMENT, 'Some subjects already belong to another department.', { items: taken });
  }
}

export async function createDepartment({ name, subjectIds }) {
  const departmentId = await withTransaction(async (conn) => {
    const all = await queries.findAllDepartmentNames(conn);
    const clash = sameNameAs(all.filter((d) => !d.deleted), name);
    if (clash) throw new AppError(409, ERROR_CODES.DEPARTMENT_NAME_TAKEN, 'A department with this name already exists.', { name: clash.name });

    let id;
    const deleted = all.find((d) => d.deleted && d.name === name);
    if (deleted) {
      // department_name is UNIQUE (deleted rows too): a deleted department with exactly this name comes back.
      id = deleted.departmentId;
      await queries.restoreDepartment(id, conn);
    } else {
      await freeNameOfDeleted(all, name, conn);
      id = await queries.insertDepartment(name, conn);
    }
    await checkSubjects(id, subjectIds, conn);
    await queries.replaceDepartmentSubjects(id, subjectIds, conn);
    return id;
  });
  return { departmentId: Number(departmentId) };
}

// A deleted department that differs only by case / accents still blocks the UNIQUE name: give it a free name.
async function freeNameOfDeleted(all, name, conn) {
  const old = all.find((d) => d.deleted && d.name === name);
  if (old) await queries.renameDepartment(old.departmentId, `${name.slice(0, 80)} (đã xoá #${old.departmentId})`, conn);
}

export async function updateDepartment(id, { name, subjectIds }) {
  await withTransaction(async (conn) => {
    const all = await queries.findAllDepartmentNames(conn);
    const current = all.find((d) => String(d.departmentId) === String(id) && !d.deleted);
    if (!current) throw notFound(ERROR_CODES.DEPARTMENT_NOT_FOUND, 'Department not found.');

    if (name !== undefined && name !== current.name) {
      const clash = sameNameAs(all.filter((d) => !d.deleted), name, id);
      if (clash) throw new AppError(409, ERROR_CODES.DEPARTMENT_NAME_TAKEN, 'A department with this name already exists.', { name: clash.name });
      await freeNameOfDeleted(all, name, conn);
      await queries.renameDepartment(id, name, conn);
      await queries.renameTeachersDepartment(current.name, name, conn); // teachers.department keeps the name
    }
    if (subjectIds !== undefined) {
      await checkSubjects(id, subjectIds, conn);
      await queries.replaceDepartmentSubjects(id, subjectIds, conn);
    }
  });
  return { departmentId: Number(id) };
}

// ASSUMPTION: a department that still has teachers cannot be deleted (move the teachers first on Update Teacher),
// so no teacher is left with a name that is not in the list. Its subjects become subjects of no department.
export async function deleteDepartment(id) {
  await withTransaction(async (conn) => {
    const all = await queries.findAllDepartmentNames(conn);
    const current = all.find((d) => String(d.departmentId) === String(id) && !d.deleted);
    if (!current) throw notFound(ERROR_CODES.DEPARTMENT_NOT_FOUND, 'Department not found.');
    const teachers = await queries.countTeachersInDepartment(current.name, conn);
    if (teachers > 0) throw new AppError(409, ERROR_CODES.DEPARTMENT_IN_USE, 'The department still has teachers.', { teachers });
    await queries.replaceDepartmentSubjects(id, [], conn);
    await queries.softDeleteDepartment(id, conn);
  });
}
