import * as service from './notifications.service.js';

// FE-09 Notifications (owner: Quoc). Every handler works on the caller's own rows under the ACTIVE role.

export async function list(req, res) {
  res.json(await service.listNotifications(req.user, req.query));
}
export async function unreadCount(req, res) {
  res.json({ unreadCount: await service.unreadCount(req.user) });
}
export async function markRead(req, res) {
  res.json(await service.markRead(req.user, req.params.notificationId));
}
export async function markAllRead(req, res) {
  res.json(await service.markAllRead(req.user, req.body ?? {}));
}
export async function listSent(req, res) {
  res.json(await service.listSent(req.user, req.query));
}
export async function sentDetail(req, res) {
  res.json(await service.sentDetail(req.user, req.params.notificationId));
}
