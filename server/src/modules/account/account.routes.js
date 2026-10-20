import { Router } from 'express';
import { requireAuth, requireAuthAllowingPasswordChange } from '../../middlewares/auth.js';
import { uploadSingle } from '../../middlewares/upload.js';
import * as ctrl from './account.controller.js';

// FE-01 Personal Account – the signed-in user's own account (owner: Quoc). Every role may use these.
const router = Router();

router.get('/profile', requireAuth, ctrl.profile); // UC-04
router.put('/password', requireAuthAllowingPasswordChange, ctrl.changePassword); // UC-05 (+ forced change of UC-01)
router.put('/avatar', requireAuth, uploadSingle('avatar'), ctrl.changeAvatar); // UC-06

export default router;
