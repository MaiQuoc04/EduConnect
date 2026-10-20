import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Redirects to /login when signed out, and to /change-password while the account has a temporary password (UC-01).
// With `roles`, also hides the page from other active roles.
// The server still checks permissions on every API call; this is only for navigation.
export default function ProtectedRoute({ roles, children }) {
  const { loading, user, activeRole } = useAuth();
  const location = useLocation();
  if (loading) return <p className="loading">Đang tải…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  if (roles && !roles.includes(activeRole)) return <Navigate to="/" replace />;
  return children;
}
