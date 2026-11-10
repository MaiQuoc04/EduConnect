import * as calendarService from './calendar.service.js';
import { listQuery } from './calendar.validation.js';

// FE-10 class calendar (Dung, It3). Controllers check the request, call the service and send the result.

// GET /api/v1/class-events?from=&to=&classId=&childId=  (SCR-39, UC-76)
export async function list(req, res) {
  res.json(await calendarService.listEvents(listQuery(req), req.user));
}
