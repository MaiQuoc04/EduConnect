import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import AuthLayout from '../../components/AuthLayout.jsx';
import Icon from '../../components/Icon.jsx';
import PasswordChecklist from '../../components/PasswordChecklist.jsx';
import PasswordInput from '../../components/PasswordInput.jsx';
import { errorText } from '../../messages.js';
import { evaluatePassword } from '../../utils/passwordRules.js';

const RESEND_SECONDS = 60; // the server sends at most one email per minute

function useCountdown() {
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (endsAt <= Date.now()) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return [left, (seconds) => { setNow(Date.now()); setEndsAt(Date.now() + seconds * 1000); }];
}

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function FormError({ text }) {
  if (!text) return null;
  return (
    <p className="form-error" role="alert">
      <Icon name="error" size="sm" />
      {text}
    </p>
  );
}

// SCR-02 Forgot Password (UC-02): email → 6-digit OTP (valid N minutes, 5 tries) → new password.
export default function ForgotPasswordPage() {
  const [step, setStep] = useState('email'); // email | otp | password | done
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [serverFailed, setServerFailed] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [expiresIn, startExpiry] = useCountdown();
  const [resendIn, startResend] = useCountdown();

  async function run(action) {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
      if (err.code === 'MSG_PASSWORD_RULES') setServerFailed(err.details?.failed ?? []);
      if (err.code === 'MSG_RESET_EXPIRED') setStep('email');
    } finally {
      setBusy(false);
    }
  }

  const sendCode = () =>
    run(async () => {
      const { data } = await api.post('/auth/forgot-password', { email: email.trim() });
      startExpiry(data.expiresInMinutes * 60);
      startResend(RESEND_SECONDS);
      setOtp('');
      setStep('otp');
    });

  const verifyCode = () =>
    run(async () => {
      const { data } = await api.post('/auth/forgot-password/verify', { email: email.trim(), otp });
      setResetToken(data.resetToken);
      setStep('password');
    });

  const savePassword = () =>
    run(async () => {
      if (password !== confirm) throw { code: 'LOCAL', message: 'Mật khẩu nhập lại không khớp.' };
      await api.post('/auth/forgot-password/reset', { resetToken, newPassword: password });
      setStep('done');
    });

  const stepIndex = { email: 1, otp: 2, password: 3, done: 3 }[step];

  return (
    <AuthLayout
      title="Khôi phục mật khẩu"
      subtitle="Hệ thống hỗ trợ lấy lại quyền truy cập tài khoản do nhà trường cấp."
      footer={<p className="auth-meta label-upper">Hệ thống thông tin trường học · EduConnect</p>}
    >
      <div className="card card-outline auth-panel wide">
        <div className="steps" aria-label={`Bước ${stepIndex} trên 3`}>
          {[1, 2, 3].map((i) => (
            <span key={i} className={i <= stepIndex ? 'done' : ''} />
          ))}
        </div>

        {step === 'email' && (
          <form
            className="stack"
            style={{ gap: 16 }}
            onSubmit={(e) => {
              e.preventDefault();
              sendCode();
            }}
          >
            <div>
              <h2 className="title-md">Quên mật khẩu</h2>
              <p className="muted" style={{ marginTop: 4 }}>
                Nhập email đã đăng ký, hệ thống sẽ gửi mã OTP để xác thực tài khoản của bạn.
              </p>
            </div>
            <label className="field">
              <span className="field-label">Email</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ten@email.com"
                autoComplete="email"
                autoFocus
                required
              />
            </label>
            <FormError text={error} />
            <button className="btn btn-primary btn-block" type="submit" disabled={busy || !email.trim()}>
              {busy ? 'Đang gửi…' : 'Gửi mã'}
              <Icon name="arrow_forward" size="sm" />
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form
            className="stack"
            style={{ gap: 16 }}
            onSubmit={(e) => {
              e.preventDefault();
              verifyCode();
            }}
          >
            <div>
              <h2 className="title-md">Nhập mã xác thực</h2>
              <p className="muted" style={{ marginTop: 4 }}>
                Nếu <strong>{email.trim()}</strong> đã đăng ký trong hệ thống, mã gồm 6 chữ số đã được gửi tới email này.
              </p>
            </div>
            <label className="field">
              <span className="field-label">
                Mã OTP
                <span className={`caption ${expiresIn ? 'muted' : ''}`} style={expiresIn ? undefined : { color: 'var(--red-pen)' }}>
                  {expiresIn ? `Hết hạn sau ${mmss(expiresIn)}` : 'Mã đã hết hạn'}
                </span>
              </span>
              <input
                className="input otp-input"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                autoFocus
              />
            </label>
            <FormError text={error} />
            <button className="btn btn-primary btn-block" type="submit" disabled={busy || otp.length !== 6}>
              {busy ? 'Đang kiểm tra…' : 'Xác nhận'}
            </button>
            <div className="actions-row" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="link-button" onClick={() => setStep('email')}>
                Đổi email
              </button>
              <button type="button" className="link-button" onClick={sendCode} disabled={busy || resendIn > 0}>
                {resendIn > 0 ? `Gửi lại mã sau ${resendIn} giây` : 'Gửi lại mã'}
              </button>
            </div>
          </form>
        )}

        {step === 'password' && (
          <form
            className="stack"
            style={{ gap: 16 }}
            onSubmit={(e) => {
              e.preventDefault();
              savePassword();
            }}
          >
            <div>
              <h2 className="title-md">Đặt mật khẩu mới</h2>
              <p className="muted" style={{ marginTop: 4 }}>Mã đã được xác thực. Hãy chọn mật khẩu mới cho tài khoản.</p>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="new-password">
                Mật khẩu mới
              </label>
              <PasswordInput
                id="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setServerFailed([]);
                }}
                autoComplete="new-password"
                autoFocus
              />
            </div>
            <div className={`field${confirm && confirm !== password ? ' invalid' : ''}`}>
              <label className="field-label" htmlFor="confirm-password">
                Nhập lại mật khẩu mới
              </label>
              <PasswordInput
                id="confirm-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                matched={confirm && confirm === password}
              />
              {confirm && confirm !== password && <span className="field-error">Mật khẩu nhập lại chưa khớp.</span>}
            </div>
            <PasswordChecklist password={password} context={{}} serverFailed={serverFailed} />
            <FormError text={error} />
            <button
              className="btn btn-primary btn-block"
              type="submit"
              disabled={busy || !password || password !== confirm || evaluatePassword(password).some((r) => r.state === 'fail')}
            >
              {busy ? 'Đang lưu…' : 'Lưu mật khẩu mới'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="notice ink">
              <Icon name="check_circle" />
              <div>
                <p className="notice-title">Đã đặt lại mật khẩu</p>
                <p>Bạn có thể đăng nhập bằng mật khẩu mới.</p>
              </div>
            </div>
            <Link to="/login" className="btn btn-primary btn-block">
              Đăng nhập
            </Link>
          </div>
        )}

        {step !== 'done' && (
          <>
            <div style={{ textAlign: 'center' }}>
              <Link to="/login" style={{ fontWeight: 500 }}>
                Quay lại đăng nhập
              </Link>
            </div>
            <hr className="divider" />
            <p className="caption muted" style={{ display: 'flex', gap: 6 }}>
              <Icon name="help" size="sm" />
              Không có email? Liên hệ quản lý nhà trường để được cấp lại mật khẩu.
            </p>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
