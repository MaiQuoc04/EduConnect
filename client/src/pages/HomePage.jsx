import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_LABELS } from '../messages.js';

// Placeholder landing page after sign-in (the product has no dashboard; each role lands on its main screen).
export default function HomePage() {
  const { user, activeRole } = useAuth();
  return (
    <section>
      <h2>Xin chào, {user.fullName}</h2>
      <p className="muted">Vai trò hiện tại: {ROLE_LABELS[activeRole] ?? activeRole}.</p>
      {user.mustChangePassword && <p className="error">Vui lòng đổi mật khẩu tạm thời của bạn.</p>}
    </section>
  );
}
