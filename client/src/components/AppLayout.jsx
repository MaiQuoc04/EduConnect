import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_LABELS } from '../messages.js';
import { navFor } from '../navigation.js';
import MaintenanceBanner from '../pages/admin/MaintenanceBanner.jsx'; // FE-13 UC-103
import { unreadLabel } from '../pages/chat/chatText.js';
import { useChatUnreadTotal } from '../pages/chat/useChatUnread.js'; // FE-06 menu badge
import { useModerationBadge } from '../pages/moderation/useModerationBadge.js'; // FE-08 moderation menu badge
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import NotificationBell from './NotificationBell.jsx'; // FE-09 UC-67

// App shell from Stitch: 232px graphite-50 navigation rail + content on paper. Below 900px the rail becomes a drawer.
export default function AppLayout() {
  const { user, roles, activeRole, switchRole, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const sections = navFor(activeRole);
  // FE-06 (20/11/2026): unread chat messages on "Trò chuyện", for the roles that have it in the menu.
  const chatUnread = useChatUnreadTotal(sections.some((s) => s.items.some((i) => i.to === '/chat')));
  // FE-08 moderation (25/11/2026): message reports waiting on "Quy chuẩn cộng đồng", highlighted when one is "Cần được hỗ trợ".
  const moderation = useModerationBadge(sections.some((s) => s.items.some((i) => i.to === '/moderation')));
  const BADGES = { '/chat': chatUnread, '/moderation': moderation.pendingCount };
  const BADGE_TEXT = { '/moderation': 'báo cáo tin nhắn đang chờ' }; // default: unread messages (FE-06)
  const HIGHLIGHT = { '/moderation': moderation.supportCount > 0 };

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
          {sections.map((section) => (
            <div className="nav-section" key={section.label}>
              <div className="label-upper">{section.label}</div>
              {section.items.map((item) => {
                const badge = BADGES[item.to] ?? 0;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className="nav-item"
                    aria-label={badge ? `${item.label}, ${badge} ${BADGE_TEXT[item.to] ?? 'tin nhắn chưa đọc'}` : undefined}
                  >
                    <Icon name={item.icon} />
                    {item.label}
                    {badge > 0 && (
                      <span className={`nav-badge${HIGHLIGHT[item.to] ? ' is-urgent' : ''}`} aria-hidden="true">
                        {unreadLabel(badge)}
                      </span>
                    )}
                  </NavLink>
                );
              })}
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
          <button
            type="button"
            className="btn btn-icon menu-button"
            onClick={() => setNavOpen(true)}
            aria-label={chatUnread ? `Mở menu, ${chatUnread} tin nhắn chưa đọc` : 'Mở menu'}
          >
            <Icon name="menu" />
            {chatUnread > 0 && <span className="menu-dot" aria-hidden="true" />}
          </button>
          <Link to="/" className="brand">
            EduConnect
          </Link>
          <span className="spacer" />
          <NotificationBell />
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
