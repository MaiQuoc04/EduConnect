import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as teacherController from './teacher.controller.js';
import { ROLES } from './teacher.constants.js';

// FE-03 (Dung) – mounted at /api/v1/teachers. Only School Manager (permissions.md).
const router = Router();
const sm = [requireAuth, requireRole(ROLES.SCHOOL_MANAGER)];

router.get('/', ...sm, teacherController.listTeachers); // SCR-13 / UC-15
router.get('/subject-options', ...sm, teacherController.listSubjectOptions); // SCR-15 – keep above '/:id'
router.get('/department-options', ...sm, teacherController.listDepartmentOptions); // SCR-15 – keep above '/:id'
router.get('/:id', ...sm, teacherController.getTeacher); // SCR-14 / UC-16
router.patch('/:id', ...sm, teacherController.updateTeacher); // SCR-15 / UC-17

export default router;
