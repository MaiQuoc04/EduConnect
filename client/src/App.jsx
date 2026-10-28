import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { HOME_BY_ROLE } from './navigation.js';
import ChangePasswordPage from './pages/account/ChangePasswordPage.jsx';
import EditAvatarPage from './pages/account/EditAvatarPage.jsx';
import ForgotPasswordPage from './pages/account/ForgotPasswordPage.jsx';
import LoginPage from './pages/account/LoginPage.jsx';
import ProfilePage from './pages/account/ProfilePage.jsx';
import HomeroomAssignmentPage from './pages/teachers/HomeroomAssignmentPage.jsx';
import TeacherDetailPage from './pages/teachers/TeacherDetailPage.jsx';
import TeacherEditPage from './pages/teachers/TeacherEditPage.jsx';
import TeacherListPage from './pages/teachers/TeacherListPage.jsx';
import TeachingAssignmentPage from './pages/teachers/TeachingAssignmentPage.jsx';
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
