import { api } from './client.js';

// GET /api/v1/teaching-assignments?schoolYearId=&from=&to=  (SCR-19, UC-18)
// Every assignment overlapping [from, to] is returned, with its teacher and dates.
export async function getTeachingBoard({ schoolYearId, from, to } = {}) {
  const params = {};
  if (schoolYearId) params.schoolYearId = schoolYearId;
  if (from) params.from = from;
  if (to) params.to = to;
  const res = await api.get('/teaching-assignments', { params });
  return res.data; // { schoolYears, schoolYear, from, to, today, subjects, classes, assignments, teachers, rules }
}

// PUT /api/v1/teaching-assignments – each change applies to [startDate, endDate] (endDate empty = end of the year)
export async function saveTeachingAssignments({ schoolYearId, startDate, endDate, changes }) {
  const res = await api.put('/teaching-assignments', { schoolYearId, startDate, endDate: endDate || null, changes });
  return res.data; // fresh board for [startDate, endDate]
}
