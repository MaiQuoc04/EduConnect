import { api } from './client.js';

// FE-10 school calendar (Dung). Server: server/src/modules/calendar/schoolEvents.*

export async function getUpcomingSchoolEvents(limit = 5) {
  const { data } = await api.get('/school-events/upcoming', { params: { limit } });
  return data;
}

export async function getPastSchoolEvents(limit = 20) {
  const { data } = await api.get('/school-events/past', { params: { limit } });
  return data;
}

// Events touching [from, to] (YYYY-MM-DD, at most 62 days); classId: whole school + that class's grade
export async function getSchoolEvents({ from, to, classId }) {
  const { data } = await api.get('/school-events', { params: { from, to, ...(classId ? { classId } : {}) } });
  return data;
}

export async function getSchoolEvent(eventId) {
  const { data } = await api.get(`/school-events/${eventId}`);
  return data;
}

export async function getSchoolEventOptions() {
  const { data } = await api.get('/school-events/options');
  return data;
}

export async function createSchoolEvent(body) {
  const { data } = await api.post('/school-events', body);
  return data;
}

export async function updateSchoolEvent(eventId, body) {
  const { data } = await api.put(`/school-events/${eventId}`, body);
  return data;
}

export async function deleteSchoolEvent(eventId) {
  const { data } = await api.delete(`/school-events/${eventId}`);
  return data;
}
