import { api } from './client.js';

// GET /api/v1/homeroom-assignments?schoolYearId=  (SCR-16, UC-19)
export async function getHomeroomBoard(schoolYearId) {
  const res = await api.get('/homeroom-assignments', { params: schoolYearId ? { schoolYearId } : {} });
  return res.data; // { schoolYears, schoolYear, classes, teachers, rules }
}

// PUT /api/v1/homeroom-assignments – changes: [{ classId, teacherId|null, previousTeacherId|null }]
export async function saveHomeroomAssignments(schoolYearId, changes) {
  const res = await api.put('/homeroom-assignments', { schoolYearId, changes });
  return res.data; // fresh board
}
