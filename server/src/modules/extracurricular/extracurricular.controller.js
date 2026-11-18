import * as service from './extracurricular.service.js';
import {
  activityBody, eventIdParam, listQuery, registerBody, registrationQuery, studentIdParam,
} from './extracurricular.validation.js';

// FE-07 Extracurricular Event Management (Dung, It3). Thin handlers: input checks here, rules in the service.

export async function list(req, res) {
  res.json(await service.listActivities(req.user, listQuery(req)));
}

export async function options(req, res) {
  res.json(await service.formOptions(req.user));
}

export async function detail(req, res) {
  res.json(await service.getActivity(req.user, eventIdParam(req)));
}

export async function create(req, res) {
  res.status(201).json(await service.createActivity(req.user, activityBody(req, { create: true })));
}

export async function update(req, res) {
  res.json(await service.updateActivity(req.user, eventIdParam(req), activityBody(req, { create: false })));
}

export async function cancel(req, res) {
  res.json(await service.cancelActivity(req.user, eventIdParam(req)));
}

export async function register(req, res) {
  res.json(await service.registerChild(req.user, eventIdParam(req), registerBody(req)));
}

export async function unregister(req, res) {
  res.json(await service.cancelRegistration(req.user, eventIdParam(req), studentIdParam(req)));
}

export async function registrations(req, res) {
  res.json(await service.listRegistrations(req.user, eventIdParam(req), registrationQuery(req)));
}

export async function exportRegistrations(req, res) {
  const { fileName, contentType, buffer } = await service.exportRegistrations(req.user, eventIdParam(req), registrationQuery(req));
  res
    .set('Content-Type', contentType)
    .set('Content-Disposition', `attachment; filename="${fileName}"`)
    .set('Cache-Control', 'no-store')
    .send(buffer);
}
