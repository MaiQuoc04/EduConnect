import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './groups.controller.js';

// FE-04 Class & Group Management – groups (owner: Khanh). Screens SCR-22 Group List, SCR-23 Group Detail,
// SCR-24 Group Member List. The System Admin is in no group (business-rules §2); the data scope of the other roles
// is checked in groupAccess.js.
const router = Router();

router.use(requireAuth, requireRole('SCHOOL_MANAGER', 'TEACHER', 'STUDENT', 'PARENT'));

router.get('/', ctrl.list); // UC-29 View Group List
router.get('/:id', ctrl.detail); // UC-30 View Group Detail
router.get('/:id/members', ctrl.members); // UC-31 View Group Members

export default router;
