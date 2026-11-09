import { findActiveDepartments } from '../teacher/teacher.queries.js';
import { departmentKey } from '../teacher/teacher.text.js';

// FE-13 (owner: Linh) – teacher departments on account create (UC-95) and import (UC-96), It1 closing item #2
// (iteration plan, 04/11/2026). The list is FE-03's `departments` table (read with FE-03's findActiveDepartments, no
// copied SQL); teachers.department keeps the list's NAME, so FE-03's Update Teacher (UC-17) finds it again.
// A department is optional; one that is not in the list is refused, never stored as typed.

// "Tổ  toán – khoa học TỰ NHIÊN", "to toan - khoa hoc tu nhien" give the same key (FE-03 departmentKey: any dash
// counts as "-", since a file typed in Excel usually has "-" where the list has "–").
const nameKey = (value) => departmentKey(value);

export const listDepartments = (db) => findActiveDepartments(db);

// Puts the list's spelling into input.teacher.department, or sets errors.department = 'NOT_IN_LIST'.
// `input.teacher.departmentId` (create form) wins over `input.teacher.department` (a name: import file).
export function applyDepartment(input, errors, departments) {
  const teacher = input.teacher;
  if (!teacher || errors.department) return;
  const { departmentId, department } = teacher;
  delete teacher.departmentId;
  if (departmentId == null && !department) return;
  const found =
    departmentId != null
      ? departments.find((d) => String(d.departmentId) === String(departmentId))
      : departments.find((d) => nameKey(d.name) === nameKey(department));
  if (found) teacher.department = found.name;
  else errors.department = 'NOT_IN_LIST';
}

// True when the teacher part names a department, i.e. the list has to be read.
export const needsDepartments = (input) =>
  Boolean(input.teacher && (input.teacher.departmentId != null || input.teacher.department));
