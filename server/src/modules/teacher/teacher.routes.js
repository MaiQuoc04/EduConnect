import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { uploadSingle } from '../../middlewares/upload.js';
import * as teacherController from './teacher.controller.js';
import { ROLES } from './teacher.constants.js';

// FE-03 (Dung) – mounted at /api/v1/teachers. Only School Manager (permissions.md).
const router = Router();
const sm = [requireAuth, requireRole(ROLES.SCHOOL_MANAGER)];

router.get('/', ...sm, teacherController.listTeachers); // SCR-14 / UC-15
// Fixed paths stay above '/:id'.
router.get('/export', ...sm, teacherController.exportTeachers); // SCR-14 / UC-115
router.get('/import/template', ...sm, teacherController.importTemplate); // UC-116
router.post('/import/preview', ...sm, uploadSingle('file'), teacherController.previewImport); // UC-116
router.post('/import', ...sm, uploadSingle('file'), teacherController.importTeachers); // UC-116
router.get('/subject-options', ...sm, teacherController.listSubjectOptions); // SCR-17
router.get('/department-options', ...sm, teacherController.listDepartmentOptions); // SCR-17
router.get('/:id', ...sm, teacherController.getTeacher); // SCR-15 / UC-16
router.patch('/:id', ...sm, teacherController.updateTeacher); // SCR-17 / UC-17

export default router;
