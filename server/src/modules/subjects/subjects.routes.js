import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './subjects.controller.js';

// FE-04 Class & Group Management – subjects (owner: Khanh). Screens SCR-19 Subject List, SCR-20 Subject Detail,
// SCR-21 Create / Update Subject.
// Only the School Manager manages subjects (permissions.md).
const router = Router();

router.use(requireAuth, requireRole('SCHOOL_MANAGER'));

router.get('/', ctrl.list); // UC-22
router.get('/:id', ctrl.detail); // UC-23
router.post('/', ctrl.create); // UC-24
router.put('/:id', ctrl.update); // UC-25

export default router;
