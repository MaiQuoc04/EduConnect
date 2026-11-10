import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { formatFileSize } from '../../utils/format.js';
import { AVATAR_IMAGE, MAX_SOURCE_MB, compressImageDetailed } from '../../utils/imageCompress.js';
import { useProfile } from './useProfile.js';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MB = 1024 * 1024;
const ADDRESS_MAX = 500;
const OCCUPATION_MAX = 100;

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

// SCR-33 Edit Profile (UC-06 Change Avatar, UC-107 Update Address, UC-108 Update Occupation). Only the avatar, the
// address and, for a parent, the occupation can be changed online; the rest is read only.
export default function EditAvatarPage() {
  const { loading, data, error: loadError } = useProfile();
  const { updateUser, activeRole } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [dragging, setDragging] = useState(false);
  const [address, setAddress] = useState(null); // null = not edited yet, show the saved one
  const [occupation, setOccupation] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false); // compressing the chosen image
  const [sizes, setSizes] = useState(null); // { before, after, status } of the chosen image
  const processingRef = useRef(false);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  if (loading) return <p className="loading">Đang tải hồ sơ…</p>;
  if (loadError) return <p className="form-error">{loadError}</p>;

  const { user, student, teacher, parent, avatarMaxMb } = data;
  const code = student?.studentCode ?? teacher?.teacherCode;
  const addressValue = address ?? user.address ?? '';
  const addressChanged = addressValue.trim() !== (user.address ?? '');
  // The occupation belongs to the parent record; it is edited with the Parent role active (server checks it too).
  const canEditOccupation = Boolean(parent) && activeRole === 'PARENT';
  const occupationValue = occupation ?? parent?.occupation ?? '';
  const occupationChanged = canEditOccupation && occupationValue.trim() !== (parent.occupation ?? '');

  // The image is shrunk in the browser first (Supabase Free cannot resize): the preview shows what will be saved, and
  // the size limit applies to that copy. The original only has a ceiling so a huge file cannot freeze the tab.
  async function pick(chosen) {
    if (!chosen || processingRef.current) return;
    setError('');
    if (!ACCEPTED.includes(chosen.type)) return setError('Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.');
    if (chosen.size > MAX_SOURCE_MB * MB) {
      return setError(`Ảnh gốc quá lớn để xử lý (tối đa ${MAX_SOURCE_MB} MB). Vui lòng chọn ảnh khác.`);
    }
    processingRef.current = true;
    setProcessing(true);
    setFile(null);
    setPreview('');
    setSizes(null);
    try {
      const result = await compressImageDetailed(chosen, AVATAR_IMAGE);
      if (result.status === 'unreadable') {
        return setError('Không đọc được ảnh này. Vui lòng chọn một ảnh JPG, PNG hoặc WebP khác.');
      }
      if (result.file.size > avatarMaxMb * MB) {
        return setError(`Ảnh vượt quá dung lượng cho phép (tối đa ${avatarMaxMb} MB).`);
      }
      setFile(result.file);
      setPreview(URL.createObjectURL(result.file));
      setSizes({ before: chosen.size, after: result.file.size, status: result.status });
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }

  const openPicker = () => !processing && !saving && inputRef.current?.click();

  async function save() {
    setSaving(true);
    setError('');
    try {
      if (file) {
        const form = new FormData();
        form.append('avatar', file);
        const { data: result } = await api.put('/account/avatar', form);
        updateUser({ avatarUrl: result.avatarUrl });
      }
      if (addressChanged) await api.put('/account/address', { address: addressValue });
      if (occupationChanged) await api.put('/account/occupation', { occupation: occupationValue });
      toast('Đã cập nhật hồ sơ.');
      navigate('/profile');
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <div className="narrow">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<Link to="/profile">Hồ sơ cá nhân</Link>/<span className="current">Chỉnh sửa hồ sơ</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Chỉnh sửa hồ sơ</h1>
          <p>Bạn có thể cập nhật ảnh đại diện và địa chỉ. Các thông tin khác do văn phòng nhà trường quản lý.</p>
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
              aria-disabled={processing || saving}
              onClick={openPicker}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openPicker()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!processing && !saving) pick(e.dataTransfer.files?.[0]);
              }}
            >
              <span className="upload-icon">
                <Icon name="cloud_upload" />
              </span>
              <p>
                Kéo ảnh vào đây hoặc <span style={{ color: 'var(--ink-700)', textDecoration: 'underline' }}>chọn tệp</span>
              </p>
              <p className="caption muted">
                Định dạng JPG, PNG hoặc WebP, tối đa {MAX_SOURCE_MB} MB. Ảnh được tự thu nhỏ trước khi tải lên. Nên dùng
                ảnh chân dung rõ nét, tỉ lệ vuông.
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
            {processing && (
              <div className="preview avatar-processing" role="status">
                <Icon name="progress_activity" className="avatar-spin" />
                <span>Đang xử lý ảnh…</span>
              </div>
            )}
            {preview && (
              <div className="preview">
                <img src={preview} alt="Ảnh xem trước" />
                <div className="preview-text">
                  <div style={{ fontWeight: 500 }}>Ảnh mới</div>
                  <div className="caption muted preview-name">{file.name}</div>
                  {sizes && (
                    <div className="caption mono">
                      {sizes.status === 'compressed'
                        ? `${formatFileSize(sizes.before)} → ${formatFileSize(sizes.after)}`
                        : `${formatFileSize(sizes.after)} · giữ nguyên ảnh gốc`}
                    </div>
                  )}
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
          <Icon name="home" />
          {canEditOccupation ? 'Thông tin liên hệ' : 'Địa chỉ'}
        </h2>
        {canEditOccupation && (
          <label className="field" style={{ marginBottom: 16 }}>
            <span className="field-label">
              Nghề nghiệp
              <span className="caption muted">
                {occupationValue.length}/{OCCUPATION_MAX}
              </span>
            </span>
            <input
              className="input"
              value={occupationValue}
              onChange={(e) => setOccupation(e.target.value.slice(0, OCCUPATION_MAX))}
              placeholder="Ví dụ: Kỹ sư xây dựng"
            />
          </label>
        )}
        <label className="field">
          <span className="field-label">
            Địa chỉ liên hệ
            <span className="caption muted">
              {addressValue.length}/{ADDRESS_MAX}
            </span>
          </span>
          <textarea
            className="input"
            value={addressValue}
            onChange={(e) => setAddress(e.target.value.slice(0, ADDRESS_MAX))}
            placeholder="Ví dụ: 12 Lê Lợi, phường Hải Châu, TP. Đà Nẵng"
          />
          <span className="field-help">Để trống nếu muốn xoá địa chỉ đã lưu.</span>
        </label>

        <div className="section-sep" />

        <h2 className="card-title title-sm">
          <Icon name="assignment_ind" />
          Thông tin hồ sơ (chỉ đọc)
          <span className="aside stamp">Do nhà trường quản lý</span>
        </h2>
        <div className="notice amber" style={{ marginBottom: 20 }}>
          <Icon name="lock_person" />
          <p>
            Bạn không thể tự thay đổi họ tên, ngày sinh, lớp, email hay số điện thoại. Để điều chỉnh các thông tin này, vui lòng
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
          <button type="button" className="btn btn-primary" onClick={save} disabled={(!file && !addressChanged && !occupationChanged) || saving || processing}>
            <Icon name="save" size="sm" />
            {saving ? 'Đang lưu…' : processing ? 'Đang xử lý ảnh…' : 'Lưu thay đổi'}
          </button>
        </div>
      </section>
    </div>
  );
}
