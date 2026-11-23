import AccountSecurityActions from './AccountSecurityActions.jsx';
import Icon from '../../components/Icon.jsx';

// FE-13 (owner: Linh), 23/11/2026: "Tài khoản đăng nhập" card for the School Manager's student and parent detail
// pages (FE-02, FE-14): edit email / phone, reset password, lock / unlock (UC-99, UC-100, UC-101). The teacher detail
// page (FE-03) already has its own card with AccountSecurityActions.
//   <SchoolAccountCard userId={student.userId} username={student.username} />
export default function SchoolAccountCard({ userId, username, onChanged }) {
  if (!userId) return null;
  return (
    <section className="card card-outline" style={{ marginTop: 24 }}>
      <h2 className="card-title title-sm">
        <Icon name="manage_accounts" />
        Tài khoản đăng nhập
      </h2>
      <p className="caption muted" style={{ marginBottom: 12 }}>
        Sửa email, số điện thoại, đặt lại mật khẩu, khoá hoặc mở khoá tài khoản{username ? ` @${username}` : ''}.
      </p>
      <AccountSecurityActions userId={userId} onChanged={onChanged} compact />
    </section>
  );
}
