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
import postRoutes from './modules/posts/posts.routes.js';
import conversationRoutes from './modules/conversations/conversations.routes.js';
import departmentRoutes from './modules/teacher/department.routes.js';
import homeroomRoutes from './modules/teacher/homeroom.routes.js';
import teacherRoutes from './modules/teacher/teacher.routes.js';
import teachingRoutes from './modules/teacher/teaching.routes.js';
import timetableRoutes from './modules/timetable/timetable.routes.js';
import schoolSettingsRoutes from './modules/school-settings/schoolSettings.routes.js';
import calendarRoutes from './modules/calendar/calendar.routes.js';
import schoolEventRoutes from './modules/calendar/schoolEvents.routes.js';
import gradeRoutes from './modules/grades/grades.routes.js';
import schoolPostRoutes from './modules/schoolposts/schoolposts.routes.js';
import commentReportRoutes from './modules/schoolposts/commentReports.routes.js';
import moderationRoutes from './modules/moderation/moderation.routes.js';
import uploadRoutes from './modules/uploads/uploads.routes.js';
import parentRoutes from './modules/parents/parents.routes.js';
import extracurricularRoutes from './modules/extracurricular/extracurricular.routes.js';
import attendanceRoutes from './modules/attendance/attendance.routes.js';
import notificationRoutes from './modules/notifications/notifications.routes.js';

// Each feature gets its own folder in src/modules and is mounted here, e.g.
//   FE-01 account   -> /auth, /account (Quoc)
//   FE-02 students  -> /students      (Anh)
//   FE-03 teachers  -> /teachers, /departments, /homeroom-assignments, /teaching-assignments (Dung)
//   FE-10 timetable -> /timetables, /school-settings (Dung; School Manager settings, 21/11)
//   FE-10 calendar  -> /class-events, /school-events (Dung, It3)
//   FE-04 classes   -> /school-years, /classes, /groups, /subjects, /class-tracks (Khanh)
//   FE-05 feed      -> /posts         (Khanh)
//   FE-06 chat      -> /conversations (Khanh, + src/sockets)
//   FE-07 events    -> /extracurricular-events (Dung)
//   FE-08 school    -> /school-posts, /comment-reports (Anh)
//   FE-09 notify    -> /notifications (Quoc)
//   FE-10 schedule  -> /timetables, /class-events (Dung)
//   FE-11 grades    -> /grades        (Linh)
//   FE-12 attendance-> /attendances   (Quoc)
//   FE-13 admin     -> /admin         (Linh)
//   FE-14 parents   -> /parents       (Anh)
//   shared storage  -> /uploads       (Anh; attachments of FE-05, FE-06, FE-08)
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
router.use(postRoutes); // FE-05: /groups/:groupId/posts and /posts/:postId (paths in posts.routes.js)
router.use('/conversations', conversationRoutes);
router.use('/teachers', teacherRoutes);
router.use('/departments', departmentRoutes);
router.use('/homeroom-assignments', homeroomRoutes);
router.use('/teaching-assignments', teachingRoutes);
router.use('/timetables', timetableRoutes);
router.use('/school-settings', schoolSettingsRoutes); // School Manager settings (Dung, 21/11/2026)
router.use('/class-events', calendarRoutes);
router.use('/school-events', schoolEventRoutes); // FE-10 school calendar (Dung)
router.use('/grades', gradeRoutes);
router.use('/school-posts', schoolPostRoutes);
router.use('/comment-reports', commentReportRoutes); // FE-08: School Manager's queue of reported school post comments
router.use('/moderation', moderationRoutes); // FE-08 moderation (Anh): message reports, School Manager's queue and reads
router.use('/parents', parentRoutes);
router.use('/extracurricular-events', extracurricularRoutes); // FE-07 (Dung, It3)
router.use('/attendances', attendanceRoutes); // FE-12 (Quoc, It3)
router.use('/notifications', notificationRoutes); // FE-09 (Quoc, It3)
router.use('/admin', adminRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/uploads', uploadRoutes);

export default router;
