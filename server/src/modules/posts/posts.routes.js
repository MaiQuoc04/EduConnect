import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './posts.controller.js';

// FE-05 Group Feed (owner: Khanh). Mounted at /api/v1 (routes.js) because it serves two kinds of path: the feed of a
// group (/groups/:groupId/posts) and one post (/posts/:postId). permissions.md "Group feed" rows: System Admin No
// (403 here); for everyone else the group, the moderator and the post state are checked in the service.
const member = [requireAuth, requireRole('SCHOOL_MANAGER', 'TEACHER', 'STUDENT', 'PARENT')];

const router = Router();

router.get('/groups/:groupId/posts', ...member, ctrl.list); // UC-36 (+ UC-46 queue: ?view=pending)
router.post('/groups/:groupId/posts', ...member, ctrl.create); // UC-38
router.put('/groups/:groupId/post-approval', ...member, ctrl.setApproval); // §5 approval switch (moderator)

// File picker limits (before '/posts/:postId', which would read the path as an id).
router.get('/posts/attachment-limits', ...member, ctrl.attachmentLimits); // UC-38 / UC-39
router.get('/posts/:postId', ...member, ctrl.detail); // UC-37
router.patch('/posts/:postId', ...member, ctrl.update); // UC-39
router.delete('/posts/:postId', ...member, ctrl.remove); // UC-40
router.put('/posts/:postId/like', ...member, ctrl.like); // UC-43
router.delete('/posts/:postId/like', ...member, ctrl.unlike); // UC-43
router.get('/posts/:postId/comments', ...member, ctrl.listComments); // UC-41
router.post('/posts/:postId/comments', ...member, ctrl.createComment); // UC-41
router.delete('/posts/:postId/comments/:commentId', ...member, ctrl.removeComment); // UC-42, UC-45
router.patch('/posts/:postId/pin', ...member, ctrl.pin); // UC-44
router.patch('/posts/:postId/hide', ...member, ctrl.hide); // UC-45
router.post('/posts/:postId/review', ...member, ctrl.review); // UC-46

export default router;
