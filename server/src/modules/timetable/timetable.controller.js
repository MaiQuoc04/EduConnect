import * as timetableImport from './timetable.import.js';
import * as periodTimes from './timetable.periods.js';
import * as timetableService from './timetable.service.js';
import { classIdParam, dateQuery, importRequest, listQuery, periodTimesRequest, saveRequest } from './timetable.validation.js';

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

// GET /api/v1/timetables/viewable-classes  (UC-74 picker: own class / children / taught classes)
export async function viewable(req, res) {
  res.json(await timetableService.viewableClasses(req.user));
}

// GET /api/v1/timetables/classes/:classId/week?date=  (SCR-29 / SCR-45 / SCR-46, UC-74)
export async function classWeek(req, res) {
  res.json(await timetableService.classWeek({ classId: classIdParam(req), ...dateQuery(req) }, req.user));
}

// GET /api/v1/timetables/teaching-schedule/week?date=  (SCR-57 / SCR-58, UC-75)
export async function teachingWeek(req, res) {
  res.json(await timetableService.teachingWeek(dateQuery(req), req.user));
}

// GET /api/v1/timetables/period-times  (School Manager: start of each session and period length)
export async function getPeriodTimes(req, res) {
  res.json(await periodTimes.getPeriodTimes());
}

// PUT /api/v1/timetables/period-times  { sessionStarts, duration, stamp }
export async function updatePeriodTimes(req, res) {
  res.json(await periodTimes.updatePeriodTimes(periodTimesRequest(req), req.user, req.ip));
}
