import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as teachingController from './teaching.controller.js';

// FE-03 (Dung) – SCR-17 Teaching Assignment, UC-18. Only School Manager assigns (permissions.md).
const router = Router();

router.get('/', requireAuth, requireRole('SCHOOL_MANAGER'), teachingController.getBoard);
router.put('/', requireAuth, requireRole('SCHOOL_MANAGER'), teachingController.save);

export default router;
