import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './calendar.controller.js';
import { ROLES } from './calendar.constants.js';

// FE-10 class calendar (Dung, It3) – mounted at /api/v1/class-events. permissions.md "Class calendar event":
// teachers create / update / delete (own subject; homeroom teacher also general events; only the creator changes
// an event); teachers, students and parents view the events of their audience (checked in the service).
// School Manager and System Admin have no access.
const router = Router();
const teacher = [requireAuth, requireRole(ROLES.TEACHER)];
const viewers = [requireAuth, requireRole(ROLES.TEACHER, ROLES.STUDENT, ROLES.PARENT)];

router.get('/', ...viewers, ctrl.list); // SCR-39 / UC-76
router.get('/options', ...teacher, ctrl.options); // SCR-40 / SCR-42
router.get('/classes/:classId/people', ...teacher, ctrl.people); // SCR-40 / SCR-42
router.get('/:eventId', ...viewers, ctrl.detail); // SCR-41 / UC-77
router.post('/', ...teacher, ctrl.create); // SCR-40 / UC-78
router.put('/:eventId', ...teacher, ctrl.update); // SCR-42 / UC-79
router.delete('/:eventId', ...teacher, ctrl.remove); // UC-80

export default router;
