import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_LABELS } from '../messages.js';
import { navFor } from '../navigation.js';
import MaintenanceBanner from '../pages/admin/MaintenanceBanner.jsx'; // FE-13 UC-100
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

// App shell from Stitch: 232px graphite-50 navigation rail + content on paper. Below 900px the rail becomes a drawer.
export default function AppLayout() {
  const { user, roles, activeRole, switchRole, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => setNavOpen(false), [location.pathname]);

  // UC-03 Sign Out
  function handleSignOut() {
    signOut();
    navigate('/login', { replace: true });
  }

  async function handleSwitchRole(role) {
    await switchRole(role);
    navigate('/', { replace: true });
  }

  return (
    <div className={`shell${navOpen ? ' nav-open' : ''}`}>
      <aside className="sidebar" aria-label="Điều hướng chính">
        <div className="sidebar-brand">
          <Link to="/" className="brand">
            <span className="brand-mark">
              <Icon name="edit" />
            </span>
            EduConnect
          </Link>
        </div>

        <nav className="sidebar-nav">
          {navFor(activeRole).map((section) => (
            <div className="nav-section" key={section.label}>
              <div className="label-upper">{section.label}</div>
              {section.items.map((item) => (
                <NavLink key={item.to} to={item.to} className="nav-item">
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <Link to="/profile" className="user-card">
            <Avatar src={user.avatarUrl} name={user.fullName} size={32} />
            <div>
              <div className="name">{user.fullName}</div>
              <div className="caption muted">{ROLE_LABELS[activeRole] ?? activeRole}</div>
            </div>
          </Link>
          {roles.length > 1 && (
            <select
              className="role-select"
              value={activeRole}
              onChange={(e) => handleSwitchRole(e.target.value)}
              aria-label="Chuyển vai trò"
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  Vai trò: {ROLE_LABELS[r] ?? r}
                </option>
              ))}
            </select>
          )}
          <div className="footer-links">
            <button type="button" className="footer-link" onClick={handleSignOut}>
              <Icon name="logout" size="sm" />
              Đăng xuất
            </button>
          </div>
        </div>
      </aside>
      <div className="backdrop" onClick={() => setNavOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button type="button" className="btn btn-icon menu-button" onClick={() => setNavOpen(true)} aria-label="Mở menu">
            <Icon name="menu" />
          </button>
          <Link to="/" className="brand">
            EduConnect
          </Link>
          <span className="spacer" />
          <Link to="/profile" aria-label="Hồ sơ của tôi">
            <Avatar src={user.avatarUrl} name={user.fullName} size={36} />
          </Link>
        </header>
        <MaintenanceBanner />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
