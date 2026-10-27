import { Router } from 'express';
import { ROLES } from '../constants/teacher.constants.js';
import * as teachingController from '../controllers/teachingAssignment.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { saveTeachingRequest, teachingBoardQuery } from '../validators/teachingAssignment.validator.js';

// FE-03 (Dung) – SCR-17 Teaching Assignment, UC-18. Mounted at /api/v1/teaching-assignments.
const router = Router();
const sm = [requireAuth, requireRole(ROLES.SCHOOL_MANAGER)];

router.get('/', ...sm, validate(teachingBoardQuery), teachingController.getBoard);
router.put('/', ...sm, validate(saveTeachingRequest), teachingController.save);

export default router;
