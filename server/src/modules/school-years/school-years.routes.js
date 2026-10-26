import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './school-years.controller.js';

// FE-04 Class & Group Management – school years (owner: Khanh). Screen SCR-18 School Year & Semester.
// Only the School Manager creates and updates school years (permissions.md).
const router = Router();

router.use(requireAuth, requireRole('SCHOOL_MANAGER'));

router.get('/', ctrl.list); // UC-20
router.get('/:id', ctrl.detail); // UC-20
router.post('/', ctrl.create); // UC-20
router.put('/:id', ctrl.update); // UC-20

export default router;
