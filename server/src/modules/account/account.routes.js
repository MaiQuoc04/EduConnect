import { Router } from 'express';
import { requireAuth, requireAuthAllowingPasswordChange, requireRole } from '../../middlewares/auth.js';
import { uploadSingle } from '../../middlewares/upload.js';
import * as ctrl from './account.controller.js';

// FE-01 Personal Account – the signed-in user's own account (owner: Quoc). Every role may use these, except where a
// route says requireRole.
const router = Router();

router.get('/profile', requireAuth, ctrl.profile); // UC-04
router.get('/children/:studentId', requireAuth, requireRole('PARENT'), ctrl.childProfile); // UC-110, linked children only
router.put('/password', requireAuthAllowingPasswordChange, ctrl.changePassword); // UC-05 (+ forced change of UC-01)
router.put('/avatar', requireAuth, uploadSingle('avatar'), ctrl.changeAvatar); // UC-06
router.put('/address', requireAuth, ctrl.updateAddress); // UC-108
router.put('/occupation', requireAuth, requireRole('PARENT'), ctrl.updateOccupation); // UC-109, parents only

export default router;
