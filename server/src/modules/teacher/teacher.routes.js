import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as teacherController from './teacher.controller.js';

const router = Router();

// SCR-13 / UC-15: only School Manager can browse the teacher list
router.get('/', requireAuth, requireRole('SCHOOL_MANAGER'), teacherController.listTeachers);
// SCR-15: subjects to choose from (must stay above '/:id')
router.get('/subject-options', requireAuth, requireRole('SCHOOL_MANAGER'), teacherController.subjectOptions);
// SCR-14 / UC-16: teacher detail (profile, assignments, weekly schedule)
router.get('/:id', requireAuth, requireRole('SCHOOL_MANAGER'), teacherController.getTeacher);

// SCR-15 / UC-17: update teacher profile (not login identifiers)
router.patch('/:id', requireAuth, requireRole('SCHOOL_MANAGER'), teacherController.updateTeacher);

export default router;
