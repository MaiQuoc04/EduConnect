import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './subjects.controller.js';

// FE-04 Class & Group Management – subjects (owner: Khanh). Screen SCR-19 Subject List.
// Only the School Manager manages subjects (permissions.md).
const router = Router();

router.use(requireAuth, requireRole('SCHOOL_MANAGER'));

router.get('/', ctrl.list); // UC-22

export default router;
