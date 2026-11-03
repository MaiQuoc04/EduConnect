import { Router } from 'express';
import healthRoutes from './modules/health/health.routes.js';
import accountRoutes from './modules/account/account.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import maintenanceRoutes from './modules/admin/maintenance.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import studentRoutes from './modules/students/students.routes.js';
import schoolYearRoutes from './modules/school-years/school-years.routes.js';
import subjectRoutes from './modules/subjects/subjects.routes.js';
import classTrackRoutes from './modules/class-tracks/class-tracks.routes.js';
import classRoutes from './modules/classes/classes.routes.js';
import groupRoutes from './modules/groups/groups.routes.js';
import homeroomRoutes from './modules/teacher/homeroom.routes.js';
import teacherRoutes from './modules/teacher/teacher.routes.js';
import teachingRoutes from './modules/teacher/teaching.routes.js';

// Each feature gets its own folder in src/modules and is mounted here, e.g.
//   FE-01 account   -> /auth, /account (Quoc)
//   FE-02 students  -> /students      (Anh)
//   FE-03 teachers  -> /teachers, /homeroom-assignments, /teaching-assignments (Dung)
//   FE-04 classes   -> /school-years, /classes, /groups, /subjects, /class-tracks (Khanh)
//   FE-05 feed      -> /posts         (Khanh)
//   FE-06 chat      -> /conversations (Khanh, + src/sockets)
//   FE-07 events    -> /extracurricular-events (Dung)
//   FE-08 school    -> /school-posts  (Anh)
//   FE-09 notify    -> /notifications (Quoc)
//   FE-10 schedule  -> /timetables, /class-events (Dung)
//   FE-11 grades    -> /grades        (Linh)
//   FE-12 attendance-> /attendances   (Quoc)
//   FE-13 admin     -> /admin         (Linh)
//   FE-14 parents   -> /parents       (Anh)
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/account', accountRoutes);
router.use('/students', studentRoutes);
router.use('/school-years', schoolYearRoutes);
router.use('/subjects', subjectRoutes);
router.use('/class-tracks', classTrackRoutes);
router.use('/classes', classRoutes);
router.use('/groups', groupRoutes);
router.use('/teachers', teacherRoutes);
router.use('/homeroom-assignments', homeroomRoutes);
router.use('/teaching-assignments', teachingRoutes);
router.use('/admin', adminRoutes);
router.use('/maintenance', maintenanceRoutes);

export default router;
