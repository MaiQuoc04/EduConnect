import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './extracurricular.controller.js';
import { ROLES } from './extracurricular.constants.js';

// FE-07 Extracurricular Event Management (Dung, It3) – mounted at /api/v1/extracurricular-events.
// permissions.md "Extracurricular event": System Admin and School Manager have no access; the homeroom teacher, the
// class's students and parents (data scope and the homeroom check are in the service).
const viewers = [requireAuth, requireRole(ROLES.TEACHER, ROLES.STUDENT, ROLES.PARENT)];
const teacher = [requireAuth, requireRole(ROLES.TEACHER)];
const parent = [requireAuth, requireRole(ROLES.PARENT)];

const router = Router();

router.get('/', ...viewers, ctrl.list); // activity list of a class (UC-53 entry)
router.get('/options', ...teacher, ctrl.options); // SCR-66 form: homeroom classes
router.post('/', ...teacher, ctrl.create); // UC-50
router.get('/:eventId', ...viewers, ctrl.detail); // UC-53
router.put('/:eventId', ...teacher, ctrl.update); // UC-51
router.post('/:eventId/cancel', ...teacher, ctrl.cancel); // UC-52
router.get('/:eventId/registrations', ...teacher, ctrl.registrations); // UC-56
router.get('/:eventId/registrations/export', ...teacher, ctrl.exportRegistrations); // UC-57
router.post('/:eventId/registrations', ...parent, ctrl.register); // UC-54
router.delete('/:eventId/registrations/:studentId', ...parent, ctrl.unregister); // UC-55

export default router;
