import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './notifications.controller.js';

// FE-09 Notifications (owner: Quoc), mounted at /notifications. permissions.md: "Notification – View" Full for every
// role (each sees only their own rows under the active role); "Notification read status" (UC-68) for teachers, about
// the class events and activities they created (note 18).
const router = Router();

router.use(requireAuth);

router.get('/', ctrl.list); // UC-67 ?personal&unread&studentId&page&pageSize
router.get('/unread-count', ctrl.unreadCount);
router.post('/read-all', ctrl.markAllRead); // { personal?, studentId? }
router.get('/sent', requireRole('TEACHER'), ctrl.listSent); // UC-68
router.get('/sent/:notificationId', requireRole('TEACHER'), ctrl.sentDetail); // UC-68
router.patch('/:notificationId/read', ctrl.markRead);

export default router;
