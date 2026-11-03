import * as teachingService from './teaching.service.js';
import { saveTeachingRequest, teachingBoardQuery } from './teacher.validation.js';

// GET /api/v1/teaching-assignments?schoolYearId=&date=  (SCR-19, UC-18)
export async function getBoard(req, res) {
  res.json(await teachingService.getTeachingBoard(teachingBoardQuery(req)));
}

// PUT /api/v1/teaching-assignments  (SCR-19, UC-18)
export async function save(req, res) {
  res.json(await teachingService.saveTeachingAssignments(saveTeachingRequest(req)));
}
