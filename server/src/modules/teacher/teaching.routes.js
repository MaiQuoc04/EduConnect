import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as teachingController from './teaching.controller.js';
import { ROLES } from './teacher.constants.js';

// FE-03 (Dung) – SCR-19 Teaching Assignment, UC-18. Mounted at /api/v1/teaching-assignments.
const router = Router();
const sm = [requireAuth, requireRole(ROLES.SCHOOL_MANAGER)];

router.get('/', ...sm, teachingController.getBoard);
router.put('/', ...sm, teachingController.save);

export default router;
