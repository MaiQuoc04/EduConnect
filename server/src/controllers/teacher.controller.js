import * as teacherService from '../services/teacher.service.js';

// Controllers only pass validated input (req.validated, see validators/) to the service and send the result.

// GET /api/v1/teachers  (SCR-13, UC-15)
export async function listTeachers(req, res) {
  res.json(await teacherService.listTeachers(req.validated));
}

// GET /api/v1/teachers/subject-options  (SCR-15 subject picker)
export async function listSubjectOptions(_req, res) {
  res.json(await teacherService.listSubjectOptions());
}

// GET /api/v1/teachers/:id?week=YYYY-MM-DD  (SCR-14, UC-16)
export async function getTeacher(req, res) {
  res.json(await teacherService.getTeacherDetail(req.validated));
}

// PATCH /api/v1/teachers/:id  (SCR-15, UC-17)
export async function updateTeacher(req, res) {
  res.json(await teacherService.updateTeacher(req.validated));
}
