import { api } from './client.js';

// FE-07 Extracurricular Event Management (Dung) – /api/v1/extracurricular-events. Times are Vietnam local time
// "YYYY-MM-DDTHH:MM".

// Activity list of a class: { classes, classId, canCreate, counts, items }. status: upcoming | past | all
export async function getActivities(params = {}) {
  const res = await api.get('/extracurricular-events', { params });
  return res.data;
}

// SCR-66 form: homeroom classes of open school years { classes, now, limits }
export async function getActivityOptions() {
  const res = await api.get('/extracurricular-events/options');
  return res.data;
}

export async function getActivity(eventId) {
  const res = await api.get(`/extracurricular-events/${eventId}`);
  return res.data;
}

export async function createActivity(body) {
  const res = await api.post('/extracurricular-events', body);
  return res.data;
}

export async function updateActivity(eventId, body) {
  const res = await api.put(`/extracurricular-events/${eventId}`, body);
  return res.data;
}

export async function cancelActivity(eventId) {
  const res = await api.post(`/extracurricular-events/${eventId}/cancel`);
  return res.data;
}

export async function registerChild(eventId, studentId) {
  const res = await api.post(`/extracurricular-events/${eventId}/registrations`, { studentId });
  return res.data;
}

export async function cancelChildRegistration(eventId, studentId) {
  const res = await api.delete(`/extracurricular-events/${eventId}/registrations/${studentId}`);
  return res.data;
}

// UC-56: { activity, counts, rows }. status: REGISTERED | CANCELLED | NONE | all
export async function getRegistrations(eventId, params = {}) {
  const res = await api.get(`/extracurricular-events/${eventId}/registrations`, { params });
  return res.data;
}

// UC-57: downloads the .xlsx with the same filters as the list.
export async function exportRegistrations(eventId, params = {}) {
  const res = await api.get(`/extracurricular-events/${eventId}/registrations/export`, { params, responseType: 'blob' });
  const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? 'dang-ky-ngoai-khoa.xlsx';
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
