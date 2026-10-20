import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_LABELS } from '../messages.js';

// Shared page frame: header with role switcher (only shown when the account has several roles).
export default function AppLayout() {
  const { user, roles, activeRole, switchRole, signOut } = useAuth();

  return (
    <div className="layout">
      <header className="topbar">
        <strong className="brand">EduConnect</strong>
        <div className="topbar-right">
          {roles.length > 1 && (
            <select value={activeRole} onChange={(e) => switchRole(e.target.value)} aria-label="Chuyển vai trò">
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r] ?? r}
                </option>
              ))}
            </select>
          )}
          <span>{user.fullName}</span>
          <button className="link" onClick={signOut}>
            Đăng xuất
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
