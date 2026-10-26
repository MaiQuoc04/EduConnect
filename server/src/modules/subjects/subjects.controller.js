import * as subjectService from './subjects.service.js';

export async function list(req, res) {
  res.json(await subjectService.listSubjects({ schoolYearId: req.query.schoolYearId }));
}
