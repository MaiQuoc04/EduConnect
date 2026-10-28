import { Link, useNavigate } from 'react-router-dom';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { GENDER_LABELS, RELATIONSHIP_LABELS, ROLE_LABELS } from '../../messages.js';
import { formatDate } from '../../utils/format.js';
import { useProfile } from './useProfile.js';

function Item({ label, children, wide }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className={wide ? 'wide' : undefined}>
      <dt>{label}</dt>
      <dd className={empty ? 'empty' : undefined}>{empty ? 'Chưa cập nhật' : children}</dd>
    </div>
  );
}

function CopyCode({ value }) {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast('Đã sao chép mã.');
    } catch {
      toast('Không sao chép được. Vui lòng chọn và sao chép thủ công.', { type: 'error' });
    }
  }
  return (
    <div className="code-box">
      <span>{value}</span>
      <button type="button" className="btn btn-icon" onClick={copy} aria-label="Sao chép mã">
        <Icon name="content_copy" size="sm" />
      </button>
    </div>
  );
}

// SCR-03 User Profile (UC-04): personal, school, class and role information. Read only, except the avatar (UC-06)
// and the address (UC-108), both edited on SCR-04.
export default function ProfilePage() {
  const { loading, data, error } = useProfile();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) return <p className="loading">Đang tải hồ sơ…</p>;
  if (error) return <p className="form-error">{error}</p>;

  const { user, roles, schoolYear, student, teacher, parent } = data;
  const code = student?.studentCode ?? teacher?.teacherCode;

  function handleSignOut() {
    signOut();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Tài khoản</span>/<span className="current">Hồ sơ cá nhân</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Hồ sơ của tôi</h1>
          <p>Thông tin cá nhân và dữ liệu học vụ do nhà trường quản lý.</p>
        </div>
        <Link to="/profile/avatar" className="btn btn-primary">
          <Icon name="edit" size="sm" />
          Chỉnh sửa hồ sơ
        </Link>
      </div>

      <div className="profile-grid">
        <div className="stack">
          <section className="card identity">
            <div className="identity-head">
              <Avatar src={user.avatarUrl} name={user.fullName} size={88} square />
              <div>
                <p className="identity-name">{user.fullName}</p>
                <p className="caption muted" style={{ margin: '2px 0 8px' }}>
                  @{user.username}
                </p>
                <div className="chips">
                  {roles.map((r) => (
                    <span key={r} className="chip ink">
                      {ROLE_LABELS[r] ?? r}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="facts">
              <div className="fact">
                <span>Trạng thái tài khoản</span>
                <span className={`pill ${user.status === 'ACTIVE' ? 'green' : 'red'}`}>
                  {user.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khoá'}
                </span>
              </div>
              {code && (
                <div className="fact">
                  <span>{student ? 'Mã học sinh' : 'Mã giáo viên'}</span>
                  <span className="chip mono">{code}</span>
                </div>
              )}
              <div className="fact">
                <span>Ngày tạo tài khoản</span>
                <span className="mono">{formatDate(user.createdAt)}</span>
              </div>
            </div>
          </section>

          <section className="card">
            <p className="label-upper" style={{ marginBottom: 8 }}>
              Tài khoản & bảo mật
            </p>
            <Link to="/change-password" className="menu-row">
              <Icon name="lock_reset" />
              Đổi mật khẩu tài khoản
              <Icon name="chevron_right" />
            </Link>
            <Link to="/profile/avatar" className="menu-row">
              <Icon name="account_circle" />
              Cập nhật ảnh đại diện, địa chỉ
              <Icon name="chevron_right" />
            </Link>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <h2 className="card-title title-sm">
              <Icon name="badge" />
              Thông tin cá nhân
            </h2>
            <dl className="dl">
              <Item label="Họ và tên">{user.fullName}</Item>
              <Item label="Tên đăng nhập">
                <span className="mono">{user.username}</span>
              </Item>
              {student && <Item label="Ngày sinh">{formatDate(student.dob)}</Item>}
              {student && <Item label="Giới tính">{GENDER_LABELS[student.gender] ?? student.gender}</Item>}
              <Item label="Email">{user.email}</Item>
              <Item label="Số điện thoại">{user.phone && <span className="mono">{user.phone}</span>}</Item>
              {parent && <Item label="Nghề nghiệp">{parent.occupation}</Item>}
              <Item label="Địa chỉ" wide>{user.address}</Item>
            </dl>
          </section>

          {student && (
            <section className="card">
              <h2 className="card-title title-sm">
                <Icon name="school" />
                Thông tin trường lớp
              </h2>
              <dl className="dl">
                <Item label="Năm học">{schoolYear}</Item>
                <Item label="Lớp hiện tại">
                  {student.class && (
                    <>
                      <span style={{ color: 'var(--ink-700)' }}>{student.class.name}</span>{' '}
                      <span className="muted">({student.class.track})</span>
                    </>
                  )}
                </Item>
                <Item label="Giáo viên chủ nhiệm">{student.class?.homeroomTeacher}</Item>
                {student.class?.nickname && <Item label="Biệt danh trong lớp">{student.class.nickname}</Item>}
                <Item label="Mã học sinh" wide>
                  <CopyCode value={student.studentCode} />
                </Item>
              </dl>
            </section>
          )}

          {teacher && (
            <section className="card">
              <h2 className="card-title title-sm">
                <Icon name="co_present" />
                Thông tin giảng dạy
                {schoolYear && <span className="aside chip">Năm học {schoolYear}</span>}
              </h2>
              <dl className="dl">
                <Item label="Mã giáo viên">
                  <span className="mono">{teacher.teacherCode}</span>
                </Item>
                <Item label="Tổ chuyên môn">{teacher.department}</Item>
                <Item label="Lớp chủ nhiệm">{teacher.homeroomClasses.join(', ')}</Item>
                <Item label="Môn có thể giảng dạy">
                  {teacher.subjects.length > 0 && (
                    <span className="chips">
                      {teacher.subjects.map((s) => (
                        <span key={s} className="chip">
                          {s}
                        </span>
                      ))}
                    </span>
                  )}
                </Item>
              </dl>
              {teacher.teaching.length > 0 && (
                <div style={{ marginTop: 20, overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Lớp</th>
                        <th>Môn giảng dạy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teacher.teaching.map((t) => (
                        <tr key={`${t.className}-${t.subjectName}`}>
                          <td style={{ fontWeight: 500 }}>{t.className}</td>
                          <td>{t.subjectName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {parent && (
            <section className="card">
              <h2 className="card-title title-sm">
                <Icon name="family_restroom" />
                Con của tôi
              </h2>
              {parent.children.length === 0 && <p className="muted">Chưa liên kết với học sinh nào.</p>}
              {parent.children.map((c) => (
                <div key={c.studentCode} className="child-row">
                  <Avatar name={c.fullName} size={36} />
                  <div>
                    <div style={{ fontWeight: 500 }}>{c.fullName}</div>
                    <div className="caption muted">
                      {c.className ? `Lớp ${c.className}` : 'Chưa xếp lớp năm học này'} · <span className="mono">{c.studentCode}</span>
                    </div>
                  </div>
                  <span className="chip">{RELATIONSHIP_LABELS[c.relationship] ?? c.relationship}</span>
                </div>
              ))}
            </section>
          )}

          <div className="notice">
            <Icon name="info" />
            <div>
              <p className="notice-title">Quy định chỉnh sửa dữ liệu</p>
              <p className="caption" style={{ fontStyle: 'italic' }}>
                Bạn chỉ tự cập nhật được ảnh đại diện, địa chỉ và mật khẩu. Họ tên, ngày sinh, lớp, email, số điện thoại và tên
                đăng nhập do nhà trường quản lý; vui lòng liên hệ văn phòng nhà trường hoặc giáo viên chủ nhiệm khi cần
                điều chỉnh.
              </p>
            </div>
          </div>

          <div className="actions-row">
            <Link to="/change-password" className="btn btn-secondary">
              <Icon name="key" size="sm" />
              Đổi mật khẩu
            </Link>
            <button type="button" className="btn btn-danger push" onClick={handleSignOut}>
              <Icon name="logout" size="sm" />
              Đăng xuất
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
