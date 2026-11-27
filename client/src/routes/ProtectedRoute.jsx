import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Redirects to /login when signed out, and to /change-password while the account has a temporary password (UC-01).
// With `roles`, also hides the page from other active roles.
// The server still checks permissions on every API call; this is only for navigation.
export default function ProtectedRoute({ roles, children }) {
  const { loading, user, activeRole, signedOut } = useAuth();
  const location = useLocation();
  if (loading) return <p className="loading">Đang tải…</p>;
  // UC-01 / UC-03: after "Đăng xuất" the next sign-in goes to the role's home page. Otherwise (a link opened while
  // signed out, an expired session) the page is remembered and opened after sign-in; if it is not for the active
  // role, the `roles` check below sends the user to "/" = HOME_BY_ROLE.
  if (!user) {
    return <Navigate to="/login" replace state={signedOut ? null : { from: location.pathname + location.search }} />;
  }
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  if (roles && !roles.includes(activeRole)) return <Navigate to="/" replace />;
  return children;
}
