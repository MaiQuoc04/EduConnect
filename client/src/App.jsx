import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { HOME_BY_ROLE } from './navigation.js';
import ChangePasswordPage from './pages/account/ChangePasswordPage.jsx';
import EditAvatarPage from './pages/account/EditAvatarPage.jsx';
import ForgotPasswordPage from './pages/account/ForgotPasswordPage.jsx';
import LoginPage from './pages/account/LoginPage.jsx';
import ProfilePage from './pages/account/ProfilePage.jsx';
import StudentDetailPage from './pages/students/StudentDetailPage.jsx';
import StudentListPage from './pages/students/StudentListPage.jsx';
import StudentParentsPage from './pages/students/StudentParentsPage.jsx';
import TransferStudentPage from './pages/students/TransferStudentPage.jsx';
import UpdateStudentPage from './pages/students/UpdateStudentPage.jsx';
import UpdateStudentRelationshipPage from './pages/students/UpdateStudentRelationshipPage.jsx';
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
