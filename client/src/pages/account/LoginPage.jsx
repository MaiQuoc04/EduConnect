import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/AuthLayout.jsx';
import Icon from '../../components/Icon.jsx';
import PasswordInput from '../../components/PasswordInput.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { errorText } from '../../messages.js';
import { currentSchoolYearLabel } from '../../utils/format.js';

// SCR-01 Login Page (UC-01). Sign in with email, phone number or username. Also has a mobile layout.
export default function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user && !submitting) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await signIn(identifier.trim(), password);
      // UC-01: a temporary password must be changed before anything else.
      const target = data.user.mustChangePassword ? '/change-password' : (location.state?.from ?? '/');
      navigate(target, { replace: true });
    } catch (err) {
      setError(errorText(err));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={
        <>
          Nhà trường, thầy cô, học sinh và phụ huynh – trên{' '}
          <span className="ink-underline">
            cùng một trang
            <svg viewBox="0 0 100 12" preserveAspectRatio="none" fill="none" aria-hidden="true">
              <path d="M2 8C25 3 65 2 98 7" stroke="#5B3AA0" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </span>
          .
        </>
      }
      subtitle="Cổng thông tin và học tập chính thức của nhà trường."
      footer={
        <>
          <p className="auth-footnote">Tài khoản do nhà trường cấp. Chưa có tài khoản? Liên hệ văn phòng nhà trường.</p>
          <div className="auth-meta">
            <span className="status-dot">Năm học {currentSchoolYearLabel()}</span>
            <span>EduConnect © {new Date().getFullYear()} · Hệ thống thông tin trường học</span>
          </div>
        </>
      }
    >
      <form className="card card-outline auth-panel" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="field-label">Email, số điện thoại hoặc tên đăng nhập</span>
          <input
            className="input"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Nhập email, SĐT hoặc tên đăng nhập"
            autoComplete="username"
            autoFocus
            required
          />
        </label>
        <div className="field">
          <label className="field-label" htmlFor="password">
            Mật khẩu
          </label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
          <div style={{ textAlign: 'right' }}>
            <Link to="/forgot-password" className="caption" style={{ fontWeight: 500 }}>
              Quên mật khẩu?
            </Link>
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            <Icon name="error" size="sm" />
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting || !identifier.trim() || !password}>
          {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </AuthLayout>
  );
}
