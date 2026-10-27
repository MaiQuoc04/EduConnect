import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './class-tracks.controller.js';

// FE-04 Class & Group Management – class types (owner: Khanh). Screen SCR-71 Class Types & Subject Weights.
// Only the School Manager manages class types (permissions.md).
const router = Router();

router.use(requireAuth, requireRole('SCHOOL_MANAGER'));

// UC-26 Manage Class Types
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.post('/copy', ctrl.copy);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.get('/:id/subjects', ctrl.subjects);
router.put('/:id/subjects', ctrl.saveSubjects);

export default router;
