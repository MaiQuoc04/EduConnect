import * as semesterService from './semesters.service.js';

export async function create(req, res) {
  res.status(201).json(await semesterService.createSemesters(req.params.id, req.body?.semesters));
}

export async function update(req, res) {
  const { startDate, endDate } = req.body ?? {};
  res.json(await semesterService.updateSemester(req.params.id, req.params.semesterId, { startDate, endDate }));
}

export async function close(req, res) {
  res.json(await semesterService.closeSemester(req.params.id, req.params.semesterId));
}

export async function reopen(req, res) {
  res.json(await semesterService.reopenSemester(req.params.id, req.params.semesterId));
}
