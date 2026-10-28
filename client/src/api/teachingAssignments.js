import { api } from './client.js';

// GET /api/v1/teaching-assignments?schoolYearId=&date=  (SCR-17, UC-18)
export async function getTeachingBoard({ schoolYearId, date } = {}) {
  const params = {};
  if (schoolYearId) params.schoolYearId = schoolYearId;
  if (date) params.date = date;
  const res = await api.get('/teaching-assignments', { params });
  return res.data; // { schoolYears, schoolYear, date, today, subjects, classes, assignments, teachers, rules }
}

// PUT /api/v1/teaching-assignments – changes effective from `date` to the end of the school year
export async function saveTeachingAssignments({ schoolYearId, date, changes }) {
  const res = await api.put('/teaching-assignments', { schoolYearId, date, changes });
  return res.data; // fresh board
}
