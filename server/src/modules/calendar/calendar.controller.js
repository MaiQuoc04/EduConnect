import * as calendarService from './calendar.service.js';
import { eventIdParam, listQuery } from './calendar.validation.js';

// FE-10 class calendar (Dung, It3). Controllers check the request, call the service and send the result.

// GET /api/v1/class-events?from=&to=&classId=&childId=  (SCR-39, UC-76)
export async function list(req, res) {
  res.json(await calendarService.listEvents(listQuery(req), req.user));
}

// GET /api/v1/class-events/:eventId  (SCR-41, UC-77)
export async function detail(req, res) {
  res.json(await calendarService.getEvent(eventIdParam(req), req.user));
}
