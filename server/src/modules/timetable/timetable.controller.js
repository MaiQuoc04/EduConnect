import * as timetableService from './timetable.service.js';
import { classIdParam, dateQuery, listQuery, saveRequest } from './timetable.validation.js';

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
