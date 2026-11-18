import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './attendance.controller.js';

// FE-12 Attendance Management (owner: Quoc), mounted at /attendances. permissions.md (Attendance rows, notes 7, 12–14):
// take / edit = teacher (own periods, same day; homeroom excused <-> unexcused) and School Manager (any time);
// view = teacher (classes they teach / lead), student (self), parent (linked children), School Manager;
// statistics = School Manager. System Admin never sees attendance (business-rules §1). Scope is checked in services.
const router = Router();
const SM = requireRole('SCHOOL_MANAGER');
const TEACHER = requireRole('TEACHER');
const STAFF = requireRole('SCHOOL_MANAGER', 'TEACHER');
const OWN = requireRole('STUDENT', 'PARENT');
const ALL = requireRole('SCHOOL_MANAGER', 'TEACHER', 'STUDENT', 'PARENT');

router.use(requireAuth);

router.get('/options', ALL, ctrl.options);

// SCR-56 Class Attendance (teacher), SCR-52 Attendance Correction (School Manager): UC-90, UC-91
router.get('/classes', STAFF, ctrl.classes); // ?schoolYearId
router.get('/my-lessons', TEACHER, ctrl.myLessons); // ?date
router.get('/classes/:classId/lessons', STAFF, ctrl.classLessons); // ?date
router.get('/lessons/:lessonId', STAFF, ctrl.getSheet);
router.put('/lessons/:lessonId', STAFF, ctrl.saveSheet);
router.get('/lessons/:lessonId/history', STAFF, ctrl.lessonHistory);

// UC-93 View Class Attendance (+ export)
router.get('/classes/:classId/report', STAFF, ctrl.classReport); // ?semesterId&from&to
router.get('/classes/:classId/report/export', STAFF, ctrl.exportClassReport);

// UC-92 View Student Attendance (SCR-53..55); teachers / SM open a student from the class report
router.get('/students', OWN, ctrl.myStudents);
router.get('/students/:studentId', ALL, ctrl.studentAttendance); // ?semesterId&month

// UC-94 View School Attendance Statistics (SCR-51)
router.get('/stats', SM, ctrl.stats); // ?semesterId&from&to&gradeLevelId
router.get('/stats/missing', SM, ctrl.missing); // + page, pageSize
router.get('/stats/export', SM, ctrl.exportStats);

export default router;
