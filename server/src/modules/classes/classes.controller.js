import { sendWorkbook } from '../../utils/excel.js';
import * as classService from './classes.service.js';
import * as importService from './classImport.service.js';

export async function list(req, res) {
  res.json(await classService.listClasses({ schoolYearId: req.query.schoolYearId }));
}

export async function gradeLevels(_req, res) {
  res.json(await classService.listGradeLevels());
}

export async function eligibleStudents(req, res) {
  const { schoolYearId, q, gradeLevelId, allGrades, offset } = req.query;
  res.json(await classService.eligibleStudents({ schoolYearId, q, gradeLevelId, allGrades, offset }));
}

export async function resolveStudents(req, res) {
  const { schoolYearId, codes } = req.body ?? {};
  res.json(await classService.resolveStudents({ schoolYearId, codes }));
}

export async function classStudents(req, res) {
  res.json(await classService.classStudents(req.params.id, { forSchoolYearId: req.query.forSchoolYearId }));
}

export async function addStudents(req, res) {
  res.status(201).json(await classService.addStudents(req.params.id, { studentIds: req.body?.studentIds }, req.user.userId));
}

export async function create(req, res) {
  const { schoolYearId, className, gradeLevelId, trackId, studentIds } = req.body ?? {};
  res
    .status(201)
    .json(await classService.createClass({ schoolYearId, className, gradeLevelId, trackId, studentIds }, req.user.userId));
}

export async function importTemplate(_req, res) {
  await sendWorkbook(res, await importService.buildTemplate(), 'mau-nhap-danh-sach-lop.xlsx');
}

export async function importPreview(req, res) {
  res.json(await importService.previewImport({ schoolYearId: req.body?.schoolYearId, file: req.file }));
}

export async function importRun(req, res) {
  res.status(201).json(await importService.runImport({ schoolYearId: req.body?.schoolYearId, file: req.file }, req.user.userId));
}
