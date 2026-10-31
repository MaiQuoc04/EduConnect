import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  clearTemporaryLock,
  getSecurityState,
  lockAccount,
  resetPassword,
  unlockAccount,
} from '../../api/admin.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import Dialog from './Dialog.jsx';
import { formatDateTime } from './format.js';
import './admin.css';

// UC-97 Reset Password and UC-98 Lock / Unlock Account (FE-13, owner: Linh).
// Used on Account Detail (System Admin) and meant to be dropped into the student / teacher / parent detail screens
// of FE-02, FE-03 and FE-14 for School Manager:
//   <AccountSecurityActions userId={student.userId} />
// It loads the account status itself (GET /admin/accounts/:id/security). `account` (with status, tempLocked,
// lockedUntil, fullName) can be passed to skip that request; `onChanged(account)` runs after each change.
// The server decides who may act on whom (School Manager: student, parent and teacher accounts only).
export default function AccountSecurityActions({ userId, account: given, onChanged, compact = false }) {
  const { user } = useAuth();
  const toast = useToast();
  const [account, setAccount] = useState(given ?? null);
  const [loadError, setLoadError] = useState('');
  const [dialog, setDialog] = useState(null); // reset | lock | unlock | clear | password
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const id = userId ?? given?.id;

  useEffect(() => {
    if (given) setAccount(given);
  }, [given]);

  const load = useCallback(async () => {
    try {
      setAccount(await getSecurityState(id));
    } catch (err) {
      setLoadError(err.code === 'FORBIDDEN' ? '' : errorText(err));
      setAccount(null);
    }
  }, [id]);

  useEffect(() => {
    if (!given && id) load();
  }, [given, id, load]);

  if (loadError) return <p className="caption" style={{ color: 'var(--red-pen)' }}>{loadError}</p>;
  if (!account) return null;

  const self = account.id === user?.id;
  const close = () => {
    setDialog(null);
    setError('');
    setReason('');
  };

  async function run(action, message) {
    setBusy(true);
    setError('');
    try {
      const updated = await action();
      if (updated?.temporaryPassword) {
        setPassword(updated.temporaryPassword);
        setDialog('password');
        const next = { ...account, tempLocked: false, lockedUntil: null, mustChangePassword: true, pendingResetRequest: null };
        setAccount(next);
        onChanged?.(next);
      } else {
        setAccount(updated);
        onChanged?.(updated);
        close();
        toast(message);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password);
      toast('Đã sao chép mật khẩu tạm thời.');
    } catch {
      toast('Không sao chép được. Vui lòng chọn và sao chép thủ công.', { type: 'error' });
    }
  }

  const dialogError = error && (
    <p className="form-error" role="alert">
      <Icon name="error" size="sm" />
      {error}
    </p>
  );

  return (
    <>
      <div className={`security-actions${compact ? ' compact' : ''}`}>
        {account.pendingResetRequest && (
          <div className="notice ink">
            <Icon name="key" />
            <div>
              <p className="notice-title">Đã cấp mật khẩu dùng một lần theo yêu cầu</p>
              <p>
                Người dùng gửi yêu cầu lúc {formatDateTime(account.pendingResetRequest.createdAt)}
                {account.pendingResetRequest.reason && `: “${account.pendingResetRequest.reason}”`}. Mật khẩu xem tại trang{' '}
                <Link to="/admin/password-reset-requests">Yêu cầu cấp lại mật khẩu</Link> và dùng được đến khi người dùng
                đăng nhập.
              </p>
            </div>
          </div>
        )}
        {account.tempLocked && (
          <div className="notice amber">
            <Icon name="timer" />
            <div>
              <p className="notice-title">Đang bị khoá đăng nhập tạm thời</p>
              <p>Do nhập sai mật khẩu nhiều lần, đến {formatDateTime(account.lockedUntil)}.</p>
            </div>
          </div>
        )}
        <div className="actions-row">
          <button type="button" className="btn btn-secondary" onClick={() => setDialog('reset')}>
            <Icon name="key" size="sm" />
            Đặt lại mật khẩu
          </button>
          {account.tempLocked && (
            <button type="button" className="btn btn-secondary" onClick={() => setDialog('clear')}>
              <Icon name="lock_clock" size="sm" />
              Gỡ khoá tạm thời
            </button>
          )}
          {account.status === 'LOCKED' ? (
            <button type="button" className="btn btn-secondary" onClick={() => setDialog('unlock')}>
              <Icon name="lock_open" size="sm" />
              Mở khoá tài khoản
            </button>
          ) : (
            !self && (
              <button type="button" className="btn btn-danger" onClick={() => setDialog('lock')}>
                <Icon name="lock" size="sm" />
                Khoá tài khoản
              </button>
            )
          )}
        </div>
      </div>

      {dialog === 'reset' && (
        <Dialog
          title="Đặt lại mật khẩu"
          icon="key"
          onClose={close}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>
                Huỷ
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => resetPassword(account.id))}>
                {busy ? 'Đang đặt lại…' : 'Đặt lại mật khẩu'}
              </button>
            </>
          }
        >
          <p>
            Đặt lại mật khẩu của <strong>{account.fullName}</strong>? Mật khẩu hiện tại sẽ không dùng được nữa. Hệ thống tạo
            một mật khẩu tạm thời và người dùng phải đổi ở lần đăng nhập tiếp theo.
          </p>
          {account.status === 'LOCKED' && (
            <p className="caption muted" style={{ marginTop: 8 }}>
              Tài khoản đang bị khoá: người dùng chỉ đăng nhập được sau khi được mở khoá.
            </p>
          )}
          {dialogError}
        </Dialog>
      )}

      {dialog === 'password' && (
        <Dialog title="Mật khẩu tạm thời" icon="check_circle" onClose={close} footer={<button type="button" className="btn btn-primary" onClick={close}>Đã ghi lại</button>}>
          <p>
            Mật khẩu mới của <strong>{account.fullName}</strong> (<span className="mono">{account.username}</span>):
          </p>
          <div className="code-box secret-box">
            <span>{password}</span>
            <button type="button" className="btn btn-icon" onClick={copyPassword} aria-label="Sao chép mật khẩu tạm thời">
              <Icon name="content_copy" size="sm" />
            </button>
          </div>
          <div className="notice amber">
            <Icon name="warning" />
            <p>Mật khẩu này chỉ hiển thị một lần. Hãy bàn giao cho người dùng; họ phải đổi mật khẩu ngay khi đăng nhập.</p>
          </div>
        </Dialog>
      )}

      {dialog === 'lock' && (
        <Dialog
          title="Khoá tài khoản"
          icon="lock"
          tone="red"
          onClose={close}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>
                Huỷ
              </button>
              <button
                type="button"
                className="btn btn-danger-solid"
                disabled={busy}
                onClick={() => run(() => lockAccount(account.id, reason), 'Đã khoá tài khoản.')}
              >
                {busy ? 'Đang khoá…' : 'Khoá tài khoản'}
              </button>
            </>
          }
        >
          <p>
            Khoá <strong>{account.fullName}</strong>? Người dùng sẽ không đăng nhập được. Bài viết, tin nhắn và điểm số của
            tài khoản vẫn được giữ nguyên.
          </p>
          {account.roles?.includes('TEACHER') && (
            <p className="caption muted" style={{ marginTop: 8 }}>
              Đây là tài khoản giáo viên: các quản lý nhà trường sẽ nhận thông báo để phân công lại chủ nhiệm và giảng dạy.
            </p>
          )}
          <label className="field" style={{ marginTop: 16 }}>
            <span className="field-label">Lý do (không bắt buộc)</span>
            <textarea
              className="input textarea"
              rows={3}
              maxLength={255}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ví dụ: giáo viên nghỉ việc"
            />
          </label>
          {dialogError}
        </Dialog>
      )}

      {(dialog === 'unlock' || dialog === 'clear') && (
        <Dialog
          title={dialog === 'unlock' ? 'Mở khoá tài khoản' : 'Gỡ khoá đăng nhập tạm thời'}
          icon="lock_open"
          onClose={close}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>
                Huỷ
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() =>
                  dialog === 'unlock'
                    ? run(() => unlockAccount(account.id), 'Đã mở khoá tài khoản.')
                    : run(() => clearTemporaryLock(account.id), 'Đã gỡ khoá đăng nhập tạm thời.')
                }
              >
                {busy ? 'Đang xử lý…' : dialog === 'unlock' ? 'Mở khoá' : 'Gỡ khoá'}
              </button>
            </>
          }
        >
          <p>
            {dialog === 'unlock'
              ? `Mở khoá ${account.fullName}? Người dùng đăng nhập lại được bằng mật khẩu hiện tại.`
              : `${account.fullName} đang bị khoá đăng nhập do nhập sai mật khẩu nhiều lần. Gỡ khoá để người dùng thử lại ngay.`}
          </p>
          {dialogError}
        </Dialog>
      )}
    </>
  );
}
