import { Router } from 'express';
import healthRoutes from './modules/health/health.routes.js';
import accountRoutes from './modules/account/account.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
// FE-03 uses the layered structure: routes/ → validators/ → controllers/ → services/ → repositories/ (+ models/, constants/)
import homeroomRoutes from './routes/homeroom.routes.js';
import teacherRoutes from './routes/teacher.routes.js';
import teachingRoutes from './routes/teachingAssignment.routes.js';

// Each feature gets its own folder in src/modules and is mounted here, e.g.
//   FE-01 account   -> /auth, /account (Quoc)
//   FE-02 students  -> /students      (Anh)
//   FE-03 teachers  -> /teachers, /homeroom-assignments, /teaching-assignments (Dung)
//   FE-04 classes   -> /classes, /groups, /subjects (Khanh)
//   FE-05 feed      -> /posts         (Anh)
//   FE-06 chat      -> /conversations (Anh, + src/sockets)
//   FE-07 events    -> /extracurricular-events (Dung)
//   FE-08 school    -> /school-posts  (Khanh)
//   FE-09 notify    -> /notifications (Quoc)
//   FE-10 schedule  -> /timetables, /class-events (Dung)
//   FE-11 grades    -> /grades        (Linh)
//   FE-12 attendance-> /attendances   (Quoc)
//   FE-13 admin     -> /admin         (Linh)
//   FE-14 parents   -> /parents       (Khanh)
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/account', accountRoutes);
router.use('/teachers', teacherRoutes);
router.use('/homeroom-assignments', homeroomRoutes);
router.use('/teaching-assignments', teachingRoutes);

export default router;
