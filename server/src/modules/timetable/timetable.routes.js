import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './timetable.controller.js';
import { ROLES } from './timetable.constants.js';

// FE-10 timetable (Dung, It2) – mounted at /api/v1/timetables. permissions.md: SM manages timetables; teachers,
// students and parents view the classes of their data scope (checked in the service); teachers view their own
// teaching schedule.
const router = Router();
const sm = [requireAuth, requireRole(ROLES.SCHOOL_MANAGER)];

router.get('/', ...sm, ctrl.list); // SCR-27 / UC-70

export default router;
