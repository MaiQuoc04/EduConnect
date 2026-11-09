import * as teacherService from './teacher.service.js';
import { listTeachersQuery, teacherDetailRequest, updateTeacherRequest } from './teacher.validation.js';

// Controllers validate the request (teacher.validation.js), call the service and send the result.

// GET /api/v1/teachers  (SCR-14, UC-15)
export async function listTeachers(req, res) {
  res.json(await teacherService.listTeachers(listTeachersQuery(req)));
}

// GET /api/v1/teachers/export  (SCR-14, UC-115) – same filters as the list, every page, .xlsx
export async function exportTeachers(req, res) {
  const { page, limit, ...filters } = listTeachersQuery(req);
  const { fileName, contentType, buffer } = await teacherService.exportTeachers(filters);
  res
    .set('Content-Type', contentType)
    .set('Content-Disposition', `attachment; filename="${fileName}"`)
    .set('Cache-Control', 'no-store')
    .send(buffer);
}

// GET /api/v1/teachers/subject-options  (SCR-17 subject picker)
export async function listSubjectOptions(_req, res) {
  res.json(await teacherService.listSubjectOptions());
}

// GET /api/v1/teachers/department-options  (SCR-17 department picker)
export async function listDepartmentOptions(_req, res) {
  res.json(await teacherService.listDepartmentOptions());
}

// GET /api/v1/teachers/:id?week=YYYY-MM-DD  (SCR-15, UC-16)
export async function getTeacher(req, res) {
  res.json(await teacherService.getTeacherDetail(teacherDetailRequest(req)));
}

// PATCH /api/v1/teachers/:id  (SCR-17, UC-17)
export async function updateTeacher(req, res) {
  res.json(await teacherService.updateTeacher(updateTeacherRequest(req)));
}
