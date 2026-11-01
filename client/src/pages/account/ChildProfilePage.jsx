import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { errorText, GENDER_LABELS, RELATIONSHIP_LABELS } from '../../messages.js';
import { formatDate } from '../../utils/format.js';
import Item from './ProfileItem.jsx';

// UC-110 View Child Profile (part of SCR-03): a parent views the profile of one linked child. Read only.
export default function ChildProfilePage() {
  const { studentId } = useParams();
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, data: null, error: '' });
    api
      .get(`/account/children/${studentId}`)
      .then(({ data }) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [studentId]);

  const breadcrumb = (current) => (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <span>EduConnect</span>/<Link to="/profile">Hồ sơ cá nhân</Link>/<span className="current">{current}</span>
    </nav>
  );

  if (state.loading) return <p className="loading">Đang tải hồ sơ…</p>;
  if (state.error) {
    return (
      <>
        {breadcrumb('Hồ sơ của con')}
        <p className="form-error">{state.error}</p>
      </>
    );
  }

  const { user, relationship, schoolYear, student } = state.data;

  return (
    <>
      {breadcrumb(user.fullName)}
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Hồ sơ của con</h1>
          <p>Thông tin do nhà trường quản lý. Khi cần điều chỉnh, vui lòng liên hệ văn phòng hoặc giáo viên chủ nhiệm.</p>
        </div>
        <Link to="/profile" className="btn btn-secondary">
          <Icon name="arrow_back" size="sm" />
          Quay lại
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
                  <span className="chip ink">Học sinh</span>
                  <span className="chip">{RELATIONSHIP_LABELS[relationship] ?? relationship}</span>
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
              {student && (
                <div className="fact">
                  <span>Mã học sinh</span>
                  <span className="chip mono">{student.studentCode}</span>
                </div>
              )}
            </div>
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
              <Item label="Ngày sinh">{student && formatDate(student.dob)}</Item>
              <Item label="Giới tính">{student && (GENDER_LABELS[student.gender] ?? student.gender)}</Item>
              <Item label="Email">{user.email}</Item>
              <Item label="Số điện thoại">{user.phone && <span className="mono">{user.phone}</span>}</Item>
              <Item label="Địa chỉ" wide>
                {user.address}
              </Item>
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
              </dl>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
