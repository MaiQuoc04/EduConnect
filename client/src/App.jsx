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
