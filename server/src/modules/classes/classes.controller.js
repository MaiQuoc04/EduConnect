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
  res.json(await classService.eligibleStudents({ schoolYearId: req.query.schoolYearId, q: req.query.q }));
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
