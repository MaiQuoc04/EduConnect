import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './students.controller.js';

// FE-02 Student Management (owner: Anh). School Manager only, checked against the active role
// (permissions.md "Student / Parent / Teacher profile – View / update"). Teachers see students through
// FE-04 group members, not here.
const router = Router();

router.get('/', requireAuth, requireRole('SCHOOL_MANAGER'), ctrl.list); // UC-07
// UC-11 is a batch action on many students, so it is not under /:studentId. Declared before the /:studentId routes.
// permissions.md "Enrollment – Transfer / promote": School Manager only.
router.post('/promote', requireAuth, requireRole('SCHOOL_MANAGER'), ctrl.promote); // UC-11
// TEMPORARY read-only lists of school years and classes for SCR-11 until FE-04 has its own endpoints.
router.get('/promote/options', requireAuth, requireRole('SCHOOL_MANAGER'), ctrl.promoteOptions); // UC-11
router.get('/:studentId', requireAuth, requireRole('SCHOOL_MANAGER'), ctrl.detail); // UC-08
router.patch('/:studentId', requireAuth, requireRole('SCHOOL_MANAGER'), ctrl.update); // UC-09
// A business action (old enrollment TRANSFERRED + new enrollment), not a field update, so POST on a sub-resource.
// permissions.md "Enrollment – Transfer / promote": School Manager only.
router.post('/:studentId/transfer', requireAuth, requireRole('SCHOOL_MANAGER'), ctrl.transfer); // UC-10
// Read only (link / unlink is UC-13). permissions.md "Parent–student link": School Manager only.
router.get('/:studentId/parents', requireAuth, requireRole('SCHOOL_MANAGER'), ctrl.parents); // UC-12

export default router;
