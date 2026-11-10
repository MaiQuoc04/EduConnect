import * as calendarService from './calendar.service.js';
import { classIdParam, eventBody, eventIdParam, listQuery } from './calendar.validation.js';

// FE-10 class calendar (Dung, It3). Controllers check the request, call the service and send the result.

// GET /api/v1/class-events?from=&to=&classId=&childId=  (SCR-39, UC-76)
export async function list(req, res) {
  res.json(await calendarService.listEvents(listQuery(req), req.user));
}

// GET /api/v1/class-events/options  (SCR-40 / SCR-42 form: classes, subjects, categories)
export async function options(req, res) {
  res.json(await calendarService.formOptions(req.user));
}

// GET /api/v1/class-events/classes/:classId/people  (pick people one by one)
export async function people(req, res) {
  res.json(await calendarService.people(classIdParam(req), req.user));
}

// GET /api/v1/class-events/:eventId  (SCR-41, UC-77)
export async function detail(req, res) {
  res.json(await calendarService.getEvent(eventIdParam(req), req.user));
}

// POST /api/v1/class-events  (SCR-40, UC-78)
export async function create(req, res) {
  res.status(201).json(await calendarService.createEvent(eventBody(req, { create: true }), req.user));
}

// PUT /api/v1/class-events/:eventId  (SCR-42, UC-79)
export async function update(req, res) {
  const eventId = eventIdParam(req);
  res.json(await calendarService.updateEvent(eventId, eventBody(req, { create: false }), req.user));
}
