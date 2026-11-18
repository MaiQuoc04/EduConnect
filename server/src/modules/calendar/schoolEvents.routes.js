import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { ROLES } from './calendar.constants.js';
import * as ctrl from './schoolEvents.controller.js';

// School calendar (FE-10 Schedule, Dung, 13/11/2026) – /api/v1/school-events. Everyone of the school reads (the
// service limits students / parents to their grades); the School Manager creates, updates and deletes.
const router = Router();
const viewers = [requireAuth, requireRole(ROLES.SCHOOL_MANAGER, ROLES.TEACHER, ROLES.STUDENT, ROLES.PARENT)];
const sm = [requireAuth, requireRole(ROLES.SCHOOL_MANAGER)];

router.get('/', ...viewers, ctrl.list); // ?from=&to=&classId=
router.get('/upcoming', ...viewers, ctrl.upcoming); // ?limit= (school feed column)
router.get('/past', ...viewers, ctrl.past); // ?limit=
router.get('/options', ...sm, ctrl.options);
router.get('/:eventId', ...viewers, ctrl.detail);
router.post('/', ...sm, ctrl.create);
router.put('/:eventId', ...sm, ctrl.update);
router.delete('/:eventId', ...sm, ctrl.remove);

export default router;
