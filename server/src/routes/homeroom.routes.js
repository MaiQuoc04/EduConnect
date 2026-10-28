import { Router } from 'express';
import { ROLES } from '../constants/teacher.constants.js';
import * as homeroomController from '../controllers/homeroom.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { homeroomBoardQuery, saveHomeroomRequest } from '../validators/homeroom.validator.js';

// FE-03 (Dung) – SCR-16 Homeroom Assignment, UC-19. Mounted at /api/v1/homeroom-assignments.
const router = Router();
const sm = [requireAuth, requireRole(ROLES.SCHOOL_MANAGER)];

router.get('/', ...sm, validate(homeroomBoardQuery), homeroomController.getBoard);
router.put('/', ...sm, validate(saveHomeroomRequest), homeroomController.save);

export default router;
