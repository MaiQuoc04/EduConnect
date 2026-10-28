import { Router } from 'express';
import { requireAuth, requireAuthAllowingPasswordChange } from '../../middlewares/auth.js';
import * as ctrl from './auth.controller.js';

// FE-01 Personal Account (owner: Quoc). Express 5 forwards errors from async handlers automatically.
// UC-03 Sign Out is client-side: the JWT is stateless, the client drops it.
const router = Router();

router.post('/sign-in', ctrl.signIn); // UC-01
router.post('/switch-role', requireAuth, ctrl.switchRole);
router.get('/me', requireAuthAllowingPasswordChange, ctrl.me);

// UC-02 Reset Forgotten Password
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/forgot-password/verify', ctrl.verifyOtp);
router.post('/forgot-password/reset', ctrl.resetPassword);
router.post('/password-reset-requests', ctrl.requestAdminReset); // no usable email: ask SA / SM (then UC-100)

export default router;
