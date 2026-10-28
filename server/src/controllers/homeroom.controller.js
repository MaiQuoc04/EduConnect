import * as homeroomService from '../services/homeroom.service.js';

// GET /api/v1/homeroom-assignments?schoolYearId=  (SCR-16, UC-19)
export async function getBoard(req, res) {
  res.json(await homeroomService.getHomeroomBoard(req.validated));
}

// PUT /api/v1/homeroom-assignments  (SCR-16, UC-19)
export async function save(req, res) {
  res.json(await homeroomService.saveHomeroomAssignments(req.validated));
}
