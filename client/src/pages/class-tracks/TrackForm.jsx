import { useState } from 'react';
import { api } from '../../api/client.js';
import { errorText } from '../../messages.js';

const NAME_CODES = ['MSG_TRACK_NAME_TAKEN', 'MSG_TRACK_NAME_LENGTH'];

// SCR-71 create / rename a class type (UC-26). `track` = the type being edited, or null to create one.
export default function TrackForm({ track, onSaved, onCancel }) {
  const editing = Boolean(track);
  const [form, setForm] = useState({ trackName: track?.trackName ?? '', description: track?.description ?? '' });
  const [error, setError] = useState(null); // { field: 'name' | null, text }
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.trackName.trim()) {
      setError({ field: 'name', text: errorText({ code: 'MSG_REQUIRED' }) });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data } = editing
        ? await api.put(`/class-tracks/${track.trackId}`, form)
        : await api.post('/class-tracks', form);
      onSaved(data, editing);
    } catch (err) {
      setError({ field: NAME_CODES.includes(err.code) ? 'name' : null, text: errorText(err) });
      setSaving(false);
    }
  }

  return (
    <form className="card card-outline form-card year-form" onSubmit={handleSubmit} noValidate>
      <div>
        <p className="label-upper muted">{editing ? 'Chỉnh sửa loại lớp' : 'Thêm loại lớp'}</p>
        <h2 className="title-md">{editing ? track.trackName : 'Loại lớp mới'}</h2>
      </div>

      <div className={`field${error?.field === 'name' ? ' invalid' : ''}`}>
        <label className="field-label" htmlFor="track-name">
          Tên loại lớp
        </label>
        <div className="input-wrap">
          <input
            id="track-name"
            className="input"
            value={form.trackName}
            onChange={set('trackName')}
            placeholder="Khối A"
            maxLength={100}
            autoFocus
          />
        </div>
        {error?.field === 'name' ? (
          <span className="field-error">{error.text}</span>
        ) : (
          <span className="field-help">Tên dùng khi tạo hoặc nhập danh sách lớp, ví dụ Khối A.</span>
        )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="track-description">
          Mô tả <span className="caption muted">Không bắt buộc</span>
        </label>
        <div className="input-wrap">
          <input
            id="track-description"
            className="input"
            value={form.description}
            onChange={set('description')}
            placeholder="Tự nhiên – trọng tâm Toán, Vật lí, Hoá học"
            maxLength={255}
          />
        </div>
      </div>

      {error && !error.field && (
        <p className="form-error" role="alert">
          {error.text}
        </p>
      )}

      <div className="card-footer">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Huỷ
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm loại lớp'}
        </button>
      </div>
    </form>
  );
}
