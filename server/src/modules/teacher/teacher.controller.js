import * as teacherService from './teacher.service.js';
import { listTeachersQuery, teacherDetailRequest, updateTeacherRequest } from './teacher.validation.js';

// Controllers validate the request (teacher.validation.js), call the service and send the result.

// GET /api/v1/teachers  (SCR-13, UC-15)
export async function listTeachers(req, res) {
  res.json(await teacherService.listTeachers(listTeachersQuery(req)));
}

// GET /api/v1/teachers/subject-options  (SCR-15 subject picker)
export async function listSubjectOptions(_req, res) {
  res.json(await teacherService.listSubjectOptions());
}

// GET /api/v1/teachers/department-options  (SCR-15 department picker)
export async function listDepartmentOptions(_req, res) {
  res.json(await teacherService.listDepartmentOptions());
}

// GET /api/v1/teachers/:id?week=YYYY-MM-DD  (SCR-14, UC-16)
export async function getTeacher(req, res) {
  res.json(await teacherService.getTeacherDetail(teacherDetailRequest(req)));
}

// PATCH /api/v1/teachers/:id  (SCR-15, UC-17)
export async function updateTeacher(req, res) {
  res.json(await teacherService.updateTeacher(updateTeacherRequest(req)));
}
