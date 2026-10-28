import { notFound } from '../../utils/AppError.js';
import * as teachingService from './teaching.service.js';

// GET /api/v1/teaching-assignments?schoolYearId=&date=YYYY-MM-DD  (SCR-17, UC-18)
export async function getBoard(req, res) {
  const { schoolYearId, date } = req.query;
  if (schoolYearId && !/^\d{1,18}$/.test(String(schoolYearId))) throw notFound('SCHOOL_YEAR_NOT_FOUND', 'School year not found.');
  res.json(
    await teachingService.getTeachingBoard({
      schoolYearId: schoolYearId ? String(schoolYearId) : undefined,
      date: date ? String(date) : undefined,
    }),
  );
}

// PUT /api/v1/teaching-assignments
// body: { schoolYearId, date, changes: [{ classId, subjectId, teacherId|null, previousTeacherId|null }] }
export async function save(req, res) {
  const { schoolYearId, date, changes } = req.body ?? {};
  res.json(await teachingService.saveTeachingAssignments({ schoolYearId, date, changes }));
}
