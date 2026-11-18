import { sendWorkbook } from '../../utils/excel.js';
import * as reports from './attendance.reports.js';
import * as service from './attendance.service.js';

// FE-12 Attendance Management (owner: Quoc). Thin handlers: validation, scope and SQL live in the services.

export async function options(_req, res) {
  res.json(await service.options());
}
export async function classes(req, res) {
  res.json(await service.listClasses(req.query, req.user));
}
export async function myLessons(req, res) {
  res.json(await service.myLessons(req.query, req.user));
}
export async function classLessons(req, res) {
  res.json(await service.classLessons(req.params.classId, req.query, req.user));
}
export async function getSheet(req, res) {
  res.json(await service.getSheet(req.params.lessonId, req.user));
}
export async function saveSheet(req, res) {
  res.json(await service.saveSheet(req.params.lessonId, req.body, req.user));
}
export async function lessonHistory(req, res) {
  res.json(await service.lessonHistory(req.params.lessonId, req.user));
}

export async function classReport(req, res) {
  res.json(await reports.classReport(req.params.classId, req.query, req.user));
}
export async function exportClassReport(req, res) {
  const { workbook, filename } = await reports.exportClassReport(req.params.classId, req.query, req.user);
  await sendWorkbook(res, workbook, filename);
}
export async function myStudents(req, res) {
  res.json(await reports.myStudents(req.user));
}
export async function studentAttendance(req, res) {
  res.json(await reports.studentAttendance(req.params.studentId, req.query, req.user));
}
export async function stats(req, res) {
  res.json(await reports.schoolStats(req.query));
}
export async function missing(req, res) {
  res.json(await reports.missingLessons(req.query));
}
export async function exportStats(req, res) {
  const { workbook, filename } = await reports.exportStats(req.query);
  await sendWorkbook(res, workbook, filename);
}
