import { Router } from 'express';
import healthRoutes from './modules/health/health.routes.js';
import accountRoutes from './modules/account/account.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import maintenanceRoutes from './modules/admin/maintenance.routes.js';
import authRoutes from './modules/auth/auth.routes.js';

// Each feature gets its own folder in src/modules and is mounted here, e.g.
//   FE-01 account   -> /auth, /account (Quoc)
//   FE-02 students  -> /students      (Anh)
//   FE-03 teachers  -> /teachers      (Dung)
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
router.use('/admin', adminRoutes);
router.use('/maintenance', maintenanceRoutes);

export default router;
