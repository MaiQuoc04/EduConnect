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
import SubjectDetailPage from './pages/subjects/SubjectDetailPage.jsx';
import SubjectFormPage from './pages/subjects/SubjectFormPage.jsx';
import SubjectListPage from './pages/subjects/SubjectListPage.jsx';
import HomeroomAssignmentPage from './pages/teachers/HomeroomAssignmentPage.jsx';
import TeacherDetailPage from './pages/teachers/TeacherDetailPage.jsx';
import TeacherEditPage from './pages/teachers/TeacherEditPage.jsx';
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
          {/* FE-05 (Anh): replace GroupPendingTab with the group feed page. */}
          <Route path="feed" element={<GroupPendingTab kind="feed" />} />
          <Route path="members" element={<GroupMembersPage />} />
        </Route>
        {/* Split chat view: shell from FE-04, messages by FE-06 (Anh). */}
        {['chat', 'chat/:groupId'].map((path) => (
          <Route
            key={path}
            path={path}
            element={
              <ProtectedRoute roles={['TEACHER', 'STUDENT', 'PARENT']}>
                <ChatPage />
              </ProtectedRoute>
            }
          />
        ))}
        {/* SCR-13 Teacher List */}
        <Route
          path="teachers"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <TeacherListPage />
            </ProtectedRoute>
          }
        />
        {/* SCR-14 Teacher Detail */}
        <Route
          path="teachers/:teacherId"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <TeacherDetailPage />
            </ProtectedRoute>
          }
        />
        {/* SCR-15 Update Teacher */}
        <Route
          path="teachers/:teacherId/edit"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <TeacherEditPage />
            </ProtectedRoute>
          }
        />
        {/* SCR-16 Homeroom Assignment (UC-19) */}
        <Route
          path="homeroom-assignments"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <HomeroomAssignmentPage />
            </ProtectedRoute>
          }
        />
        {/* SCR-17 Teaching Assignment (UC-18) */}
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
