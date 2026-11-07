import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './conversations.controller.js';

// FE-06 Messaging (owner: Khanh). Screens SCR-43 Group Chat, SCR-49 Conversation List, SCR-50 Chat Room.
// The System Admin sees no content (business-rules §2); the data scope of the other roles is checked in the service
// (FE-04 groupAccess.js). Real-time events ("message:new", "message:read") go out through src/sockets.
const router = Router();

router.use(requireAuth, requireRole('SCHOOL_MANAGER', 'TEACHER', 'STUDENT', 'PARENT'));

router.get('/', ctrl.list); // UC-48 View Conversation List (last message, unread count)
router.get('/contacts', ctrl.contacts); // UC-49 Send Private Message: who one may write to
router.post('/direct', ctrl.openDirect); // UC-49: open (or create) the 1-1 chat with someone
router.get('/:groupId/messages', ctrl.messages); // UC-47 Chat in Group (read)
router.post('/:groupId/messages', ctrl.send); // UC-47 Chat in Group (send)
router.post('/:groupId/read', ctrl.read); // UC-47 read receipts
router.put('/:groupId/messages/:messageId/reaction', ctrl.setReaction); // UC-111 React to Message
router.delete('/:groupId/messages/:messageId/reaction', ctrl.removeReaction);
router.delete('/:groupId/messages/:messageId', ctrl.deleteMessage); // UC-113 Delete Message, ?scope=everyone | me

export default router;
