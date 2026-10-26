import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './school-years.controller.js';
import * as semesterCtrl from './semesters.controller.js';

// FE-04 Class & Group Management – school years and semesters (owner: Khanh). Screen SCR-18 School Year & Semester.
// Only the School Manager manages them (permissions.md).
const router = Router();

router.use(requireAuth, requireRole('SCHOOL_MANAGER'));

router.get('/', ctrl.list); // UC-20
router.get('/:id', ctrl.detail); // UC-20
router.post('/', ctrl.create); // UC-20
router.put('/:id', ctrl.update); // UC-20

router.post('/:id/semesters', semesterCtrl.create); // UC-21
router.put('/:id/semesters/:semesterId', semesterCtrl.update); // UC-21
router.post('/:id/semesters/:semesterId/close', semesterCtrl.close); // UC-21
router.post('/:id/semesters/:semesterId/reopen', semesterCtrl.reopen); // UC-21

export default router;
