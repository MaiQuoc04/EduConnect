import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './students.controller.js';

// FE-02 Student Management (owner: Anh). School Manager only, checked against the active role
// (permissions.md "Student / Parent / Teacher profile – View / update"). Teachers see students through
// FE-04 group members, not here.
const router = Router();

router.get('/', requireAuth, requireRole('SCHOOL_MANAGER'), ctrl.list); // UC-07

export default router;
