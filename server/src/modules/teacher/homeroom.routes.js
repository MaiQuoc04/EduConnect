import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as homeroomController from './homeroom.controller.js';
import { ROLES } from './teacher.constants.js';

// FE-03 (Dung) – SCR-16 Homeroom Assignment, UC-19. Mounted at /api/v1/homeroom-assignments.
const router = Router();
const sm = [requireAuth, requireRole(ROLES.SCHOOL_MANAGER)];

router.get('/', ...sm, homeroomController.getBoard);
router.put('/', ...sm, homeroomController.save);

export default router;
