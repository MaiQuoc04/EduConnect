import * as service from './schoolEvents.service.js';
import { rangeQuery, schoolEventBody, schoolEventIdParam, upcomingQuery } from './schoolEvents.validation.js';

// School calendar (FE-10, Dung) – mounted at /api/v1/school-events.
export const list = async (req, res) => res.json(await service.listSchoolEvents(rangeQuery(req), req.user));
export const upcoming = async (req, res) => res.json(await service.upcomingSchoolEvents(upcomingQuery(req), req.user));
export const past = async (req, res) => res.json(await service.pastSchoolEvents(upcomingQuery(req), req.user));
export const options = async (req, res) => res.json(await service.schoolEventOptions());
export const detail = async (req, res) => res.json(await service.getSchoolEvent(schoolEventIdParam(req), req.user));
export const create = async (req, res) => res.status(201).json(await service.createSchoolEvent(schoolEventBody(req, { create: true }), req.user));
export const update = async (req, res) =>
  res.json(await service.updateSchoolEvent(schoolEventIdParam(req), schoolEventBody(req, { create: false }), req.user));
export const remove = async (req, res) => res.json(await service.deleteSchoolEvent(schoolEventIdParam(req), req.user));
