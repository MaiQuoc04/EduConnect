import * as homeroomService from './homeroom.service.js';
import { homeroomBoardQuery, saveHomeroomRequest } from './teacher.validation.js';

// GET /api/v1/homeroom-assignments?schoolYearId=  (SCR-18, UC-19)
export async function getBoard(req, res) {
  res.json(await homeroomService.getHomeroomBoard(homeroomBoardQuery(req)));
}

// PUT /api/v1/homeroom-assignments  (SCR-18, UC-19)
export async function save(req, res) {
  res.json(await homeroomService.saveHomeroomAssignments(saveHomeroomRequest(req)));
}
