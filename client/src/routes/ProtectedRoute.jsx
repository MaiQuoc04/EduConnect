import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Redirects to /login when signed out. With `roles`, also hides the page from other active roles.
// The server still checks permissions on every API call; this is only for navigation.
export default function ProtectedRoute({ roles, children }) {
  const { loading, user, activeRole } = useAuth();
  if (loading) return <p className="center muted">Đang tải…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(activeRole)) return <Navigate to="/" replace />;
  return children;
}
