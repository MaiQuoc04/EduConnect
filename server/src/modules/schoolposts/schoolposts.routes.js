import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './schoolposts.controller.js';

// FE-08 School Feed (owner: Anh). permissions.md "School post – View": School Manager Full, Teacher / Homeroom
// Teacher / Student / Parent Restricted (8) "within the audience chosen by the author" – filtered in the service.
// System Admin: No (business-rules §1, sees no content) → 403. Checked against the active role.
const VIEW_ROLES = ['SCHOOL_MANAGER', 'TEACHER', 'STUDENT', 'PARENT'];

const router = Router();

router.get('/', requireAuth, requireRole(...VIEW_ROLES), ctrl.list); // UC-58
router.get('/:schoolPostId', requireAuth, requireRole(...VIEW_ROLES), ctrl.detail); // UC-59

// permissions.md "School post – Create / update / delete / pin": School Manager Full, every other role No
// (System Admin included, business-rules §1).
const manage = [requireAuth, requireRole('SCHOOL_MANAGER')];
router.post('/', ...manage, ctrl.create); // UC-60
router.patch('/:schoolPostId', ...manage, ctrl.update); // UC-61
router.delete('/:schoolPostId', ...manage, ctrl.remove); // UC-62
// Pinning is its own action (one boolean, its own rule for NEWS), not a field of UC-61.
router.patch('/:schoolPostId/pin', ...manage, ctrl.pin); // UC-63

// permissions.md 'School post (announcement) – React / comment' and 'School post comment – Delete': School Manager
// Full; Teacher / Student / Parent Restricted (15: within the audience, news view only; 17: own comments only) –
// checked in the service. System Admin: No (§1) → 403. PUT / DELETE instead of a toggle: a double click cannot undo.
const interact = [requireAuth, requireRole(...VIEW_ROLES)];
router.put('/:schoolPostId/like', ...interact, ctrl.like); // UC-64
router.delete('/:schoolPostId/like', ...interact, ctrl.unlike); // UC-64
router.get('/:schoolPostId/comments', ...interact, ctrl.listComments); // UC-65
router.post('/:schoolPostId/comments', ...interact, ctrl.createComment); // UC-65
router.delete('/:schoolPostId/comments/:commentId', ...interact, ctrl.removeComment); // UC-66

export default router;
