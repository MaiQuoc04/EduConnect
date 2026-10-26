import * as subjectService from './subjects.service.js';

export async function list(req, res) {
  res.json(await subjectService.listSubjects({ schoolYearId: req.query.schoolYearId }));
}

export async function detail(req, res) {
  res.json(await subjectService.getSubject(req.params.id, { schoolYearId: req.query.schoolYearId }));
}

export async function create(req, res) {
  const { subjectCode, subjectName } = req.body ?? {};
  res.status(201).json(await subjectService.createSubject({ subjectCode, subjectName }));
}

export async function update(req, res) {
  const { subjectCode, subjectName } = req.body ?? {};
  res.json(await subjectService.updateSubject(req.params.id, { subjectCode, subjectName }));
}
