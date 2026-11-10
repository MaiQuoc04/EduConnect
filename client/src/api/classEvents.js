import { api } from './client.js';

// FE-10 class calendar (Dung, It3). Server: server/src/modules/calendar. Times are Vietnam time "YYYY-MM-DDTHH:MM".

// UC-76 – events the user may see between two dates (max 62 days); parents may filter by child
export async function getClassEvents({ from, to, classId, childId }) {
  const { data } = await api.get('/class-events', { params: { from, to, classId: classId || undefined, childId: childId || undefined } });
  return data;
}

// UC-77 – one event (creator and homeroom teacher also get `viewers`)
export async function getClassEvent(eventId) {
  const { data } = await api.get(`/class-events/${eventId}`);
  return data;
}

// SCR-40 / SCR-42 form – classes and subjects the teacher may use, categories
export async function getClassEventOptions() {
  const { data } = await api.get('/class-events/options');
  return data;
}

// SCR-40 / SCR-42 – students, parents and teachers of a class (pick people one by one)
export async function getClassPeople(classId) {
  const { data } = await api.get(`/class-events/classes/${classId}/people`);
  return data;
}

// UC-78 – { classId, subjectId|null, categoryId, title, description, startAt, endAt, forStudents, forParents,
// forSubjectTeachers, viewerIds }
export async function createClassEvent(body) {
  const { data } = await api.post('/class-events', body);
  return data;
}
