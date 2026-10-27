import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { uploadSingle } from '../../middlewares/upload.js';
import * as ctrl from './classes.controller.js';

// FE-04 Class & Group Management – classes (owner: Khanh). Screen SCR-22 Group List ("Lớp & nhóm lớp").
// Creating and importing classes is for the School Manager only (permissions.md).
const router = Router();

router.use(requireAuth, requireRole('SCHOOL_MANAGER'));

router.get('/', ctrl.list); // SCR-22 list (interim until UC-29)
router.get('/grade-levels', ctrl.gradeLevels);
router.get('/eligible-students', ctrl.eligibleStudents); // UC-28
router.post('/', ctrl.create); // UC-28 Create Class Group
router.get('/import/template', ctrl.importTemplate); // UC-27
router.post('/import/preview', uploadSingle('file'), ctrl.importPreview); // UC-27
router.post('/import', uploadSingle('file'), ctrl.importRun); // UC-27 Import Class List

export default router;
