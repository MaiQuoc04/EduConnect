import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import * as ctrl from './auth.controller.js';

// FE-01 Personal Account (owner: Quoc). Express 5 forwards errors from async handlers automatically.
const router = Router();

router.post('/sign-in', ctrl.signIn);
router.post('/switch-role', requireAuth, ctrl.switchRole);
router.get('/me', requireAuth, ctrl.me);

export default router;
