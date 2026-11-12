import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import * as ctrl from './uploads.controller.js';

// Shared upload of attachments for FE-05 / FE-06 / FE-08 (owner: Anh, shared storage). Role rules are in the service
// (System Admin refused, school-post files School Manager only); data rules are checked when a file is attached.
const router = Router();

router.post('/sign', requireAuth, ctrl.sign);
router.post('/confirm', requireAuth, ctrl.confirm);

export default router;
