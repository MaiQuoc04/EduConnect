import { api } from './client.js';

// FE-09 Notifications (owner: Quoc). Server: /api/v1/notifications – always the caller's own rows under the ACTIVE role.

// params: { personal, unread, studentId, page, pageSize }
export const listNotifications = (params) => api.get('/notifications', { params }).then((r) => r.data);
export const getUnreadCount = () => api.get('/notifications/unread-count').then((r) => r.data.unreadCount);
export const markNotificationRead = (id) => api.patch(`/notifications/${id}/read`).then((r) => r.data);
// body: { personal?, studentId? } – what the open list shows
export const markAllNotificationsRead = (body) => api.post('/notifications/read-all', body ?? {}).then((r) => r.data);

// UC-68 (teacher)
export const listSentNotifications = (params) => api.get('/notifications/sent', { params }).then((r) => r.data);
export const getSentNotification = (id) => api.get(`/notifications/sent/${id}`).then((r) => r.data);
