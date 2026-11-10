import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { HOME_BY_ROLE } from './navigation.js';
import ChangePasswordPage from './pages/account/ChangePasswordPage.jsx';
import ChildProfilePage from './pages/account/ChildProfilePage.jsx';
import EditAvatarPage from './pages/account/EditAvatarPage.jsx';
import ForgotPasswordPage from './pages/account/ForgotPasswordPage.jsx';
import LoginPage from './pages/account/LoginPage.jsx';
import ProfilePage from './pages/account/ProfilePage.jsx';
import ChatPage from './pages/chat/ChatPage.jsx';
import ClassTrackPage from './pages/class-tracks/ClassTrackPage.jsx';
import ClassListPage from './pages/classes/ClassListPage.jsx';
import GroupLayout from './pages/groups/GroupLayout.jsx';
import GroupListPage from './pages/groups/GroupListPage.jsx';
import GroupMembersPage from './pages/groups/GroupMembersPage.jsx';
import GroupOverview from './pages/groups/GroupOverview.jsx';
import GroupPendingTab from './pages/groups/GroupPendingTab.jsx';
import SchoolYearPage from './pages/school-years/SchoolYearPage.jsx';
import ImportParentLinksPage from './pages/students/ImportParentLinksPage.jsx';
import StudentDetailPage from './pages/students/StudentDetailPage.jsx';
import StudentListPage from './pages/students/StudentListPage.jsx';
import StudentParentsPage from './pages/students/StudentParentsPage.jsx';
import TransferStudentPage from './pages/students/TransferStudentPage.jsx';
import UpdateStudentPage from './pages/students/UpdateStudentPage.jsx';
import UpdateStudentRelationshipPage from './pages/students/UpdateStudentRelationshipPage.jsx';
import SubjectDetailPage from './pages/subjects/SubjectDetailPage.jsx';
import SubjectFormPage from './pages/subjects/SubjectFormPage.jsx';
import SubjectListPage from './pages/subjects/SubjectListPage.jsx';
import HomeroomAssignmentPage from './pages/teachers/HomeroomAssignmentPage.jsx';
import DepartmentsPage from './pages/teachers/DepartmentsPage.jsx';
import TeachingSchedulePage from './pages/timetable/TeachingSchedulePage.jsx';
import TimetableEditorPage from './pages/timetable/TimetableEditorPage.jsx';
import TimetableImportPage from './pages/timetable/TimetableImportPage.jsx';
import TimetableManagementPage from './pages/timetable/TimetableManagementPage.jsx';
import TimetableViewPage from './pages/timetable/TimetableViewPage.jsx';
import ClassCalendarPage from './pages/calendar/ClassCalendarPage.jsx';
import TeacherDetailPage from './pages/teachers/TeacherDetailPage.jsx';
import TeacherEditPage from './pages/teachers/TeacherEditPage.jsx';
import TeacherImportPage from './pages/teachers/TeacherImportPage.jsx';
import TeacherListPage from './pages/teachers/TeacherListPage.jsx';
import TeachingAssignmentPage from './pages/teachers/TeachingAssignmentPage.jsx';
import CreateAccountPage from './pages/admin/CreateAccountPage.jsx';
import ImportAccountsPage from './pages/admin/ImportAccountsPage.jsx';
import AccountDetailPage from './pages/admin/AccountDetailPage.jsx';
import AccountListPage from './pages/admin/AccountListPage.jsx';
import EditIdentifiersPage from './pages/admin/EditIdentifiersPage.jsx';
import MaintenancePage from './pages/admin/MaintenancePage.jsx';
import SystemSettingsPage from './pages/admin/SystemSettingsPage.jsx';
import PasswordResetRequestsPage from './pages/admin/PasswordResetRequestsPage.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';

function RoleHome() {
  const { activeRole } = useAuth();
  return <Navigate to={HOME_BY_ROLE[activeRole] ?? '/profile'} replace />;
}

// Add each screen from the screen list under the protected layout, e.g.
//   <Route path="students" element={<ProtectedRoute roles={['SCHOOL_MANAGER']}><StudentListPage /></ProtectedRoute>} />
// and its menu entry in navigation.js.
export default function App() {
  return (
    <Routes>
      {/* FE-01 Personal Account – signed out */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<RoleHome />} />
        {/* FE-01 Personal Account */}
        <Route path="profile" element={<ProfilePage />} />
        <Route path="profile/avatar" element={<EditAvatarPage />} />
        <Route
          path="profile/children/:studentId"
          element={
            <ProtectedRoute roles={['PARENT']}>
              <ChildProfilePage />
            </ProtectedRoute>
          }
        />
        <Route path="change-password" element={<ChangePasswordPage />} />
        {/* FE-02 Student Management */}
        <Route
          path="students"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <StudentListPage />
            </ProtectedRoute>
          }
        />
        {/* UC-11 Promote Students (SCR-11, promotion tab): a batch action, not one student. Declared before
            students/:studentId so the reading order matches the server's routes. */}
        <Route
          path="students/promote"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <TransferStudentPage />
            </ProtectedRoute>
          }
        />
        {/* UC-14 Import Parent–Student Links (SCR-07 "Nhập liên kết phụ huynh"). Declared before students/:studentId. */}
        <Route
          path="students/parent-links/import"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <ImportParentLinksPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="students/:studentId"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <StudentDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="students/:studentId/edit"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <UpdateStudentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="students/:studentId/transfer"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <TransferStudentPage />
            </ProtectedRoute>
          }
        />
        {/* UC-12 View Student's Parents (SCR-12), opened from Student Detail; no menu entry. */}
        <Route
          path="students/:studentId/parents"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <StudentParentsPage />
            </ProtectedRoute>
          }
        />
        {/* UC-13 Link / Unlink Parent–Student (SCR-13), opened from SCR-12; no menu entry. */}
        <Route
          path="students/:studentId/parents/edit"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <UpdateStudentRelationshipPage />
            </ProtectedRoute>
          }
        />
        {/* FE-04 Class & Group Management */}
        <Route
          path="school-years"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <SchoolYearPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="subjects"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <SubjectListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="subjects/new"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <SubjectFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="subjects/:id"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <SubjectDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="subjects/:id/edit"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <SubjectFormPage key="edit" />
            </ProtectedRoute>
          }
        />
        <Route
          path="class-tracks"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <ClassTrackPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="classes"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <ClassListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="groups"
          element={
            <ProtectedRoute roles={['TEACHER', 'STUDENT', 'PARENT']}>
              <GroupListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="groups/:id"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER', 'TEACHER', 'STUDENT', 'PARENT']}>
              <GroupLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<GroupOverview />} />
          {/* FE-05 (Khanh): replace GroupPendingTab with the group feed page. */}
          <Route path="feed" element={<GroupPendingTab kind="feed" />} />
          <Route path="members" element={<GroupMembersPage />} />
        </Route>
        {/* Split chat view: shell from FE-04, messages by FE-06 (Khanh); School Manager: teacher group only. */}
        {['chat', 'chat/:groupId'].map((path) => (
          <Route
            key={path}
            path={path}
            element={
              <ProtectedRoute roles={['SCHOOL_MANAGER', 'TEACHER', 'STUDENT', 'PARENT']}>
                <ChatPage />
              </ProtectedRoute>
            }
          />
        ))}
        {/* SCR-14 Teacher List */}
        <Route
          path="teachers"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <TeacherListPage />
            </ProtectedRoute>
          }
        />
        {/* FE-10 timetable (Dung): SCR-27 management, UC-72 import, SCR-28/30 editor, SCR-29/45 view, SCR-57 teaching schedule */}
        <Route path="timetables" element={<ProtectedRoute roles={['SCHOOL_MANAGER']}><TimetableManagementPage /></ProtectedRoute>} />
        <Route path="timetables/import" element={<ProtectedRoute roles={['SCHOOL_MANAGER']}><TimetableImportPage /></ProtectedRoute>} />
        <Route path="timetables/classes/:classId/edit" element={<ProtectedRoute roles={['SCHOOL_MANAGER']}><TimetableEditorPage /></ProtectedRoute>} />
        <Route path="timetable" element={<ProtectedRoute roles={['SCHOOL_MANAGER', 'TEACHER', 'STUDENT', 'PARENT']}><TimetableViewPage /></ProtectedRoute>} />
        <Route path="teaching-schedule" element={<ProtectedRoute roles={['TEACHER']}><TeachingSchedulePage /></ProtectedRoute>} />
        {/* FE-10 class calendar (Dung, It3): SCR-39 calendar, SCR-40 create, SCR-41 detail, SCR-42 update */}
        <Route path="calendar" element={<ProtectedRoute roles={['TEACHER', 'STUDENT', 'PARENT']}><ClassCalendarPage /></ProtectedRoute>} />
        {/* UC-116 Import Teachers (above teachers/:teacherId) */}
        <Route
          path="teachers/import"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <TeacherImportPage />
            </ProtectedRoute>
          }
        />
        {/* UC-114 Manage Departments */}
        <Route
          path="departments"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <DepartmentsPage />
            </ProtectedRoute>
          }
        />
        {/* SCR-15 Teacher Detail */}
        <Route
          path="teachers/:teacherId"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <TeacherDetailPage />
            </ProtectedRoute>
          }
        />
        {/* SCR-17 Update Teacher */}
        <Route
          path="teachers/:teacherId/edit"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <TeacherEditPage />
            </ProtectedRoute>
          }
        />
        {/* SCR-18 Homeroom Assignment (UC-19) */}
        <Route
          path="homeroom-assignments"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <HomeroomAssignmentPage />
            </ProtectedRoute>
          }
        />
        {/* SCR-19 Teaching Assignment (UC-18) */}
        <Route
          path="teaching-assignments"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <TeachingAssignmentPage />
            </ProtectedRoute>
          }
        />
        {/* FE-13 System Administration (System Admin only) */}
        {[
          ['admin/accounts', <AccountListPage />], // UC-97, UC-98
          ['admin/accounts/new', <CreateAccountPage />], // UC-95
          ['admin/accounts/import', <ImportAccountsPage />], // UC-96
          ['admin/accounts/:id', <AccountDetailPage />], // UC-100, UC-101
          ['admin/accounts/:id/edit', <EditIdentifiersPage />], // UC-99
          ['admin/settings', <SystemSettingsPage />], // UC-102
          ['admin/maintenance', <MaintenancePage />], // UC-103
        ].map(([path, page]) => (
          <Route key={path} path={path} element={<ProtectedRoute roles={['SYSTEM_ADMIN']}>{page}</ProtectedRoute>} />
        ))}
        <Route
          path="admin/password-reset-requests"
          element={
            <ProtectedRoute roles={['SYSTEM_ADMIN', 'SCHOOL_MANAGER']}>
              <PasswordResetRequestsPage />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
