import Icon from './Icon.jsx';

// Centered paper layout for the signed-out screens (SCR-01 Login, SCR-02 Forgot Password). Mobile-friendly.
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <main className="auth-page">
      <div className="auth-inner">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="edit" />
          </span>
          EduConnect
        </div>
        <h1 className="headline-xl auth-title">{title}</h1>
        {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        {children}
        {footer}
      </div>
    </main>
  );
}
