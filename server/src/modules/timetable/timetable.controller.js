import * as timetableService from './timetable.service.js';
import { listQuery } from './timetable.validation.js';

// FE-10 timetable (Dung). Controllers check the request, call the service and send the result.

// GET /api/v1/timetables?schoolYearId=  (SCR-27, UC-70)
export async function list(req, res) {
  res.json(await timetableService.listClasses(listQuery(req)));
}
