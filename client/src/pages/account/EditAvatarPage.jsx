import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { useProfile } from './useProfile.js';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

function ReadOnlyField({ label, value, help }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="input-wrap">
        <input className="input has-action" value={value ?? ''} disabled readOnly />
        <span className="input-action" aria-hidden="true">
          <Icon name="lock" size="sm" />
        </span>
      </div>
      {help && <span className="field-help">{help}</span>}
    </div>
  );
}

// SCR-04 Edit Profile (UC-06 Change Avatar). Only the avatar can be changed online; the rest is read only.
export default function EditAvatarPage() {
  const { loading, data, error: loadError } = useProfile();
  const { updateUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  if (loading) return <p className="loading">Đang tải hồ sơ…</p>;
  if (loadError) return <p className="form-error">{loadError}</p>;

  const { user, student, teacher, avatarMaxMb } = data;
  const code = student?.studentCode ?? teacher?.teacherCode;

  function pick(chosen) {
    setError('');
    if (!chosen) return;
    if (!ACCEPTED.includes(chosen.type)) return setError('Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.');
    if (chosen.size > avatarMaxMb * 1024 * 1024) return setError(`Ảnh vượt quá dung lượng cho phép (tối đa ${avatarMaxMb} MB).`);
    setFile(chosen);
    setPreview(URL.createObjectURL(chosen));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const form = new FormData();
      form.append('avatar', file);
      const { data: result } = await api.put('/account/avatar', form);
      updateUser({ avatarUrl: result.avatarUrl });
      toast('Đã cập nhật ảnh đại diện.');
      navigate('/profile');
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <div className="narrow">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<Link to="/profile">Hồ sơ cá nhân</Link>/<span className="current">Sửa ảnh đại diện</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Chỉnh sửa hồ sơ</h1>
          <p>Chỉ ảnh đại diện có thể cập nhật trực tuyến. Các thông tin khác do văn phòng nhà trường quản lý.</p>
        </div>
      </div>

      <section className="card card-outline">
        <h2 className="card-title title-sm">
          <Icon name="account_box" />
          Ảnh đại diện
        </h2>
        <div className="avatar-editor">
          <div className="current-box">
            <span className="label-upper">Hiện tại</span>
            <Avatar src={user.avatarUrl} name={user.fullName} size={80} />
            <div>
              <div style={{ fontWeight: 500 }}>{user.fullName}</div>
              {code && <div className="caption muted mono">Mã: {code}</div>}
            </div>
          </div>

          <div>
            <div
              className={`dropzone${dragging ? ' dragging' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files?.[0]);
              }}
            >
              <span className="upload-icon">
                <Icon name="cloud_upload" />
              </span>
              <p>
                Kéo ảnh vào đây hoặc <span style={{ color: 'var(--ink-700)', textDecoration: 'underline' }}>chọn tệp</span>
              </p>
              <p className="caption muted">
                Định dạng JPG, PNG hoặc WebP, tối đa {avatarMaxMb} MB. Nên dùng ảnh chân dung rõ nét, tỉ lệ vuông.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED.join(',')}
                hidden
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            {preview && (
              <div className="preview">
                <img src={preview} alt="Ảnh xem trước" />
                <div>
                  <div style={{ fontWeight: 500 }}>Ảnh mới</div>
                  <div className="caption muted">{file.name}</div>
                  <p className="caption muted" style={{ fontStyle: 'italic', marginTop: 4 }}>
                    Ảnh được hiển thị trong khung tròn, phần giữa ảnh sẽ được giữ lại.
                  </p>
                </div>
              </div>
            )}
            {error && (
              <p className="form-error" role="alert" style={{ marginTop: 12 }}>
                <Icon name="error" size="sm" />
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="section-sep" />

        <h2 className="card-title title-sm">
          <Icon name="assignment_ind" />
          Thông tin hồ sơ (chỉ đọc)
          <span className="aside stamp">Do nhà trường quản lý</span>
        </h2>
        <div className="notice amber" style={{ marginBottom: 20 }}>
          <Icon name="lock_person" />
          <p>
            Bạn không thể tự thay đổi họ tên, ngày sinh, lớp hay số điện thoại. Để điều chỉnh các thông tin này, vui lòng
            liên hệ văn phòng nhà trường.
          </p>
        </div>
        <div className="readonly-grid">
          <ReadOnlyField label="Họ và tên" value={user.fullName} />
          {student && (
            <ReadOnlyField
              label="Lớp"
              value={student.class?.name ?? ''}
              help={student.class?.homeroomTeacher && `GVCN: ${student.class.homeroomTeacher}`}
            />
          )}
          {!student && teacher && <ReadOnlyField label="Tổ chuyên môn" value={teacher.department} />}
          {!student && !teacher && <ReadOnlyField label="Tên đăng nhập" value={user.username} />}
          {code ? (
            <ReadOnlyField label={student ? 'Mã học sinh' : 'Mã giáo viên'} value={code} />
          ) : (
            <ReadOnlyField label="Số điện thoại" value={user.phone ?? ''} />
          )}
        </div>

        <div className="section-sep" />
        <div className="card-footer">
          <Link to="/profile" className="btn btn-secondary">
            Huỷ
          </Link>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!file || saving}>
            <Icon name="save" size="sm" />
            {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
        </div>
      </section>
    </div>
  );
}
