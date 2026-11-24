import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './schoolSettings.controller.js';

// School Manager settings (Dung, 21/11/2026) – mounted at /api/v1/school-settings. School Manager only.
const router = Router();
const sm = [requireAuth, requireRole('SCHOOL_MANAGER')];

router.get('/', ...sm, ctrl.get);
router.put('/', ...sm, ctrl.update);

export default router;
