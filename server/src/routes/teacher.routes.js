import { Router } from 'express';
import { ROLES } from '../constants/teacher.constants.js';
import * as teacherController from '../controllers/teacher.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { listTeachersQuery, teacherDetailRequest, updateTeacherRequest } from '../validators/teacher.validator.js';

// FE-03 (Dung) – mounted at /api/v1/teachers. Only School Manager (permissions.md).
const router = Router();
const sm = [requireAuth, requireRole(ROLES.SCHOOL_MANAGER)];

router.get('/', ...sm, validate(listTeachersQuery), teacherController.listTeachers); // SCR-13 / UC-15
router.get('/subject-options', ...sm, teacherController.listSubjectOptions); // SCR-15 – keep above '/:id'
router.get('/:id', ...sm, validate(teacherDetailRequest), teacherController.getTeacher); // SCR-14 / UC-16
router.patch('/:id', ...sm, validate(updateTeacherRequest), teacherController.updateTeacher); // SCR-15 / UC-17

export default router;
