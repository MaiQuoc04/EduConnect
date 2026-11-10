import { api } from './client.js';

// FE-10 class calendar (Dung, It3). Server: server/src/modules/calendar. Times are Vietnam time "YYYY-MM-DDTHH:MM".

// UC-76 – events the user may see between two dates (max 62 days); parents may filter by child
export async function getClassEvents({ from, to, classId, childId }) {
  const { data } = await api.get('/class-events', { params: { from, to, classId: classId || undefined, childId: childId || undefined } });
  return data;
}
