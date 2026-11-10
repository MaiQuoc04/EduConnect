import * as timetableImport from './timetable.import.js';
import * as timetableService from './timetable.service.js';
import { classIdParam, dateQuery, importRequest, listQuery, saveRequest } from './timetable.validation.js';

// FE-10 timetable (Dung). Controllers check the request, call the service and send the result.

// GET /api/v1/timetables?schoolYearId=  (SCR-27, UC-70)
export async function list(req, res) {
  res.json(await timetableService.listClasses(listQuery(req)));
}

// GET /api/v1/timetables/classes/:classId/edit?date=  (SCR-28 / SCR-30 editor data, UC-71 / UC-73)
export async function editor(req, res) {
  res.json(await timetableService.getEditor({ classId: classIdParam(req), ...dateQuery(req) }));
}

// PUT /api/v1/timetables/classes/:classId  { startDate, endDate?, entries }  (UC-71 / UC-73)
export async function save(req, res) {
  res.json(await timetableService.saveClassTimetable(saveRequest(req), req.user));
}

// GET /api/v1/timetables/import/template?schoolYearId=  (UC-72)
export async function importTemplate(req, res) {
  const { fileName, contentType, buffer } = await timetableImport.buildTemplate(listQuery(req));
  res.set('Content-Type', contentType).set('Content-Disposition', `attachment; filename="${fileName}"`).send(buffer);
}

// POST /api/v1/timetables/import/preview  (multipart: file, schoolYearId, startDate, endDate) – nothing is saved
export async function importPreview(req, res) {
  res.json(await timetableImport.previewImport(importRequest(req), req.user));
}

// POST /api/v1/timetables/import  – all classes of the file, or none
export async function importRun(req, res) {
  res.status(201).json(await timetableImport.importTimetables(importRequest(req), req.user));
}
