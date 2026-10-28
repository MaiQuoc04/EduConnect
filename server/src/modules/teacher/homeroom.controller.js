import { notFound } from '../../utils/AppError.js';
import * as homeroomService from './homeroom.service.js';

// GET /api/v1/homeroom-assignments?schoolYearId=  (SCR-16, UC-19)
export async function getBoard(req, res) {
  const { schoolYearId } = req.query;
  if (schoolYearId && !/^\d{1,18}$/.test(String(schoolYearId))) {
    throw notFound('SCHOOL_YEAR_NOT_FOUND', 'School year not found.');
  }
  res.json(await homeroomService.getHomeroomBoard({ schoolYearId: schoolYearId ? String(schoolYearId) : undefined }));
}

// PUT /api/v1/homeroom-assignments  body: { schoolYearId, changes: [{ classId, teacherId, previousTeacherId }] }
export async function save(req, res) {
  const { schoolYearId, changes } = req.body ?? {};
  res.json(await homeroomService.saveHomeroomAssignments({ schoolYearId, changes }));
}
