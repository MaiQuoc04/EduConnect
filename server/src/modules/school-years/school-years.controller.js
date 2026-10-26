import * as schoolYearService from './school-years.service.js';

export async function list(_req, res) {
  res.json(await schoolYearService.listSchoolYears());
}

export async function detail(req, res) {
  res.json(await schoolYearService.getSchoolYear(req.params.id));
}

export async function create(req, res) {
  const { yearName, startDate, endDate } = req.body ?? {};
  res.status(201).json(await schoolYearService.createSchoolYear({ yearName, startDate, endDate }));
}

export async function update(req, res) {
  const { yearName, startDate, endDate } = req.body ?? {};
  res.json(await schoolYearService.updateSchoolYear(req.params.id, { yearName, startDate, endDate }));
}
