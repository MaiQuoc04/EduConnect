import { sendWorkbook } from '../../utils/excel.js';
import * as control from './control.service.js';
import * as book from './gradebook.service.js';
import * as gradeImport from './gradeImport.service.js';
import * as results from './results.service.js';
import * as structure from './structure.service.js';

// FE-11 Grade Management (owner: Linh). A grade book is addressed as /books/:classId/:subjectId?semesterId=…
const bookParams = (req) => ({ classId: req.params.classId, subjectId: req.params.subjectId, semesterId: req.query.semesterId });

export async function options(_req, res) {
  res.json(await results.options());
}

// UC-81, UC-82 (School Manager)
export async function listStructures(req, res) {
  res.json(await structure.listStructures(req.query));
}
export async function getStructure(req, res) {
  res.json(await structure.getStructure(req.params));
}
export async function saveStructure(req, res) {
  res.json(await structure.saveStructure(req.params, req.body));
}
export async function copyStructure(req, res) {
  res.json(await structure.copyStructure(req.body));
}

// UC-83, UC-84, UC-85 (teacher); book view also for School Manager and the class's teachers
export async function myBooks(req, res) {
  res.json(await control.myBooks(req.query, req.user));
}
export async function getBook(req, res) {
  res.json(await book.getBook(bookParams(req), req.user));
}
export async function saveGrades(req, res) {
  res.json(await book.saveGrades(bookParams(req), req.body, req.user));
}
export async function finalize(req, res) {
  res.json(await book.finalizeBook(bookParams(req), req.user));
}
export async function importTemplate(req, res) {
  const { workbook, filename } = await gradeImport.buildTemplate(bookParams(req), req.user);
  await sendWorkbook(res, workbook, filename);
}
export async function importPreview(req, res) {
  res.json(await gradeImport.previewImport(bookParams(req), req.file, req.user));
}
export async function importRun(req, res) {
  res.json(await gradeImport.importGrades(bookParams(req), req.file, req.user));
}

// UC-86, UC-87 (School Manager)
export async function listBooks(req, res) {
  res.json(await control.listBooks(req.query));
}
export async function unlock(req, res) {
  res.json(await control.unlockBook(bookParams(req), req.body, req.user, req.ip));
}
export async function history(req, res) {
  res.json(await control.listHistory(req.query));
}

// UC-88, UC-89
export async function classes(req, res) {
  res.json(await results.listClasses(req.query, req.user));
}
export async function classResults(req, res) {
  res.json(await results.classResults(req.params.classId, req.query, req.user));
}
export async function myStudents(req, res) {
  res.json(await results.myStudents(req.user));
}
export async function studentResults(req, res) {
  res.json(await results.studentResults(req.params.studentId, req.query, req.user));
}
