import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as departmentController from './department.controller.js';
import { ROLES } from './teacher.constants.js';

// FE-03 (Dung) – UC-114 Manage Departments, mounted at /api/v1/departments. School Manager only (permissions.md).
const router = Router();
const sm = [requireAuth, requireRole(ROLES.SCHOOL_MANAGER)];

router.get('/', ...sm, departmentController.list);
router.post('/', ...sm, departmentController.create);
router.patch('/:id', ...sm, departmentController.update);
router.delete('/:id', ...sm, departmentController.remove);

export default router;
