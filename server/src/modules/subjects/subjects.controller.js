import * as subjectService from './subjects.service.js';

export async function list(req, res) {
  res.json(await subjectService.listSubjects({ schoolYearId: req.query.schoolYearId }));
}

export async function detail(req, res) {
  res.json(await subjectService.getSubject(req.params.id, { schoolYearId: req.query.schoolYearId }));
}
