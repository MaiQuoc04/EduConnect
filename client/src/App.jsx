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
import UpdateStudentPage from './pages/students/UpdateStudentPage.jsx';
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
