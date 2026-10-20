import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import PasswordChecklist from '../../components/PasswordChecklist.jsx';
import PasswordInput from '../../components/PasswordInput.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { evaluatePassword } from '../../utils/passwordRules.js';

// SCR-05 Change Password (UC-05). Also the forced change of a temporary password right after sign-in (UC-01).
export default function ChangePasswordPage() {
  const { user, passwordChanged } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [serverFailed, setServerFailed] = useState([]);
  const [error, setError] = useState('');
  const [currentWrong, setCurrentWrong] = useState(false);
  const [saving, setSaving] = useState(false);
  const forced = user.mustChangePassword;
  const mismatch = confirm && confirm !== password;
  const context = { username: user.username, phone: user.phone, current };
  const rulesFailing = evaluatePassword(password, context).some((r) => r.state === 'fail');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setCurrentWrong(false);
    setSaving(true);
    try {
      const { data } = await api.put('/account/password', { currentPassword: current, newPassword: password });
      passwordChanged(data.token);
      toast('Đổi mật khẩu thành công. Lần đăng nhập tiếp theo vui lòng sử dụng mật khẩu mới.');
      navigate('/profile', { replace: true });
    } catch (err) {
      if (err.code === 'MSG_WRONG_CURRENT_PASSWORD') setCurrentWrong(true);
      else setError(errorText(err));
      if (err.code === 'MSG_PASSWORD_RULES') setServerFailed(err.details?.failed ?? []);
      setSaving(false);
    }
  }

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Tài khoản</span>/<span className="current">Đổi mật khẩu</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Đổi mật khẩu</h1>
          <p>Thiết lập mật khẩu mới để bảo mật tài khoản của bạn.</p>
        </div>
      </div>

      <form className="card card-outline form-card" onSubmit={handleSubmit} noValidate>
        {forced && (
          <div className="notice ink">
            <Icon name="shield_lock" />
            <div>
              <p className="notice-title">Bạn đang dùng mật khẩu tạm thời</p>
              <p>Vui lòng đặt mật khẩu mới trước khi sử dụng hệ thống.</p>
            </div>
          </div>
        )}

        <div className={`field${currentWrong ? ' invalid' : ''}`}>
          <label className="field-label" htmlFor="current-password">
            {forced ? 'Mật khẩu tạm thời' : 'Mật khẩu hiện tại'}
            <Link to="/forgot-password" className="caption" style={{ textDecoration: 'underline' }}>
              Quên mật khẩu?
            </Link>
          </label>
          <PasswordInput
            id="current-password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setCurrentWrong(false);
            }}
            autoComplete="current-password"
            autoFocus
          />
          {currentWrong ? (
            <span className="field-error">Mật khẩu hiện tại không đúng.</span>
          ) : (
            <span className="field-help">Mật khẩu bạn đang dùng để đăng nhập.</span>
          )}
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
          />
        </div>

        <div className={`field${mismatch ? ' invalid' : ''}`}>
          <label className="field-label" htmlFor="confirm-password">
            Nhập lại mật khẩu mới
          </label>
          <PasswordInput
            id="confirm-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            matched={confirm && !mismatch}
          />
          {mismatch && <span className="field-error">Mật khẩu nhập lại chưa khớp.</span>}
        </div>

        <PasswordChecklist password={password} context={context} serverFailed={serverFailed} />

        {error && (
          <p className="form-error" role="alert">
            <Icon name="error" size="sm" />
            {error}
          </p>
        )}

        <div className="section-sep" style={{ margin: 0 }} />
        <div className="card-footer">
          {!forced && (
            <Link to="/profile" className="btn btn-secondary">
              Huỷ
            </Link>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || !current || !password || password !== confirm || rulesFailing}
          >
            <Icon name="lock_reset" size="sm" />
            {saving ? 'Đang lưu…' : 'Lưu mật khẩu'}
          </button>
        </div>
      </form>
    </>
  );
}
