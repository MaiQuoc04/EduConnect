import * as teachingService from '../services/teachingAssignment.service.js';

// GET /api/v1/teaching-assignments?schoolYearId=&date=  (SCR-17, UC-18)
export async function getBoard(req, res) {
  res.json(await teachingService.getTeachingBoard(req.validated));
}

// PUT /api/v1/teaching-assignments  (SCR-17, UC-18)
export async function save(req, res) {
  res.json(await teachingService.saveTeachingAssignments(req.validated));
}
