import { notFound, badRequest } from '../../utils/AppError.js';
import * as teacherService from './teacher.service.js';

// GET /api/v1/teachers
export async function listTeachers(req, res) {
  const { page = 1, limit = 10, search = '', subject = '', homeroom = '', status = '' } = req.query;
  const result = await teacherService.listTeachers({
    page: Number(page),
    limit: Math.min(Number(limit), 100),
    search: String(search).trim(),
    subject: String(subject).trim(),
    homeroom: String(homeroom).trim(),
    status: String(status).trim(),
  });
  res.json(result);
}

// GET /api/v1/teachers/:id?week=YYYY-MM-DD  (SCR-14, UC-16)
export async function getTeacher(req, res) {
  const id = String(req.params.id);
  if (!/^\d{1,18}$/.test(id)) throw notFound('TEACHER_NOT_FOUND', 'Teacher not found.');
  const week = req.query.week ? String(req.query.week) : null;
  if (week && !/^\d{4}-\d{2}-\d{2}$/.test(week)) throw badRequest('INVALID_DATE', 'week must be YYYY-MM-DD.');
  res.json(await teacherService.getTeacherDetail(id, { week }));
}

// GET /api/v1/teachers/subject-options  (SCR-15 subject picker)
export async function subjectOptions(_req, res) {
  res.json(await teacherService.listSubjectOptions());
}

// PATCH /api/v1/teachers/:id  (SCR-15, UC-17) – body: { fullName, department, subjectIds }
export async function updateTeacher(req, res) {
  const id = String(req.params.id);
  if (!/^\d{1,18}$/.test(id)) throw notFound('TEACHER_NOT_FOUND', 'Teacher not found.');
  const { fullName, department, subjectIds } = req.body ?? {};
  res.json(await teacherService.updateTeacher(id, { fullName, department, subjectIds }));
}
