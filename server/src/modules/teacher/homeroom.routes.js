import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as homeroomController from './homeroom.controller.js';

// FE-03 (Dung) – SCR-16 Homeroom Assignment, UC-19. Only School Manager assigns (permissions.md).
const router = Router();

router.get('/', requireAuth, requireRole('SCHOOL_MANAGER'), homeroomController.getBoard);
router.put('/', requireAuth, requireRole('SCHOOL_MANAGER'), homeroomController.save);

export default router;
