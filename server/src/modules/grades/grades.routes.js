import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { uploadSingle } from '../../middlewares/upload.js';
import * as ctrl from './grades.controller.js';

// FE-11 Grade Management (owner: Linh), mounted at /grades. Permissions follow the active role (permissions.md):
// grade structure, unlock and history = School Manager; entry / import / finalize = teacher (assigned class + subject,
// checked in the service); viewing = teacher, student, parent, School Manager within their scope. System Admin never
// sees grades (business-rules §1).
const router = Router();
const SM = requireRole('SCHOOL_MANAGER');
const TEACHER = requireRole('TEACHER');
const STAFF = requireRole('SCHOOL_MANAGER', 'TEACHER');

router.use(requireAuth);

router.get('/options', requireRole('SCHOOL_MANAGER', 'TEACHER', 'STUDENT', 'PARENT'), ctrl.options);

// SCR-25 Grade Configuration
router.get('/structures', SM, ctrl.listStructures); // ?semesterId&gradeLevelId
router.post('/structures/copy', SM, ctrl.copyStructure); // UC-82
router.get('/structures/:semesterId/:gradeLevelId/:subjectId', SM, ctrl.getStructure);
router.put('/structures/:semesterId/:gradeLevelId/:subjectId', SM, ctrl.saveStructure); // UC-81

// SCR-44 Grade Entry
router.get('/my-books', TEACHER, ctrl.myBooks); // ?semesterId
router.get('/books/:classId/:subjectId', STAFF, ctrl.getBook); // ?semesterId
router.put('/books/:classId/:subjectId', TEACHER, ctrl.saveGrades); // UC-83
router.post('/books/:classId/:subjectId/finalize', TEACHER, ctrl.finalize); // UC-85
router.get('/books/:classId/:subjectId/import/template', TEACHER, ctrl.importTemplate); // UC-84
router.post('/books/:classId/:subjectId/import/preview', TEACHER, uploadSingle('file'), ctrl.importPreview); // UC-84
router.post('/books/:classId/:subjectId/import', TEACHER, uploadSingle('file'), ctrl.importRun); // UC-84

// SCR-68 Grade Control
router.get('/control', SM, ctrl.listBooks); // ?semesterId&classId&subjectId&status
router.post('/books/:classId/:subjectId/unlock', SM, ctrl.unlock); // UC-86
router.get('/history', SM, ctrl.history); // UC-87 ?semesterId&classId&subjectId&search&page

// SCR-47 Academic Results, SCR-48 Class Ranking
router.get('/classes', STAFF, ctrl.classes); // ?schoolYearId
router.get('/classes/:classId/results', STAFF, ctrl.classResults); // UC-88 / UC-89 ?period=<semesterId>|YEAR
router.get('/students', requireRole('STUDENT', 'PARENT'), ctrl.myStudents);
router.get('/students/:studentId/results', requireRole('SCHOOL_MANAGER', 'TEACHER', 'STUDENT', 'PARENT'), ctrl.studentResults); // ?schoolYearId

export default router;
