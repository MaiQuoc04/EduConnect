import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './parents.controller.js';

// FE-14 Parent Management (owner: Anh). School Manager only, checked against the active role
// (permissions.md "Student / Parent / Teacher profile – View / update"). System Admin never sees school content;
// teachers, students and parents have no access (a parent editing their own occupation is UC-108, FE-01).
const router = Router();

router.get('/', requireAuth, requireRole('SCHOOL_MANAGER'), ctrl.list); // UC-104, SCR-69
router.get('/:parentId', requireAuth, requireRole('SCHOOL_MANAGER'), ctrl.detail); // UC-105, SCR-10
router.patch('/:parentId', requireAuth, requireRole('SCHOOL_MANAGER'), ctrl.update); // UC-106, SCR-16

export default router;
