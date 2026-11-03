import * as trackService from './class-tracks.service.js';

export async function list(req, res) {
  res.json(await trackService.listTracks({ schoolYearId: req.query.schoolYearId, gradeLevelId: req.query.gradeLevelId }));
}

export async function create(req, res) {
  const { trackName, description, gradeLevelIds } = req.body ?? {};
  res.status(201).json(await trackService.createTrack({ trackName, description, gradeLevelIds }));
}

export async function update(req, res) {
  const { trackName, description, gradeLevelId } = req.body ?? {};
  res.json(await trackService.updateTrack(req.params.id, { trackName, description, gradeLevelId }));
}

export async function remove(req, res) {
  await trackService.deleteTrack(req.params.id);
  res.status(204).end();
}

export async function subjects(req, res) {
  res.json(await trackService.getTrackSubjects(req.params.id, { schoolYearId: req.query.schoolYearId }));
}

export async function saveSubjects(req, res) {
  const { schoolYearId, items } = req.body ?? {};
  res.json(await trackService.saveTrackSubjects(req.params.id, { schoolYearId, items }));
}

export async function copy(req, res) {
  const { fromSchoolYearId, toSchoolYearId } = req.body ?? {};
  res.status(201).json(await trackService.copyYear({ fromSchoolYearId, toSchoolYearId }));
}
