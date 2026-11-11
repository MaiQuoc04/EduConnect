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
<<<<<<< HEAD
import GroupPendingTab from './pages/groups/GroupPendingTab.jsx';

=======
import FeedGuard from './pages/groupfeed/FeedGuard.jsx';
import GroupFeedPage from './pages/groupfeed/GroupFeedPage.jsx';
import GroupPostDetailPage from './pages/groupfeed/GroupPostDetailPage.jsx';
import GroupPostFormPage from './pages/groupfeed/GroupPostFormPage.jsx';
>>>>>>> d0fdb5dc0c4ea217196c3977d481f9467877cb90
import CreateSchoolPostPage from './pages/schoolfeed/CreateSchoolPostPage.jsx';
import SchoolFeedPage from './pages/schoolfeed/SchoolFeedPage.jsx';
import { SCHOOL_FEED_ROLES } from './pages/schoolfeed/schoolFeedShared.jsx';
import SchoolPostDetailPage from './pages/schoolfeed/SchoolPostDetailPage.jsx';
import UpdateSchoolPostPage from './pages/schoolfeed/UpdateSchoolPostPage.jsx';
<<<<<<< HEAD

import ParentDetailPage from './pages/parents/ParentDetailPage.jsx';
import ParentListPage from './pages/parents/ParentListPage.jsx';
import UpdateParentPage from './pages/parents/UpdateParentPage.jsx';

=======
import ParentDetailPage from './pages/parents/ParentDetailPage.jsx';
import ParentListPage from './pages/parents/ParentListPage.jsx';
import UpdateParentPage from './pages/parents/UpdateParentPage.jsx';
>>>>>>> d0fdb5dc0c4ea217196c3977d481f9467877cb90
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
        {/* FE-08 School Feed: SCR-02 (home of every role except System Admin, navigation.js HOME_BY_ROLE) and SCR-05.
            System Admin sees no content (business-rules §1); the server answers 403 to SA as well. */}
        <Route
          path="school-feed"
          element={
            <ProtectedRoute roles={SCHOOL_FEED_ROLES}>
              <SchoolFeedPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="school-feed/:schoolPostId"
          element={
            <ProtectedRoute roles={SCHOOL_FEED_ROLES}>
              <SchoolPostDetailPage />
            </ProtectedRoute>
          }
        />
        {/* SCR-31 (UC-60) and SCR-06 (UC-61): School Manager only (permissions.md "School post – Create / update").
            "new" is a static segment, so React Router ranks it above ":schoolPostId". */}
        <Route
          path="school-feed/new"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <CreateSchoolPostPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="school-feed/:schoolPostId/edit"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <UpdateSchoolPostPage />
            </ProtectedRoute>
          }
        />
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
        {/* FE-14 Parent Management (Anh) */}
        <Route
          path="parents"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <ParentListPage />
            </ProtectedRoute>
          }
        />
        {/* UC-105 View Parent Detail (SCR-10), opened from SCR-69. */}
        <Route
          path="parents/:parentId"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <ParentDetailPage />
            </ProtectedRoute>
          }
        />
        {/* UC-106 Update Parent Information (SCR-16), opened from SCR-10. */}
        <Route
          path="parents/:parentId/edit"
          element={
            <ProtectedRoute roles={['SCHOOL_MANAGER']}>
              <UpdateParentPage />
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
          {/* FE-05 Group Feed (Khanh): SCR-35..SCR-38. The pages check canSeeContent / feed groups themselves. */}
          <Route path="feed" element={<FeedGuard />}>
            <Route index element={<GroupFeedPage />} />
            <Route path="new" element={<GroupPostFormPage />} />
            <Route path=":postId" element={<GroupPostDetailPage />} />
            <Route path=":postId/edit" element={<GroupPostFormPage />} />
          </Route>
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
