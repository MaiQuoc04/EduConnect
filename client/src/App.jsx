import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { HOME_BY_ROLE } from './navigation.js';
import ChangePasswordPage from './pages/account/ChangePasswordPage.jsx';
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
        <Route path="change-password" element={<ChangePasswordPage />} />
        {/* FE-13 System Administration (System Admin only) */}
        {[
          ['admin/accounts', <AccountListPage />], // UC-94, UC-95
          ['admin/accounts/new', <CreateAccountPage />], // UC-92
          ['admin/accounts/import', <ImportAccountsPage />], // UC-93
          ['admin/accounts/:id', <AccountDetailPage />], // UC-97, UC-98
          ['admin/accounts/:id/edit', <EditIdentifiersPage />], // UC-96
          ['admin/settings', <SystemSettingsPage />], // UC-99
          ['admin/maintenance', <MaintenancePage />], // UC-100
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
